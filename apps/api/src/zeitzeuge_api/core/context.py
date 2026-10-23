"""What we know about the caller, independent of who they are.

Assembled once per request and passed down. Two of these fields are behind
CloudFront and need care: `X-Forwarded-For` is only trustworthy at the position
the proxy chain puts the real client, and CloudFront's viewer headers are the
only geography we use — no third-party geo-IP call ever sees an archivist's
address.
"""

from __future__ import annotations

from dataclasses import dataclass

_BROWSERS = (
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("Firefox/", "Firefox"),
    ("Chrome/", "Chrome"),
    ("Safari/", "Safari"),
)

_PLATFORMS = (
    ("Windows", "Windows"),
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Mac OS X", "macOS"),
    ("Macintosh", "macOS"),
    ("Linux", "Linux"),
)


def device_label(user_agent: str | None) -> str:
    """`Firefox · Windows` — the shape `/settings/security` already renders."""
    if not user_agent:
        return "Unbekanntes Gerät"
    browser = next((name for token, name in _BROWSERS if token in user_agent), None)
    platform = next((name for token, name in _PLATFORMS if token in user_agent), None)
    if browser and platform:
        return f"{browser} · {platform}"
    return browser or platform or "Unbekanntes Gerät"


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str
    ip_address: str | None = None
    user_agent: str | None = None
    location: str | None = None
    session_id: str | None = None

    @property
    def device(self) -> str:
        return device_label(self.user_agent)
