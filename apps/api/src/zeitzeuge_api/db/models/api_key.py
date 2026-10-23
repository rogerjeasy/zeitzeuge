"""Machine credentials — the rows behind `/settings/api`.

Two properties are non-negotiable and both are visible in the columns:

* **The secret is never stored.** Only a SHA-256 digest is. A key is shown to
  its owner exactly once, at creation; losing it means issuing a new one. That
  is the same bargain every credible API makes, and the reason a database dump
  is not a set of working credentials.
* **A key is weaker than its owner, never stronger.** `scope` is `read` or
  `write`, it is intersected with the owner's role at request time, and the key
  carries the owner's `org_id` — so a leaked harvester token can read one
  archive's records and can do nothing else, anywhere.

SHA-256 without a work factor is correct here and wrong for passwords: the
secret is 256 bits of `secrets.token_urlsafe`, so there is no dictionary to
run, and the lookup has to stay fast enough for a per-request check.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from zeitzeuge_api.core.time import as_aware
from zeitzeuge_api.db.base import GUID, Base, TimestampMixin, enum_column, uuid_pk
from zeitzeuge_api.db.models.enums import ApiKeyScope


class ApiKey(Base, TimestampMixin):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(String(24), nullable=False, unique=True)
    """`zz_live_7f3a` — enough to identify a key in a list and in a log line,
    not enough to use it."""

    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    scope: Mapped[ApiKeyScope] = mapped_column(
        enum_column(ApiKeyScope, "api_key_scope", length=16),
        nullable=False,
        default=ApiKeyScope.READ,
    )

    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_ip: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (
        Index("ix_api_keys_user_id_revoked_at", "user_id", "revoked_at"),
        Index("ix_api_keys_org_id", "org_id"),
    )

    def is_usable(self, *, now: datetime) -> bool:
        if self.revoked_at is not None:
            return False
        expires_at = as_aware(self.expires_at)
        return expires_at is None or expires_at > now
