"""The person using the application.

Cognito owns the credential; this row owns everything the archive cares about —
which archive they belong to, what they may do, what they look like in the
member list, and how they want the system to behave. `cognito_sub` is the join
between the two, and it is the only stable one: an e-mail address can change,
a `sub` cannot.

`email` is stored lower-cased with a unique constraint. Cognito is
case-insensitive for sign-in aliases, so anything else invites two rows for one
human.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from zeitzeuge_api.core.ids import initials_of
from zeitzeuge_api.db.base import GUID, Base, JSONDict, TimestampMixin, enum_column, uuid_pk
from zeitzeuge_api.db.models.enums import UserRole, UserStatus

if TYPE_CHECKING:  # pragma: no cover - import cycle broken for the type checker
    from zeitzeuge_api.db.models.organization import Organization


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False
    )

    # --- identity ---------------------------------------------------------
    cognito_sub: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    cognito_username: Mapped[str] = mapped_column(String(320), nullable=False)
    """What the pool calls this user. Needed verbatim for SECRET_HASH on refresh."""

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pending_email: Mapped[str | None] = mapped_column(String(320))
    """Held here while the code sent to the new address is outstanding."""

    # --- profile ----------------------------------------------------------
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    job_title: Mapped[str | None] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(40))
    bio: Mapped[str | None] = mapped_column(Text)
    locale: Mapped[str] = mapped_column(String(5), nullable=False, default="de")
    """`de` first — the archive works in German (§9.2 screen 1)."""

    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Zurich")
    avatar_key: Mapped[str | None] = mapped_column(String(512))
    """S3 object key. Never a URL — the URL is signed per request and expires."""

    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- authorisation ----------------------------------------------------
    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole, "user_role"),
        nullable=False,
        default=UserRole.ARCHIVIST,
    )
    status: Mapped[UserStatus] = mapped_column(
        enum_column(UserStatus, "user_status"),
        nullable=False,
        default=UserStatus.PENDING,
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # --- lifecycle --------------------------------------------------------
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Soft delete. Audit entries and catalogue corrections reference this row;
    §5.4 M5 makes every improvement attributable to a named archivist, and that
    attribution must not vanish because someone closed their account."""

    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONDict, nullable=False, default=dict
    )

    organization: Mapped[Organization] = relationship(
        back_populates="users", lazy="joined"
    )
    preferences: Mapped[UserPreferences | None] = relationship(
        back_populates="user", uselist=False, lazy="joined", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_org_id_status", "org_id", "status"),
        Index("ix_users_org_id_role", "org_id", "role"),
    )

    # --- derived ----------------------------------------------------------

    @property
    def initials(self) -> str:
        return initials_of(self.full_name or self.email)

    @property
    def is_active(self) -> bool:
        return self.status is UserStatus.ACTIVE and self.deleted_at is None

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<User {self.email} ({self.role})>"


class UserPreferences(Base, TimestampMixin):
    """Everything the settings screens write (`/settings/*`).

    Typed columns rather than a JSON blob: these values steer *spend* and
    *autonomy* — an auto-accept threshold decides how many records go out
    without a human reading them — so they belong in the schema where a
    migration, a constraint and a query planner can all see them.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # Appearance
    theme: Mapped[str] = mapped_column(String(16), nullable=False, default="system")
    reduced_motion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    high_contrast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Notifications — the four events in `apps/web/src/lib/data/settings.ts`.
    email_queue_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_hypothesis_refuted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_batch_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_weekly_digest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inapp_queue_ready: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inapp_hypothesis_refuted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inapp_batch_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inapp_weekly_digest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Cataloguing (§9.2 screen 7, §5.4 M1, P3)
    default_run_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    auto_accept_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.92)
    allow_abstention: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    """P3 — calibrated silence is a feature. Switching it off is a deliberate,
    recorded act, which is why it is a stored preference and not a UI toggle."""

    default_collection: Mapped[str | None] = mapped_column(String(64))
    default_export_format: Mapped[str] = mapped_column(String(16), nullable=False, default="isad")

    user: Mapped[User] = relationship(back_populates="preferences", lazy="raise")

    __table_args__ = (
        # A threshold below 0.5 would make bulk-accept a coin toss with an
        # archivist's signature on the result.
        CheckConstraint(
            "auto_accept_threshold >= 0.5 AND auto_accept_threshold <= 1.0",
            name="auto_accept_threshold_range",
        ),
    )
