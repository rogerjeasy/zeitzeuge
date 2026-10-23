"""Time, always aware.

PostgreSQL `timestamptz` hands back an aware datetime; SQLite hands back a
naive one; and comparing the two raises `TypeError` at exactly the wrong
moment — in the middle of authenticating an API key, say. Every datetime that
crosses the database boundary goes through `as_aware` first, and every "now"
in the codebase comes from `utcnow`.
"""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_aware(value: datetime | None) -> datetime | None:
    """Treat a naive timestamp as UTC, which is what it was stored as."""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
