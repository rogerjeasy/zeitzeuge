"""The audit log — append-only, by policy and by grant.

§10.5 asks for traceability; §5.3's Evidence Ledger asks for it of the agents.
This table asks it of the humans: who signed in, who changed a role, who
revoked a key, from which address. No `updated_at`, no update path in the
application, and in Postgres no UPDATE or DELETE grant at all for the
application role (see the initial migration) — an audit trail that the
application can rewrite is not an audit trail.

`org_id` and `actor_user_id` are nullable on purpose: a failed sign-in for an
address that does not exist has neither, and that event is precisely the one
worth keeping.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from zeitzeuge_api.db.base import GUID, Base, JSONDict, uuid_pk


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="SET NULL")
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="SET NULL")
    )
    actor_email: Mapped[str | None] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(64))
    target_id: Mapped[str | None] = mapped_column(String(128))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    request_id: Mapped[str | None] = mapped_column(String(64))
    """The same id the client was handed, so a support question and a log line
    and this row all meet."""

    details: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_audit_log_org_id_created_at", "org_id", "created_at"),
        Index("ix_audit_log_actor_user_id_created_at", "actor_user_id", "created_at"),
        Index("ix_audit_log_action_created_at", "action", "created_at"),
    )
