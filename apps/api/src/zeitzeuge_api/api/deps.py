"""Dependencies — where a request becomes an identity.

`Identity` is what every authenticated route receives: the verified principal,
the user row, the archive, an open transaction already narrowed to that
archive, and the raw access token for the three operations Cognito insists on
performing as the user rather than as an administrator (change password, change
e-mail, enrol a second factor).

Two credentials are accepted and they are not equal:

* a **Cognito access token**, for a person in a browser;
* an **API key**, for the harvester and the import script — which additionally
  cannot reach anything that changes credentials, no matter what its owner may
  do, because a stolen key must not become a stolen account.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.config import Settings
from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.core.security import Principal, TokenVerifier
from zeitzeuge_api.db.models import ApiKeyScope, Organization, User, UserRole
from zeitzeuge_api.db.session import Database, TenantContext
from zeitzeuge_api.services.api_key_service import KEY_PREFIX, ApiKeyService
from zeitzeuge_api.services.auth_service import AuthService
from zeitzeuge_api.services.user_service import UserService

# Declared as a security scheme rather than read as a raw header, so the
# generated OpenAPI document carries `bearerAuth` — which is what gives
# /docs its Authorize button and lets a judge paste a token once and exercise
# every protected endpoint from the browser.
bearer_scheme = HTTPBearer(
    scheme_name="bearerAuth",
    description=(
        "A Cognito **access token** from `POST /auth/login`, or a ZEITZEUGE "
        "**API key** (`zz_live_…`). An API key may not reach anything that "
        "changes a credential."
    ),
    auto_error=False,
)


@dataclass(slots=True)
class Identity:
    principal: Principal
    user: User
    organization: Organization
    session: AsyncSession
    context: RequestContext
    access_token: str | None = None

    @property
    def is_api_key(self) -> bool:
        return self.principal.via_api_key

    def require_user_token(self) -> str:
        """For operations Cognito performs as the user, not as an admin."""
        if self.access_token is None or self.principal.via_api_key:
            raise errors.ForbiddenError(
                "This operation requires an interactive sign-in, not an API key."
            )
        return self.access_token


# --- application state -----------------------------------------------------


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_database(request: Request) -> Database:
    database: Database | None = getattr(request.app.state, "database", None)
    if database is None:
        # Startup was degraded (see `main.lifespan`). Say so honestly rather
        # than raising an AttributeError the caller cannot interpret.
        raise errors.ConfigurationError("The database is not available.")
    return database


def get_verifier(request: Request) -> TokenVerifier:
    verifier: TokenVerifier | None = getattr(request.app.state, "verifier", None)
    if verifier is None:
        raise errors.ConfigurationError("Token verification is not available.")
    return verifier


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


def get_user_service(request: Request) -> UserService:
    return request.app.state.user_service


def get_api_key_service(request: Request) -> ApiKeyService:
    return request.app.state.api_key_service


def get_context(request: Request) -> RequestContext:
    context: RequestContext | None = getattr(request.state, "context", None)
    if context is None:  # pragma: no cover - middleware always sets it
        return RequestContext(request_id=uuid.uuid4().hex)
    return context


# --- sessions ---------------------------------------------------------------


async def bootstrap_session(
    database: Annotated[Database, Depends(get_database)],
) -> AsyncIterator[AsyncSession]:
    """A transaction for the unauthenticated routes (`/auth/*`)."""
    async with database.session(TenantContext.bootstrap()) as session:
        yield session


# --- identity ---------------------------------------------------------------


async def resolve_identity(
    request: Request,
    database: Annotated[Database, Depends(get_database)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
    api_keys: Annotated[ApiKeyService, Depends(get_api_key_service)],
    context: Annotated[RequestContext, Depends(get_context)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> AsyncIterator[Identity]:
    # `auto_error=False`, so a missing or non-Bearer header arrives as None and
    # is refused here in our own error shape rather than Starlette's.
    if credentials is None or not credentials.credentials.strip():
        raise errors.UnauthenticatedError()
    token = credentials.credentials.strip()

    async with database.session(TenantContext.bootstrap()) as session:
        if token.startswith(KEY_PREFIX):
            user, key = await api_keys.authenticate(session, token=token)
            principal = Principal(
                subject=user.cognito_sub,
                username=user.cognito_username,
                email=user.email,
                org_id=str(user.org_id),
                role=str(user.role),
                token_use="api_key",
                via_api_key=True,
                api_key_scope=str(key.scope),
            )
            access_token = None
        else:
            principal = await verifier.verify(token, expected_use="access")
            user = await _load_user(session, principal)
            access_token = token

        organization = await session.get(Organization, user.org_id)
        if organization is None:  # pragma: no cover - FK guarantees it
            raise errors.ForbiddenError("This account is not attached to an archive.")

        if not user.is_active:
            raise errors.AccountDisabledError()

        # From here on the transaction can only see this archive's rows.
        await database.set_tenant(
            session,
            TenantContext(org_id=user.org_id, user_id=user.id, role=str(user.role)),
        )

        yield Identity(
            principal=principal,
            user=user,
            organization=organization,
            session=session,
            context=context,
            access_token=access_token,
        )


async def _load_user(session: AsyncSession, principal: Principal) -> User:
    user = await session.scalar(select(User).where(User.cognito_sub == principal.subject))
    if user is None:
        # The token is genuine but no row exists — the pool and the database
        # have diverged (a user created in the console, or a failed sign-up).
        # Signing in once repairs it, because that path syncs the row.
        raise errors.ForbiddenError(
            "This identity is not provisioned for an archive. Sign in again, or ask an "
            "administrator to invite it."
        )
    return user


CurrentIdentity = Annotated[Identity, Depends(resolve_identity)]


def require_roles(*roles: UserRole) -> Callable[[Identity], Identity]:
    """Route guard. Reads the *row*, not the token.

    A group claim is a snapshot taken when the token was issued; a role that
    was revoked five minutes ago is still in it. The row is current, and an
    access token lives an hour.
    """
    allowed = set(roles)

    def _guard(identity: CurrentIdentity) -> Identity:
        if identity.user.role not in allowed:
            raise errors.ForbiddenError("This account does not hold a role permitted to do that.")
        return identity

    return _guard


def require_write(identity: CurrentIdentity) -> Identity:
    """Reject read-only callers: the demo guest, readers, and read-scoped keys."""
    if identity.is_api_key and identity.principal.api_key_scope != str(ApiKeyScope.WRITE):
        raise errors.ForbiddenError("This API key is read-only.")
    if not identity.user.role.can_write:
        raise errors.ForbiddenError("This account is read-only.")
    return identity


WriteIdentity = Annotated[Identity, Depends(require_write)]
