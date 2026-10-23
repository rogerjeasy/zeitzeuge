"""Closed vocabularies.

Roles are the ones the web app already renders under `settings.archive.roles.*`
(`apps/web/src/lib/data/settings.ts`), plus `guest` for the demo path. They are
mirrored as Cognito groups, so a token and a row always agree on what someone
may do.
"""

from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    """Archive administrator: members, thresholds, model routing, budgets."""

    ARCHIVIST = "archivist"
    """Signs off catalogue records. The authority in the workflow."""

    REVIEWER = "reviewer"
    """May review and correct, but not approve — §9.2 screen 7."""

    OPERATOR = "operator"
    """Runs the scanner and the batches; does not adjudicate metadata."""

    READER = "reader"
    """Reads finished records. External historians, the Historischer Verein."""

    GUEST = "guest"
    """The demo identity. Read-only, seeded collection, never writes."""

    @property
    def can_approve(self) -> bool:
        return self in {UserRole.ADMIN, UserRole.ARCHIVIST}

    @property
    def can_write(self) -> bool:
        return self in {UserRole.ADMIN, UserRole.ARCHIVIST, UserRole.REVIEWER, UserRole.OPERATOR}


class UserStatus(StrEnum):
    PENDING = "pending"
    """Registered, e-mail not yet confirmed. Cannot sign in."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"
    """Soft-deleted. The row survives because audit entries reference it."""


class OrganizationKind(StrEnum):
    ARCHIVE = "archive"
    MUSEUM = "museum"
    ASSOCIATION = "association"
    PERSONAL = "personal"
    DEMO = "demo"


class ApiKeyScope(StrEnum):
    READ = "read"
    WRITE = "write"


class AuditAction(StrEnum):
    """Every entry an identity flow may append. Append-only by RLS."""

    USER_REGISTERED = "user.registered"
    USER_VERIFIED = "user.verified"
    USER_LOGIN = "user.login"
    USER_LOGIN_FAILED = "user.login_failed"
    USER_LOGOUT = "user.logout"
    USER_REFRESHED = "user.refreshed"
    USER_PROFILE_UPDATED = "user.profile_updated"
    USER_PREFERENCES_UPDATED = "user.preferences_updated"
    USER_AVATAR_UPDATED = "user.avatar_updated"
    USER_AVATAR_REMOVED = "user.avatar_removed"
    USER_EMAIL_CHANGE_REQUESTED = "user.email_change_requested"
    USER_EMAIL_CHANGED = "user.email_changed"
    USER_PASSWORD_RESET_REQUESTED = "user.password_reset_requested"
    USER_PASSWORD_RESET = "user.password_reset"
    USER_PASSWORD_CHANGED = "user.password_changed"
    USER_MFA_ENABLED = "user.mfa_enabled"
    USER_MFA_DISABLED = "user.mfa_disabled"
    USER_DELETED = "user.deleted"
    USER_ROLE_CHANGED = "user.role_changed"
    SESSION_REVOKED = "session.revoked"
    SESSIONS_REVOKED_ALL = "session.revoked_all"
    API_KEY_CREATED = "api_key.created"
    API_KEY_REVOKED = "api_key.revoked"
    GUEST_SESSION_STARTED = "guest.session_started"
