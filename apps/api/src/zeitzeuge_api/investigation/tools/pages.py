"""`page.verify` — fetch a URL a research model cited and check it says what was claimed.

A model with web search returns sources that look right and sometimes support a
different conclusion (SG.CIV.17.3: a real catalogue entry for the Spital, a real
address, the wrong building; identification-upgrade note §1.1). So a cited URL
is never trusted: this module fetches it and reports whether the page contains
the claimed value — and, for a building, also the place — after folding.

The fetch is the part a hostile page could abuse, so it is narrow: `https`
only, every hop's host must resolve to public addresses only (no private,
loopback, link-local or metadata addresses), at most five redirects, 2 MB, 10 s.
The text is data for a substring check; it is never shown to a model as
instructions. PDFs (the canton's KSI inventory sheets are PDFs) are reduced to
their text with pypdf.
"""

from __future__ import annotations

import asyncio
import io
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.investigation.names import distinctive
from zeitzeuge_api.investigation.tools.base import HttpTool, ToolCache
from zeitzeuge_api.investigation.tools.text import contains_all_tokens, fold, strip_html

log = get_logger(__name__)

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT_SECONDS = 10.0
MAX_REDIRECTS = 5
_TEXT_TYPES = ("text/html", "text/plain", "application/xhtml+xml", "application/pdf")


@dataclass(frozen=True, slots=True)
class Page:
    url: str
    """The final URL after redirects."""
    title: str
    text: str
    """Folded plain text, for matching."""


def mentions(page_text: str, value: str, *, place: str | None = None) -> bool:
    """The page names the value: every token, or the value's distinctive core as a phrase.

    The core shortcut («Acherhof» for «Alterszentrum Acherhof») is refused when the
    core is only the place: «Spital Schwyz» reduces to «schwyz», which every page
    about Schwyz contains.
    """
    if not value.strip():
        return False
    if contains_all_tokens(page_text, value):
        return True
    core = distinctive(value)
    if not core or (place and core in [*fold(place).split(), fold(place)]):
        return False
    return f" {core} " in f" {page_text} "


async def _public_host(host: str) -> bool:
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    addresses = {info[4][0] for info in infos}
    return bool(addresses) and all(ipaddress.ip_address(a).is_global for a in addresses)


class PageVerifier(HttpTool):
    """Fetches cited pages, cached; never raises: an unreadable page is `None`."""

    async def fetch(self, url: str) -> Page | None:
        key = ToolCache.key("PAGE", url, None, None)
        try:
            cached = self._cache.get(key)
        except Exception:  # replay mode with no recording: treat as unreadable
            return None
        if cached is not None:
            return Page(**cached) if cached else None
        page = await self._fetch(url)
        stored = {"url": page.url, "title": page.title, "text": page.text} if page else {}
        self._cache.put(key, stored)
        return page

    async def _fetch(self, url: str) -> Page | None:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(current)
            if parts.scheme != "https" or not parts.hostname:
                return None
            if not await _public_host(parts.hostname):
                log.info("page.refused_host", host=parts.hostname)
                return None
            try:
                async with self._client.stream(
                    "GET",
                    current,
                    headers={"User-Agent": self.USER_AGENT, "Accept-Language": "de,en;q=0.8"},
                    timeout=TIMEOUT_SECONDS,
                    follow_redirects=False,
                ) as response:
                    if response.is_redirect and "location" in response.headers:
                        current = urljoin(current, response.headers["location"])
                        continue
                    if not response.is_success:
                        return None
                    kind = response.headers.get("content-type", "").split(";")[0].strip()
                    if kind and kind not in _TEXT_TYPES:
                        return None
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            break
                    return _page(current, kind, bytes(body[:MAX_BYTES]))
            except (httpx.HTTPError, ValueError):
                return None
        return None

    async def verify(self, url: str, value: str, *, place: str | None = None) -> Page | None:
        """The page, if it names `value` (and `place`, when given); else `None`."""
        page = await self.fetch(url)
        if page is None or not mentions(page.text, value, place=place):
            return None
        if place and not mentions(page.text, place):
            return None
        return page


def _page(url: str, kind: str, body: bytes) -> Page | None:
    if kind == "application/pdf" or body[:5] == b"%PDF-":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(body))
            text = " ".join((p.extract_text() or "") for p in reader.pages[:10])
        except Exception:
            return None
        title = text.strip().split("\n", 1)[0][:200]
        return Page(url=url, title=title, text=fold(text))
    raw = body.decode("utf-8", errors="replace")
    lower = raw.lower()
    title = ""
    start = lower.find("<title")
    if start >= 0:
        open_end = lower.find(">", start)
        close = lower.find("</title>", open_end)
        if open_end >= 0 and close > open_end:
            title = strip_html(raw[open_end + 1 : close])[:200]
    for tag in ("script", "style", "noscript"):
        while (i := lower.find(f"<{tag}")) >= 0:
            j = lower.find(f"</{tag}>", i)
            if j < 0:
                break
            raw = raw[:i] + " " + raw[j + len(tag) + 3 :]
            lower = raw.lower()
    return Page(url=url, title=title, text=fold(strip_html(raw)))
