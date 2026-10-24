"""Registration, sign-in, and everything that can change a password.

The service owns the *sequence*; Cognito owns the credential and the database
owns the archive's view of the person. Three rules run through every method:

1. **Cognito first, database second.** The credential store is the source of
   truth for identity. A row is written only after Cognito has accepted the
   operation, so a failed sign-up cannot leave a phantom archivist behind.
2. **Never reveal whether an address is registered.** Sign-in, password reset
   and code resend all answer identically for an unknown address. Only
   registration can leak — see `register` — and that leak is bounded by the
   rate limiter.
3. **Every state change is audited**, including the failures. A sign-in that
   did not happen is the more interesting row.
"""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.core.time import as_aware
from zeitzeuge_api.db.models import (
    AuditAction,
    Organization,
    OrganizationDomain,
    OrganizationKind,
    User,
    UserPreferences,
    UserRole,
    UserSession,
    UserStatus,
)
from zeitzeuge_api.db.session import Database
from zeitzeuge_api.integrations.aws import ratelimit
from zeitzeuge_api.integrations.aws.cognito import (
    AuthContext,
    AuthOutcome,
    CognitoIdentityProvider,
    CognitoUser,
    TokenBundle,
)
from zeitzeuge_api.integrations.aws.ratelimit import RateLimiter
from zeitzeuge_api.schemas import auth as schemas
from zeitzeuge_api.services import audit

log = get_logger(__name__)

# A shared mailbox provider is not evidence of a shared employer, so an address
# at one of these never joins an existing tenant.
PUBLIC_MAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "yahoo.com",
        "icloud.com",
        "me.com",
        "gmx.ch",
        "gmx.net",
        "gmx.de",
        "bluewin.ch",
        "hispeed.ch",
        "sunrise.ch",
        "protonmail.com",
        "proton.me",
        "posteo.de",
        "mailbox.org",
        "web.de",
        "t-online.de",
    }
)

_SLUG_RE = re.compile(r"[^a-z0-9]+")


RESERVED_SLUGS = frozenset({"stasz", "demo", "demo-staatsarchiv-schwyz"})


def _slugify(value: str) -> str:
    base = value.lower()
    for source, target in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        base = base.replace(source, target)
    return _SLUG_RE.sub("-", base).strip("-")[:48] or "archiv"


def _now() -> datetime:
    return datetime.now(UTC)


class AuthService:
    def __init__(
        self,
        *,
        cognito: CognitoIdentityProvider,
        limiter: RateLimiter,
        database: Database,
        guest_username: str = "",
        guest_password: str = "",
        session_idle_days: int = 30,
    ) -> None:
        self._cognito = cognito
        self._limiter = limiter
        # Held only so a failed sign-in can be audited on its own connection —
        # the request's transaction is about to be rolled back.
        self._database = database
        self._guest_username = guest_username
        self._guest_password = guest_password
        self._session_idle_days = session_idle_days

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    async def register(
        self,
        session: AsyncSession,
        data: schemas.RegisterRequest,
        context: RequestContext,
    ) -> schemas.RegisterResponse:
        """Create the Cognito account and the pending user row.

        This endpoint *can* reveal that an address is already registered — the
        web app has a distinct `email_in_use` state and a sign-up form that
        silently did nothing would be worse for the archivist than the leak is
        for the attacker. The leak is bounded by a five-per-hour limit per IP.
        """
        await self._limiter.check(
            action="register",
            identifier=context.ip_address or "anonymous",
            limit=ratelimit.REGISTER,
        )

        organization, role = await self._resolve_organization(
            session,
            email=data.email,
            organization_name=data.organization_name,
            canton=data.canton,
        )

        # Cognito is authoritative. If this raises, no row is written.
        attributes = {
            "locale": data.locale,
            "custom:tenant_id": str(organization.id),
            "custom:role": str(role),
        }
        if data.full_name:
            # Optional at sign-up; an empty `name` is not a value worth storing.
            attributes["name"] = data.full_name
        sub = await self._cognito.sign_up(
            email=data.email, password=data.password, attributes=attributes
        )

        user = User(
            org_id=organization.id,
            cognito_sub=sub,
            cognito_username=data.email,
            email=data.email,
            email_verified=False,
            full_name=data.full_name or "",
            job_title=data.job_title,
            locale=data.locale,
            role=role,
            status=UserStatus.PENDING,
            terms_accepted_at=_now(),
        )
        user.preferences = UserPreferences()
        session.add(user)
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.USER_REGISTERED,
            context=context,
            org_id=organization.id,
            actor_user_id=user.id,
            actor_email=user.email,
            details={"organization": organization.slug, "role": str(role)},
        )
        log.info("auth.registered", user_id=str(user.id), org=organization.slug)

        return schemas.RegisterResponse(user_id=str(user.id), email=user.email)

    async def _resolve_organization(
        self,
        session: AsyncSession,
        *,
        email: str,
        organization_name: str | None,
        canton: str | None,
    ) -> tuple[Organization, UserRole]:
        """Join an archive by verified mail domain, or found a new tenant.

        Joining is *only* by domain. Matching the name the registrant typed
        would let anyone who can spell "Staatsarchiv Schwyz" into Schwyz's
        tenant, and RLS cannot save you from a user legitimately placed in the
        wrong organisation.
        """
        domain = email.rpartition("@")[2].lower()
        if domain and domain not in PUBLIC_MAIL_DOMAINS:
            match = await session.scalar(
                select(OrganizationDomain).where(OrganizationDomain.domain == domain)
            )
            if match is not None:
                organization = await session.get(Organization, match.org_id)
                if organization is not None:
                    role = UserRole(match.default_role)
                    log.info("auth.joined_existing_org", org=organization.slug, role=str(role))
                    return organization, role

        name = (organization_name or "").strip() or f"Arbeitsbereich {email.split('@')[0]}"
        slug = await self._unique_slug(session, _slugify(name))
        organization = Organization(
            slug=slug,
            name=name,
            kind=OrganizationKind.ARCHIVE if organization_name else OrganizationKind.PERSONAL,
            canton=(canton or "").upper() or None,
            contact_email=email,
        )
        session.add(organization)
        await session.flush()

        # The founder administers their own tenant; colleagues who join later
        # by domain arrive with the domain's default role instead.
        if domain and domain not in PUBLIC_MAIL_DOMAINS and organization_name:
            session.add(
                OrganizationDomain(
                    org_id=organization.id, domain=domain, default_role=str(UserRole.REVIEWER)
                )
            )
            await session.flush()

        return organization, UserRole.ADMIN

    @staticmethod
    async def _unique_slug(session: AsyncSession, base: str) -> str:
        slug = base
        for attempt in range(2, 12):
            taken = await session.scalar(select(Organization.id).where(Organization.slug == slug))
            # The seed's archives (`stasz`, `demo`) carry privileges — publishing
            # into the guest's view — so sign-up can never claim their slugs.
            if taken is None and slug not in RESERVED_SLUGS:
                return slug
            slug = f"{base}-{attempt}"
        return f"{base}-{secrets.token_hex(3)}"

    async def verify_email(
        self,
        session: AsyncSession,
        data: schemas.VerifyEmailRequest,
        context: RequestContext,
    ) -> None:
        await self._cognito.confirm_sign_up(email=data.email, code=data.code)

        user = await session.scalar(select(User).where(User.email == data.email))
        if user is not None:
            user.email_verified = True
            if user.status is UserStatus.PENDING:
                user.status = UserStatus.ACTIVE
            await session.flush()
            # Groups carry the role into the token, so the frontend and any
            # future service can authorise without a database round trip.
            await self._cognito.add_to_group(username=user.cognito_username, group=str(user.role))
            await audit.record(
                session,
                action=AuditAction.USER_VERIFIED,
                context=context,
                org_id=user.org_id,
                actor_user_id=user.id,
                actor_email=user.email,
            )

    async def resend_verification(
        self,
        session: AsyncSession,
        data: schemas.ResendCodeRequest,
        context: RequestContext,
    ) -> None:
        await self._limiter.check(
            action="resend",
            identifier=data.email,
            limit=ratelimit.VERIFICATION_RESEND,
        )
        try:
            await self._cognito.resend_confirmation_code(email=data.email)
        except errors.AppError as exc:
            # An unknown address, or one already confirmed, must look exactly
            # like a successful resend. Only throttling is worth reporting.
            if isinstance(exc, errors.RateLimitedError):
                raise
            log.info("auth.resend_suppressed", code=exc.code)

    # ------------------------------------------------------------------
    # Sign-in
    # ------------------------------------------------------------------

    async def login(
        self,
        session: AsyncSession,
        data: schemas.LoginRequest,
        context: RequestContext,
    ) -> schemas.LoginResponse:
        await self._limiter.check(
            action="login",
            identifier=f"{data.email}|{context.ip_address or '-'}",
            limit=ratelimit.LOGIN,
        )

        auth_context = AuthContext(
            ip_address=context.ip_address,
            user_agent=context.user_agent,
            server_path="/api/v1/auth/login",
        )

        try:
            outcome = await self._cognito.authenticate(
                email=data.email, password=data.password, context=auth_context
            )
        except errors.AppError as exc:
            await audit.record_out_of_band(
                self._database,
                action=AuditAction.USER_LOGIN_FAILED,
                context=context,
                actor_email=data.email,
                details={"reason": exc.code},
            )
            raise

        if outcome.is_challenge:
            return schemas.LoginResponse(
                challenge=self._challenge_payload(outcome, username=data.email)
            )

        assert outcome.tokens is not None
        tokens = await self._finalise_login(
            session, tokens=outcome.tokens, username=data.email, context=context
        )
        return schemas.LoginResponse(tokens=tokens)

    async def answer_challenge(
        self,
        session: AsyncSession,
        data: schemas.ChallengeAnswerRequest,
        context: RequestContext,
    ) -> schemas.LoginResponse:
        responses = self._challenge_responses(data)
        outcome = await self._cognito.respond_to_challenge(
            challenge_name=data.challenge,
            session=data.session,
            username=data.username,
            responses=responses,
            context=AuthContext(
                ip_address=context.ip_address,
                user_agent=context.user_agent,
                server_path="/api/v1/auth/challenge",
            ),
        )
        if outcome.is_challenge:
            return schemas.LoginResponse(
                challenge=self._challenge_payload(outcome, username=data.username)
            )

        assert outcome.tokens is not None
        tokens = await self._finalise_login(
            session, tokens=outcome.tokens, username=data.username, context=context
        )
        return schemas.LoginResponse(tokens=tokens)

    @staticmethod
    def _challenge_responses(data: schemas.ChallengeAnswerRequest) -> dict[str, str]:
        if data.challenge == "SOFTWARE_TOKEN_MFA":
            if not data.code:
                raise errors.InvalidRequestError("A one-time code is required.")
            return {"SOFTWARE_TOKEN_MFA_CODE": data.code}
        if data.challenge == "SMS_MFA":
            if not data.code:
                raise errors.InvalidRequestError("A one-time code is required.")
            return {"SMS_MFA_CODE": data.code}
        if not data.new_password:
            raise errors.InvalidRequestError("A new password is required.")
        return {"NEW_PASSWORD": data.new_password}

    @staticmethod
    def _challenge_payload(outcome: AuthOutcome, *, username: str) -> schemas.ChallengeResponse:
        if not outcome.challenge_name or not outcome.challenge_session:
            raise errors.UpstreamError("The identity provider returned an unusable challenge.")
        if outcome.challenge_name not in {"SOFTWARE_TOKEN_MFA", "SMS_MFA", "NEW_PASSWORD_REQUIRED"}:
            # Device-SRP and friends are not enabled on this pool; refusing is
            # safer than handing the client a challenge it cannot answer.
            raise errors.UpstreamError("The identity provider requested an unsupported step.")
        return schemas.ChallengeResponse(
            challenge=outcome.challenge_name,  # type: ignore[arg-type]
            session=outcome.challenge_session,
            username=outcome.challenge_parameters.get("USER_ID_FOR_SRP", username),
            parameters={
                key: value
                for key, value in outcome.challenge_parameters.items()
                if key in {"FRIENDLY_DEVICE_NAME", "CODE_DELIVERY_DESTINATION"}
            },
        )

    async def _finalise_login(
        self,
        session: AsyncSession,
        *,
        tokens: TokenBundle,
        username: str,
        context: RequestContext,
    ) -> schemas.SessionTokens:
        """Sync the row, check the archive still wants this person, open a session."""
        cognito_user = await self._cognito.get_user(username=username)
        user = await self.sync_user(session, cognito_user, authenticated=True)

        if user.status is UserStatus.SUSPENDED or user.deleted_at is not None:
            # Cognito authenticated them; the archive has not. Suspension is an
            # organisational decision, so it lives here and is enforced here.
            await audit.record_out_of_band(
                self._database,
                action=AuditAction.USER_LOGIN_FAILED,
                context=context,
                org_id=user.org_id,
                actor_user_id=user.id,
                actor_email=user.email,
                details={"reason": "account_disabled"},
            )
            raise errors.AccountDisabledError()

        now = _now()
        user.last_login_at = now
        user.last_seen_at = now

        sign_in = UserSession(
            org_id=user.org_id,
            user_id=user.id,
            cognito_username=cognito_user.username,
            device_label=context.device,
            user_agent=(context.user_agent or "")[:512] or None,
            ip_address=context.ip_address,
            location=context.location,
            last_seen_at=now,
            expires_at=now + timedelta(days=self._session_idle_days),
        )
        session.add(sign_in)
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.USER_LOGIN,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            target_type="session",
            target_id=str(sign_in.id),
        )

        return schemas.SessionTokens(
            access_token=tokens.access_token,
            id_token=tokens.id_token,
            refresh_token=tokens.refresh_token,
            expires_in=tokens.expires_in,
            session_id=str(sign_in.id),
        )

    async def sync_user(
        self, session: AsyncSession, cognito_user: CognitoUser, *, authenticated: bool = False
    ) -> User:
        """Reconcile the row with the pool, keyed on `sub`.

        Called on every sign-in, which makes the pool the authority for e-mail
        and MFA state and lets an out-of-band change (an administrator resetting
        MFA in the console) reach the application without a migration or a job.
        """
        user = await session.scalar(select(User).where(User.cognito_sub == cognito_user.sub))

        if user is None:
            # A user created directly in the pool — the seeded guest, or an
            # administrator's console action. Adopt them rather than refusing:
            # the alternative is an account that can authenticate and then
            # meets a 500.
            org_id = cognito_user.attr("custom:tenant_id")
            organization = (
                await session.get(Organization, uuid.UUID(org_id)) if _is_uuid(org_id) else None
            )
            if organization is None:
                raise errors.ForbiddenError(
                    "This identity is not attached to an archive. "
                    "Ask an administrator to invite it."
                )
            user = User(
                org_id=organization.id,
                cognito_sub=cognito_user.sub,
                cognito_username=cognito_user.username,
                email=cognito_user.email.lower(),
                full_name=cognito_user.attr("name") or cognito_user.email,
                locale=cognito_user.attr("locale", "de")[:5],
                role=_role_or_default(cognito_user.attr("custom:role")),
            )
            user.preferences = UserPreferences()
            session.add(user)

        user.cognito_username = cognito_user.username
        user.email = cognito_user.email.lower() or user.email
        user.email_verified = cognito_user.email_verified
        user.mfa_enabled = cognito_user.mfa_enabled
        if user.status is UserStatus.PENDING and (authenticated or cognito_user.email_verified):
            # Cognito refuses to authenticate an unconfirmed account, so a
            # successful sign-in *is* the confirmation — whether or not the
            # pool chose to flip `email_verified` while doing it.
            user.status = UserStatus.ACTIVE
        if not cognito_user.enabled and user.status is UserStatus.ACTIVE:
            user.status = UserStatus.SUSPENDED

        await session.flush()
        return user

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    async def refresh(
        self,
        session: AsyncSession,
        data: schemas.RefreshRequest,
        context: RequestContext,
    ) -> schemas.SessionTokens:
        sign_in = await self._active_session(session, data.session_id)
        tokens = await self._cognito.refresh(
            refresh_token=data.refresh_token, username=sign_in.cognito_username
        )

        now = _now()
        sign_in.last_seen_at = now
        sign_in.expires_at = now + timedelta(days=self._session_idle_days)
        user = await session.get(User, sign_in.user_id)
        if user is not None:
            if not user.is_active:
                raise errors.AccountDisabledError()
            user.last_seen_at = now
        await session.flush()

        return schemas.SessionTokens(
            access_token=tokens.access_token,
            id_token=tokens.id_token,
            # Cognito only returns a new refresh token when rotation is on;
            # otherwise the client keeps the one it has.
            refresh_token=tokens.refresh_token,
            expires_in=tokens.expires_in,
            session_id=str(sign_in.id),
        )

    async def logout(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.LogoutRequest,
        context: RequestContext,
    ) -> None:
        now = _now()
        if data.all_devices:
            await self._cognito.global_sign_out(username=user.cognito_username)
            rows = await session.scalars(
                select(UserSession).where(
                    UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
                )
            )
            for row in rows:
                row.revoked_at = now
                row.revoked_reason = "logout_all"
            action = AuditAction.SESSIONS_REVOKED_ALL
        else:
            if data.refresh_token:
                # Best effort: a token already expired or revoked is a success
                # from the caller's point of view.
                try:
                    await self._cognito.revoke_refresh_token(refresh_token=data.refresh_token)
                except errors.AppError as exc:
                    log.info("auth.revoke_noop", code=exc.code)
            if context.session_id:
                current = await session.get(UserSession, _as_uuid(context.session_id))
                if current is not None and current.user_id == user.id:
                    current.revoked_at = now
                    current.revoked_reason = "logout"
            action = AuditAction.USER_LOGOUT

        await session.flush()
        await audit.record(
            session,
            action=action,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
        )

    async def _active_session(self, session: AsyncSession, session_id: str) -> UserSession:
        row = await session.get(UserSession, _as_uuid(session_id))
        if row is None or row.revoked_at is not None:
            raise errors.UnauthenticatedError("This session is no longer valid.")
        expires_at = as_aware(row.expires_at)
        if expires_at is not None and expires_at < _now():
            raise errors.UnauthenticatedError("This session has expired.")
        return row

    # ------------------------------------------------------------------
    # Passwords
    # ------------------------------------------------------------------

    async def forgot_password(
        self,
        session: AsyncSession,
        data: schemas.ForgotPasswordRequest,
        context: RequestContext,
    ) -> None:
        """Always succeeds, as far as the caller can tell.

        The response is identical for a registered and an unregistered address.
        The only channel that confirms an address exists is the mail that
        arrives at it — which is the one channel an attacker does not read.
        """
        await self._limiter.check(
            action="forgot",
            identifier=f"{data.email}|{context.ip_address or '-'}",
            limit=ratelimit.PASSWORD_RESET,
        )
        try:
            await self._cognito.forgot_password(email=data.email)
        except errors.AppError as exc:
            if isinstance(exc, errors.RateLimitedError):
                raise
            log.info("auth.forgot_suppressed", code=exc.code)

        await audit.record(
            session,
            action=AuditAction.USER_PASSWORD_RESET_REQUESTED,
            context=context,
            actor_email=data.email,
        )

    async def reset_password(
        self,
        session: AsyncSession,
        data: schemas.ResetPasswordRequest,
        context: RequestContext,
    ) -> None:
        await self._cognito.confirm_forgot_password(
            email=data.email, code=data.code, new_password=data.new_password
        )

        user = await session.scalar(select(User).where(User.email == data.email))
        if user is not None:
            # A reset is how an account is recovered *and* how it is stolen.
            # Every other session dies with the old password.
            await self._cognito.global_sign_out(username=user.cognito_username)
            rows = await session.scalars(
                select(UserSession).where(
                    UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
                )
            )
            now = _now()
            for row in rows:
                row.revoked_at = now
                row.revoked_reason = "password_reset"
            if user.status is UserStatus.PENDING:
                # Confirming a reset code proves control of the mailbox.
                user.status = UserStatus.ACTIVE
                user.email_verified = True
            await session.flush()

        await audit.record(
            session,
            action=AuditAction.USER_PASSWORD_RESET,
            context=context,
            org_id=user.org_id if user else None,
            actor_user_id=user.id if user else None,
            actor_email=data.email,
        )

    async def change_password(
        self,
        session: AsyncSession,
        *,
        user: User,
        access_token: str,
        data: schemas.ChangePasswordRequest,
        context: RequestContext,
    ) -> None:
        if data.current_password == data.new_password:
            raise errors.InvalidRequestError("The new password must differ from the old one.")
        await self._cognito.change_password(
            access_token=access_token,
            current_password=data.current_password,
            new_password=data.new_password,
        )
        await audit.record(
            session,
            action=AuditAction.USER_PASSWORD_CHANGED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
        )

    # ------------------------------------------------------------------
    # MFA
    # ------------------------------------------------------------------

    async def begin_totp(self, *, access_token: str, user: User) -> schemas.TotpEnrolmentResponse:
        secret = await self._cognito.begin_totp_enrolment(access_token=access_token)
        issuer = "ZEITZEUGE"
        uri = (
            f"otpauth://totp/{issuer}:{user.email}?secret={secret}"
            f"&issuer={issuer}&algorithm=SHA1&digits=6&period=30"
        )
        return schemas.TotpEnrolmentResponse(secret=secret, otpauth_uri=uri)

    async def confirm_totp(
        self,
        session: AsyncSession,
        *,
        access_token: str,
        user: User,
        data: schemas.TotpConfirmRequest,
        context: RequestContext,
    ) -> None:
        await self._cognito.confirm_totp_enrolment(
            access_token=access_token, code=data.code, device_name=data.device_name
        )
        await self._cognito.set_totp_preference(username=user.cognito_username, enabled=True)
        user.mfa_enabled = True
        await session.flush()
        await audit.record(
            session,
            action=AuditAction.USER_MFA_ENABLED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
        )

    async def disable_totp(
        self,
        session: AsyncSession,
        *,
        user: User,
        context: RequestContext,
    ) -> None:
        await self._cognito.set_totp_preference(username=user.cognito_username, enabled=False)
        user.mfa_enabled = False
        await session.flush()
        await audit.record(
            session,
            action=AuditAction.USER_MFA_DISABLED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
        )

    # ------------------------------------------------------------------
    # The demo path
    # ------------------------------------------------------------------

    async def start_guest_session(
        self,
        session: AsyncSession,
        context: RequestContext,
    ) -> schemas.GuestSessionResponse:
        """A judge must never meet a signup wall (§9.2 screen 2).

        This is a genuine Cognito sign-in as a seeded, read-only user in the
        demo tenant — not a token this service mints for itself. There is
        exactly one authentication path in the system, and the demo uses it.
        """
        if not self._guest_username or not self._guest_password:
            raise errors.ConfigurationError("The demo account is not configured.")

        outcome = await self._cognito.authenticate(
            email=self._guest_username,
            password=self._guest_password,
            context=AuthContext(
                ip_address=context.ip_address,
                user_agent=context.user_agent,
                server_path="/api/v1/auth/guest",
            ),
        )
        if outcome.is_challenge or outcome.tokens is None:
            raise errors.ConfigurationError("The demo account requires an interactive step.")

        tokens = await self._finalise_login(
            session, tokens=outcome.tokens, username=self._guest_username, context=context
        )
        user = await session.scalar(select(User).where(User.email == self._guest_username.lower()))
        if user is None:  # pragma: no cover - _finalise_login always syncs one
            raise errors.ConfigurationError("The demo account is not provisioned.")

        await audit.record(
            session,
            action=AuditAction.GUEST_SESSION_STARTED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
        )
        return schemas.GuestSessionResponse(tokens=tokens, organization_id=str(user.org_id))


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        raise errors.InvalidRequestError("That identifier is not well-formed.") from exc


def _role_or_default(value: str) -> UserRole:
    try:
        return UserRole(value)
    except ValueError:
        return UserRole.READER
