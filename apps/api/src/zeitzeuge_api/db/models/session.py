"""Sign-in sessions — the rows behind `/settings/security`.

Cognito holds the refresh token; this table holds what a human needs in order
to recognise a session and end it: the device, roughly where it was, and when
it was last used. The API hands the client a `session_id` at sign-in and the
client returns it in `X-ZZ-Session`, which is what makes "this device" and
"revoke that one" answerable without inventing a second token.

Revoking a single session revokes its refresh token at Cognito; revoking all of
them is `AdminUserGlobalSignOut`. Neither is a database-only act — a row marked
revoked while the token still works would be a lie told to an archivist about
their own account.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from zeitzeuge_api.db.base import GUID, Base, TimestampMixin, uuid_pk


class UserSession(Base, TimestampMixin):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    cognito_username: Mapped[str] = mapped_column(String(320), nullable=False)

    device_label: Mapped[str] = mapped_column(String(120), nullable=False, default="Unbekannt")
    """`Firefox · Windows`, derived from the user agent — the shape the security
    screen already renders."""

    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    location: Mapped[str | None] = mapped_column(String(120))
    """From CloudFront's `CloudFront-Viewer-Country`/`-City` headers. No
    geo-IP lookup of our own, and no third-party call with a user's address."""

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_user_sessions_user_id_revoked_at", "user_id", "revoked_at"),
        Index("ix_user_sessions_org_id", "org_id"),
    )

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None
