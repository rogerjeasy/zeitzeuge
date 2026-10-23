"""Appending to the audit log.

One function, called from the services rather than from the routes, because
the interesting question is never "was the endpoint reached" but "did the thing
happen". A failure to write an audit row is logged and swallowed: an archive
would rather have a sign-in than lose one to a full disk — and the CloudWatch
metric on that log line is what surfaces it.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.db.models import AuditAction, AuditLog
from zeitzeuge_api.db.session import Database, TenantContext

log = get_logger(__name__)


async def record(
    session: AsyncSession,
    *,
    action: AuditAction,
    context: RequestContext | None = None,
    org_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    actor_email: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        session.add(
            AuditLog(
                org_id=org_id,
                actor_user_id=actor_user_id,
                actor_email=actor_email,
                action=str(action),
                target_type=target_type,
                target_id=target_id,
                ip_address=context.ip_address if context else None,
                user_agent=(context.user_agent[:512] if context and context.user_agent else None),
                request_id=context.request_id if context else None,
                details=details or {},
            )
        )
        await session.flush()
    except Exception as exc:  # pragma: no cover - defensive
        log.error("audit.write_failed", action=str(action), error=str(exc))


async def record_out_of_band(database: Database, **kwargs: Any) -> None:
    """Append an entry in its own transaction.

    A failed sign-in ends with an exception, and the request's transaction is
    rolled back with it — taking the audit row along. The entries that matter
    most for security are precisely the ones attached to a failure, so those
    are written on a separate connection that commits regardless.
    """
    try:
        async with database.session(TenantContext.bootstrap()) as session:
            await record(session, **kwargs)
    except Exception as exc:  # pragma: no cover - defensive
        log.error("audit.out_of_band_failed", error=str(exc))
