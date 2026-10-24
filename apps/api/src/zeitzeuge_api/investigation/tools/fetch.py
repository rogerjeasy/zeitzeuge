"""One guarded GET for every URL the pipeline did not choose itself.

Research models cite pages and image URLs; search engines return thumbnails.
Any of them can point at an internal address (the ECS task metadata endpoint,
the VPC, localhost) or redirect there. So every such fetch goes through here:

* `https` only;
* the host is resolved once, **every** address must be public (`is_global`), and
  the connection is made to that checked address — the request carries the
  original name as `Host` and as TLS SNI, so the certificate is still verified
  against the name, and a second DNS answer cannot swap in another address
  (no rebinding window);
* redirects are followed by hand, at most five, each hop checked the same way;
* the body is streamed and cut at `max_bytes`; content types are allow-listed.

Security review of 95f5b77, findings 1 and 2.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from zeitzeuge_api.core.logging import get_logger

log = get_logger(__name__)

MAX_REDIRECTS = 5


@dataclass(frozen=True, slots=True)
class Fetched:
    url: str
    """The final URL (by name, not by address) after redirects."""
    content_type: str
    body: bytes


async def _checked_address(host: str, port: int) -> str | None:
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, port, proto=socket.IPPROTO_TCP)
    except OSError:
        return None
    addresses = [str(info[4][0]) for info in infos]
    if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses):
        log.info("fetch.refused_host", host=host)
        return None
    return addresses[0]


async def guarded_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_bytes: int,
    types: tuple[str, ...],
    read_seconds: float,
    user_agent: str,
) -> Fetched | None:
    """The body of `url` if it is a public https resource of an allowed type; else None."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(current)
        if parts.scheme != "https" or not parts.hostname:
            return None
        host, port = parts.hostname, parts.port or 443
        address = await _checked_address(host, port)
        if address is None:
            return None
        literal = f"[{address}]" if ":" in address else address
        pinned = urlunsplit((parts.scheme, f"{literal}:{port}", parts.path or "/", parts.query, ""))
        headers = {
            "Host": host if port == 443 else f"{host}:{port}",
            "User-Agent": user_agent,
            "Accept-Language": "de,en;q=0.8",
        }
        try:
            async with client.stream(
                "GET",
                pinned,
                headers=headers,
                timeout=read_seconds,
                follow_redirects=False,
                extensions={"sni_hostname": host},
            ) as response:
                if response.is_redirect and "location" in response.headers:
                    current = urljoin(current, response.headers["location"])
                    continue
                if not response.is_success:
                    return None
                kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if kind not in types:
                    return None
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        break
                return Fetched(url=current, content_type=kind, body=bytes(body[:max_bytes]))
        except (httpx.HTTPError, ValueError):
            return None
    return None
