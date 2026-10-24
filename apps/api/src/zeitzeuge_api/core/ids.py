"""Identifier helpers.

UUIDv4 for rows. For anything a human reads back to you over a phone — an API
key prefix, a session handle — a Crockford base32 string, because it has no
`I`, `L`, `O` or `U` to misread and no accidental words.
"""

from __future__ import annotations

import secrets
import time
import uuid

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


def short_code(length: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def new_public_id(prefix: str) -> str:
    """`run_01JBQ7…`: a ULID — 48-bit millisecond time + 80 random bits, base32.

    Sortable by creation time, which is what the queue and the history screen
    order by, and unguessable, which is what a shared link needs.
    """
    value = (int(time.time() * 1000) << 80) | secrets.randbits(80)
    chars = []
    for _ in range(26):
        chars.append(_ALPHABET[value & 31])
        value >>= 5
    return f"{prefix}_{''.join(reversed(chars))}"


def initials_of(full_name: str) -> str:
    """`Andrea Betschart` → `AB`, matching the avatar fallback the web app draws."""
    parts = [p for p in full_name.replace("-", " ").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()
