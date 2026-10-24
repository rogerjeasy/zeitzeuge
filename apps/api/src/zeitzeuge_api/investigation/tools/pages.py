"""`page.verify` — fetch a URL a research model cited and check it says what was claimed.

A model with web search returns sources that look right and sometimes support a
different conclusion (SG.CIV.17.3: a real catalogue entry for the Spital, a real
address, the wrong building; identification-upgrade note §1.1). So a cited URL
is never trusted: this module fetches it and reports whether the page contains
the claimed value — and, for a building, also the place — after folding.

The fetch is the part a hostile page could abuse, so it goes through
`tools/fetch.guarded_get`: `https` only, public addresses only, pinned to the
checked address, at most five redirects, 2 MB, 10 s. Parsing runs off the event
loop with a 15 s deadline and capped PDF decompression.
The text is data for a substring check; it is never shown to a model as
instructions. PDFs (the canton's KSI inventory sheets are PDFs) are reduced to
their text with pypdf.
"""

from __future__ import annotations

import asyncio
import io
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.investigation.names import PLACE_WORDS, distinctive
from zeitzeuge_api.investigation.tools.base import HttpTool, ToolCache
from zeitzeuge_api.investigation.tools.fetch import guarded_get
from zeitzeuge_api.investigation.tools.text import contains_all_tokens, fold, strip_html

log = get_logger(__name__)

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT_SECONDS = 10.0
MAX_REDIRECTS = 5
_TEXT_TYPES = ("text/html", "text/plain", "application/xhtml+xml", "application/pdf")
MAX_REDIRECTS = 5


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
    if not core or core in PLACE_WORDS:
        return False
    if place and core in [*fold(place).split(), fold(place)]:
        return False
    return f" {core} " in f" {page_text} "


PARSE_SECONDS = 15.0
_PARSERS = ThreadPoolExecutor(max_workers=2, thread_name_prefix="page-parse")
"""Parsing has its own two threads. A thread cannot be killed at the deadline, so a
hostile PDF can at worst occupy these two — it cannot starve the default executor
that DNS resolution (`guarded_get`) and the KSI sheets use. Known limit: a stuck
parse keeps its thread busy until it finishes; the per-stream decompression cap
bounds how long that can be."""


def limit_pdf_decompression() -> None:
    """pypdf's default stream limits are generous; a 2 MB PDF must not inflate to gigabytes."""
    from pypdf import filters

    for name in ("ZLIB_MAX_OUTPUT_LENGTH", "LZW_MAX_OUTPUT_LENGTH", "RUN_LENGTH_MAX_OUTPUT_LENGTH"):
        if hasattr(filters, name):
            setattr(filters, name, 20_000_000)


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
        fetched = await guarded_get(
            self._client,
            url,
            max_bytes=MAX_BYTES,
            types=_TEXT_TYPES,
            read_seconds=TIMEOUT_SECONDS,
            user_agent=self.USER_AGENT,
        )
        if fetched is None:
            return None
        # Parsing (a PDF above all) is CPU work: off the event loop, with a deadline.
        try:
            loop = asyncio.get_running_loop()
            return await asyncio.wait_for(
                loop.run_in_executor(
                    _PARSERS, _page, fetched.url, fetched.content_type, fetched.body
                ),
                timeout=PARSE_SECONDS,
            )
        except TimeoutError:
            log.info("page.parse_timeout", url=fetched.url[:200])
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

            limit_pdf_decompression()
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
