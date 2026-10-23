"""The profile, the preferences, the picture, and ending a session.

Everything here acts on *the caller's own* user row. There is no `user_id`
parameter on any of these methods, which is the cheapest possible defence
against the most common authorisation bug in an application like this: an
endpoint that takes an id and forgets to check it.

Where a change has to exist in two places — a name, a locale, an avatar, all of
which also live on the Cognito profile so they can ride in the id token — the
database write and the Cognito write happen in that order, and the Cognito
failure is not fatal. A stale `name` attribute is a cosmetic problem; a profile
edit that appears to fail after it has been saved is a support call.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.db.models import (
    AuditAction,
    Organization,
    User,
    UserPreferences,
    UserSession,
    UserStatus,
)
from zeitzeuge_api.integrations.aws import ratelimit
from zeitzeuge_api.integrations.aws.cognito import CognitoIdentityProvider
from zeitzeuge_api.integrations.aws.ratelimit import RateLimiter
from zeitzeuge_api.integrations.aws.s3 import AvatarStorage
from zeitzeuge_api.schemas import user as schemas
from zeitzeuge_api.services import audit

log = get_logger(__name__)


def _now() -> datetime:
    return datetime.now(UTC)


class UserService:
    def __init__(
        self,
        *,
        cognito: CognitoIdentityProvider,
        avatars: AvatarStorage,
        limiter: RateLimiter,
    ) -> None:
        self._cognito = cognito
        self._avatars = avatars
        self._limiter = limiter

    # ------------------------------------------------------------------
    # Profile
    # ------------------------------------------------------------------

    def to_profile(self, user: User, organization: Organization) -> schemas.UserProfile:
        return schemas.UserProfile(
            id=str(user.id),
            email=user.email,
            email_verified=user.email_verified,
            pending_email=user.pending_email,
            full_name=user.full_name,
            initials=user.initials,
            job_title=user.job_title,
            department=user.department,
            phone=user.phone,
            bio=user.bio,
            locale=user.locale,  # type: ignore[arg-type]
            timezone=user.timezone,
            role=user.role,
            status=user.status,
            mfa_enabled=user.mfa_enabled,
            avatar_url=self._avatars.view_url(user.avatar_key),
            organization=schemas.OrganizationSummary(
                id=str(organization.id),
                slug=organization.slug,
                name=organization.name,
                kind=str(organization.kind),
                canton=organization.canton,
                isil=organization.isil,
                is_demo=organization.is_demo,
            ),
            member_since=user.created_at,
            last_login_at=user.last_login_at,
        )

    async def update_profile(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.UpdateProfileRequest,
        context: RequestContext,
    ) -> User:
        changes = data.model_dump(exclude_unset=True)
        if not changes:
            return user

        for field, value in changes.items():
            setattr(user, field, value)
        await session.flush()

        # Mirror the two attributes the token carries. Never fatal.
        attributes = {}
        if "full_name" in changes:
            attributes["name"] = user.full_name
        if "locale" in changes:
            attributes["locale"] = user.locale
        if attributes:
            try:
                await self._cognito.update_attributes(
                    username=user.cognito_username, attributes=attributes
                )
            except errors.AppError as exc:
                log.warning("user.attribute_sync_failed", code=exc.code, user_id=str(user.id))

        await audit.record(
            session,
            action=AuditAction.USER_PROFILE_UPDATED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            details={"fields": sorted(changes)},
        )
        return user

    # ------------------------------------------------------------------
    # Preferences
    # ------------------------------------------------------------------

    async def get_preferences(
        self, session: AsyncSession, *, user: User
    ) -> schemas.UserPreferencesOut:
        row = await self._preferences_row(session, user)
        return schemas.UserPreferencesOut(
            appearance=schemas.AppearancePreferences(
                theme=row.theme,  # type: ignore[arg-type]
                reduced_motion=row.reduced_motion,
                high_contrast=row.high_contrast,
            ),
            notifications=schemas.NotificationPreferences(
                email_queue_ready=row.email_queue_ready,
                email_hypothesis_refuted=row.email_hypothesis_refuted,
                email_batch_complete=row.email_batch_complete,
                email_weekly_digest=row.email_weekly_digest,
                inapp_queue_ready=row.inapp_queue_ready,
                inapp_hypothesis_refuted=row.inapp_hypothesis_refuted,
                inapp_batch_complete=row.inapp_batch_complete,
                inapp_weekly_digest=row.inapp_weekly_digest,
            ),
            cataloguing=schemas.CataloguingPreferences(
                default_run_mode=row.default_run_mode,  # type: ignore[arg-type]
                auto_accept_threshold=row.auto_accept_threshold,
                allow_abstention=row.allow_abstention,
                default_collection=row.default_collection,
                default_export_format=row.default_export_format,  # type: ignore[arg-type]
            ),
        )

    async def update_preferences(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.UpdatePreferencesRequest,
        context: RequestContext,
    ) -> schemas.UserPreferencesOut:
        row = await self._preferences_row(session, user)
        changed: list[str] = []

        for group in ("appearance", "notifications", "cataloguing"):
            payload = getattr(data, group)
            if payload is None:
                continue
            for field, value in payload.model_dump(exclude_unset=True).items():
                setattr(row, field, value)
                changed.append(field)

        await session.flush()

        details: dict[str, object] = {"fields": sorted(changed)}
        if data.cataloguing is not None and not row.allow_abstention:
            # P3: calibrated silence is a feature. Turning it off means the
            # system will answer where it would rather say "insufficient
            # evidence", so the decision is recorded with a name against it.
            details["abstention_disabled"] = True

        await audit.record(
            session,
            action=AuditAction.USER_PREFERENCES_UPDATED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            details=details,
        )
        return await self.get_preferences(session, user=user)

    async def _preferences_row(self, session: AsyncSession, user: User) -> UserPreferences:
        row = await session.get(UserPreferences, user.id)
        if row is None:
            row = UserPreferences(user_id=user.id)
            session.add(row)
            await session.flush()
        return row

    # ------------------------------------------------------------------
    # Avatar
    # ------------------------------------------------------------------

    async def create_avatar_ticket(
        self,
        *,
        user: User,
        data: schemas.AvatarUploadRequest,
        context: RequestContext,
    ) -> schemas.AvatarUploadTicket:
        await self._limiter.check(
            action="avatar", identifier=str(user.id), limit=ratelimit.AVATAR_UPLOAD
        )
        ticket = self._avatars.create_upload_ticket(
            org_id=user.org_id,
            user_id=user.id,
            content_type=data.content_type,
            content_length=data.content_length,
        )
        return schemas.AvatarUploadTicket(
            upload_url=ticket.url,
            fields=ticket.fields,
            key=ticket.key,
            expires_in=ticket.expires_in,
            max_bytes=ticket.max_bytes,
        )

    async def commit_avatar(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.AvatarCommitRequest,
        context: RequestContext,
    ) -> schemas.AvatarResponse:
        # The key is the one we issued, for this user, in this tenant — checked
        # before S3 is touched, so a guessed key is refused without a round trip.
        if not self._avatars.owns_key(data.key, org_id=user.org_id, user_id=user.id):
            raise errors.ForbiddenError("That upload does not belong to this account.")

        size = await self._avatars.verify_uploaded(data.key)
        previous = user.avatar_key

        user.avatar_key = data.key
        user.avatar_updated_at = _now()
        await session.flush()

        if previous and previous != data.key:
            await self._avatars.delete(previous)

        try:
            await self._cognito.update_attributes(
                username=user.cognito_username, attributes={"picture": data.key}
            )
        except errors.AppError as exc:
            log.warning("user.avatar_attribute_sync_failed", code=exc.code)

        await audit.record(
            session,
            action=AuditAction.USER_AVATAR_UPDATED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            details={"bytes": size},
        )
        return schemas.AvatarResponse(
            avatar_url=self._avatars.view_url(user.avatar_key),
            updated_at=user.avatar_updated_at,
        )

    async def remove_avatar(
        self,
        session: AsyncSession,
        *,
        user: User,
        context: RequestContext,
    ) -> schemas.AvatarResponse:
        previous = user.avatar_key
        user.avatar_key = None
        user.avatar_updated_at = _now()
        await session.flush()
        await self._avatars.delete(previous)

        await audit.record(
            session,
            action=AuditAction.USER_AVATAR_REMOVED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
        )
        return schemas.AvatarResponse(avatar_url=None, updated_at=user.avatar_updated_at)

    # ------------------------------------------------------------------
    # E-mail address
    # ------------------------------------------------------------------

    async def request_email_change(
        self,
        session: AsyncSession,
        *,
        user: User,
        access_token: str,
        data: schemas.ChangeEmailRequest,
        context: RequestContext,
    ) -> None:
        if data.new_email == user.email:
            raise errors.InvalidRequestError("That is already the address on this account.")

        taken = await session.scalar(select(User.id).where(User.email == data.new_email))
        if taken is not None:
            raise errors.EmailInUseError()

        await self._cognito.request_email_change(
            access_token=access_token, new_email=data.new_email
        )
        user.pending_email = data.new_email
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.USER_EMAIL_CHANGE_REQUESTED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            details={"to": data.new_email},
        )

    async def confirm_email_change(
        self,
        session: AsyncSession,
        *,
        user: User,
        access_token: str,
        data: schemas.ConfirmEmailChangeRequest,
        context: RequestContext,
    ) -> User:
        if not user.pending_email:
            raise errors.InvalidRequestError("No address change is pending.")

        await self._cognito.confirm_email_change(access_token=access_token, code=data.code)

        previous = user.email
        user.email = user.pending_email
        user.pending_email = None
        user.email_verified = True
        # The pool's sign-in alias moved with the address.
        user.cognito_username = user.email
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.USER_EMAIL_CHANGED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            details={"from": previous},
        )
        return user

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    async def list_sessions(
        self, session: AsyncSession, *, user: User, context: RequestContext
    ) -> list[schemas.SessionOut]:
        cutoff = _now() - timedelta(days=90)
        rows = await session.scalars(
            select(UserSession)
            .where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
                UserSession.created_at >= cutoff,
            )
            .order_by(UserSession.last_seen_at.desc().nullslast())
        )
        return [
            schemas.SessionOut(
                id=str(row.id),
                device=row.device_label,
                location=row.location,
                ip_address=row.ip_address,
                created_at=row.created_at,
                last_active=row.last_seen_at,
                current=context.session_id == str(row.id),
            )
            for row in rows
        ]

    async def revoke_session(
        self,
        session: AsyncSession,
        *,
        user: User,
        session_id: str,
        context: RequestContext,
    ) -> None:
        row = await session.get(UserSession, _as_uuid(session_id))
        if row is None or row.user_id != user.id:
            # Not "forbidden": a caller must not learn that someone else's
            # session id exists.
            raise errors.NotFoundError("No such session.")
        if row.revoked_at is not None:
            return

        row.revoked_at = _now()
        row.revoked_reason = "revoked_by_user"
        await session.flush()

        # Marking the row is bookkeeping; the credential dies at Cognito. There
        # is no per-device revocation without the device's own refresh token,
        # so revoking one session ends them all and the UI says so.
        await self._cognito.global_sign_out(username=user.cognito_username)
        others = await session.scalars(
            select(UserSession).where(
                UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
            )
        )
        now = _now()
        for other in others:
            other.revoked_at = now
            other.revoked_reason = "global_sign_out"
        await session.flush()

        await audit.record(
            session,
            action=AuditAction.SESSION_REVOKED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            actor_email=user.email,
            target_type="session",
            target_id=session_id,
        )

    # ------------------------------------------------------------------
    # Deletion
    # ------------------------------------------------------------------

    async def delete_account(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.DeleteAccountRequest,
        context: RequestContext,
    ) -> None:
        """Remove the identity; keep the attribution.

        nDSG gives the person the right to have their account removed, and
        §5.4 M5 makes every correction attributable to a named archivist. Both
        hold: the credential and the Cognito profile are deleted outright, the
        row is soft-deleted and its contact details cleared, and the audit
        trail and catalogue history keep referring to a user id that no longer
        identifies anyone outside this database.
        """
        await self._cognito.delete_user(username=user.cognito_username)

        now = _now()
        user.status = UserStatus.DELETED
        user.deleted_at = now
        user.email = f"deleted+{user.id}@zeitzeuge.invalid"
        user.pending_email = None
        user.phone = None
        user.bio = None
        user.job_title = None
        avatar_key, user.avatar_key = user.avatar_key, None

        rows = await session.scalars(
            select(UserSession).where(
                UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
            )
        )
        for row in rows:
            row.revoked_at = now
            row.revoked_reason = "account_deleted"
        await session.flush()

        await self._avatars.delete(avatar_key)

        await audit.record(
            session,
            action=AuditAction.USER_DELETED,
            context=context,
            org_id=user.org_id,
            actor_user_id=user.id,
            details={"reason": data.reason} if data.reason else {},
        )


def _as_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        # A malformed id and an id belonging to someone else must be
        # indistinguishable, so both answer "no such session".
        raise errors.NotFoundError("No such session.") from exc
