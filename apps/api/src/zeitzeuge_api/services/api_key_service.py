"""Issuing, listing, revoking and *authenticating* machine credentials.

The OAI-PMH harvester in §9.3 and the digitisation import script are not
people: they cannot complete an MFA challenge and they must not hold an
archivist's password. They hold a key, and a key is strictly weaker than the
human who issued it — same tenant, same or lower scope, and dead the moment
that human revokes it.

`authenticate` is the hot path: one indexed lookup on a SHA-256 digest, one
expiry check, one `last_used_at` write. The digest column is unique, so a
collision is a constraint violation rather than a silent takeover.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.db.models import ApiKey, ApiKeyScope, AuditAction, User, UserRole
from zeitzeuge_api.integrations.aws import ratelimit
from zeitzeuge_api.integrations.aws.ratelimit import RateLimiter
from zeitzeuge_api.schemas import api_key as schemas
from zeitzeuge_api.services import audit

KEY_PREFIX = "zz_live_"
_SECRET_BYTES = 32


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


class ApiKeyService:
    def __init__(self, *, limiter: RateLimiter) -> None:
        self._limiter = limiter

    async def create(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.CreateApiKeyRequest,
        context: RequestContext,
    ) -> schemas.ApiKeyCreated:
        if user.role is UserRole.GUEST:
            raise errors.ForbiddenError("The demo account cannot issue API keys.")
        if data.scope is ApiKeyScope.WRITE and not user.role.can_write:
            # A key cannot grant what its owner does not have.
            raise errors.ForbiddenError("This account may not issue write keys.")

        await self._limiter.check(
            action="api_key", identifier=str(user.id), limit=ratelimit.API_KEY_CREATE
        )

        secret = secrets.token_urlsafe(_SECRET_BYTES)
        token = f"{KEY_PREFIX}{secret}"
        expires_at = _now() + timedelta(days=data.expires_in_days) if data.expires_in_days else None

        row = ApiKey(
            org_id=user.org_id,
            user_id=user.id,
            name=data.name,
            # Enough to recognise the key in a list and in a log line; four
            # characters of a 256-bit secret is not a usable head start.
            prefix=f"{KEY_PREFIX}{secret[:4]}",
            token_hash=_hash(token),
            scope=data.scope,
            expires_at=expires_at,
            created_ip=context.ip_address,
        )
        session.add(row)
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.API_KEY_CREATED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            target_type="api_key",
            target_id=str(row.id),
            details={"name": row.name, "scope": str(row.scope)},
        )

        return schemas.ApiKeyCreated(
            id=str(row.id),
            name=row.name,
            prefix=row.prefix,
            scope=row.scope,
            created_at=row.created_at,
            expires_at=row.expires_at,
            secret=token,
        )

    async def list_for_user(self, session: AsyncSession, *, user: User) -> list[schemas.ApiKeyOut]:
        rows = await session.scalars(
            select(ApiKey)
            .where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc())
        )
        return [
            schemas.ApiKeyOut(
                id=str(row.id),
                name=row.name,
                prefix=row.prefix,
                scope=row.scope,
                created_at=row.created_at,
                last_used_at=row.last_used_at,
                expires_at=row.expires_at,
                revoked_at=row.revoked_at,
            )
            for row in rows
        ]

    async def revoke(
        self,
        session: AsyncSession,
        *,
        user: User,
        key_id: str,
        context: RequestContext,
    ) -> None:
        try:
            identifier = uuid.UUID(key_id)
        except (ValueError, TypeError) as exc:
            raise errors.NotFoundError("No such API key.") from exc

        row = await session.get(ApiKey, identifier)
        if row is None or row.user_id != user.id:
            raise errors.NotFoundError("No such API key.")
        if row.revoked_at is not None:
            return

        row.revoked_at = _now()
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.API_KEY_REVOKED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            target_type="api_key",
            target_id=key_id,
        )

    async def authenticate(self, session: AsyncSession, *, token: str) -> tuple[User, ApiKey]:
        """Resolve a presented key to its owner, or refuse."""
        if not token.startswith(KEY_PREFIX):
            raise errors.UnauthenticatedError("That is not a ZEITZEUGE API key.")

        row = await session.scalar(select(ApiKey).where(ApiKey.token_hash == _hash(token)))
        now = _now()
        if row is None or not row.is_usable(now=now):
            raise errors.UnauthenticatedError("That API key is not valid.")

        user = await session.get(User, row.user_id)
        if user is None or not user.is_active:
            raise errors.UnauthenticatedError("That API key is not valid.")

        # Written on every call: `/settings/api` shows "last used", and a key
        # with no recent use is the one an archive can safely retire.
        row.last_used_at = now
        await session.flush()
        return user, row
