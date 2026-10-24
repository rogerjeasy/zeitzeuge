"""What every external lookup returns, and the cache in front of all of them.

A tool never decides how much its answer is worth: it reports *what kind of
match* it found (`MatchKind`), and the confidence rule turns that into a
strength (`investigation/confidence.py`). That keeps "how sure" in one stated
place instead of scattered across six HTTP clients.

`ToolCache` stores every response under the SHA-256 of the request. Live, it is
the OGD-etiquette cache (one fetch per distinct question). With `replay=True`
it is the test fixture: a missing entry raises instead of touching the network,
so CI never depends on swisstopo being up and the demo can run from a
recorded directory.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

import httpx


class MatchKind(StrEnum):
    EXACT = "exact"
    """The official register holds exactly this name."""
    NORMALISED = "normalised"
    """Equal after case, accents, hyphens and «St./Sankt»-style folding."""
    FUZZY = "fuzzy"
    """Similar, not equal (a search engine's ranking, a partial title hit)."""
    SPATIAL = "spatial"
    """Found by position: the feature that contains or is nearest to a point."""


@dataclass(frozen=True, slots=True)
class ToolHit:
    """One answer from one external source."""

    tool: str
    """`swisstopo.search`, `swisstopo.identify`, `osm.overpass`, `commons.search`, …"""
    label: str
    """The name as the source spells it: «Schwyz», «Grundstrasse 32»."""
    source: str
    """Human citation for the Belege sheet: «swisstopo, Amtliches Ortschaftenverzeichnis»."""
    source_uri: str
    """A URL a person can open to check the claim."""
    match: MatchKind
    kind: str = ""
    """What the feature is, in the source's terms: `locality`, `municipality`,
    `address`, `peak`, `lake`, `nursing_home`, `photo`, `article`, …"""
    lv95: tuple[float, float] | None = None
    """(E, N) in LV95 / EPSG:2056 when the source has a position."""
    distance_m: float | None = None
    """Distance from the query point, for spatial hits."""
    attrs: dict[str, Any] = field(default_factory=dict)
    """Source-specific detail kept for the ledger: `bfs_nr`, `plz`, `egid`,
    `street`, `house_number`, `featureId`, `thumbnail`, `signature`, …"""


class ToolUnavailable(Exception):
    """A source could not be queried. The stage records it and carries on."""


class ToolCache:
    def __init__(self, directory: Path | None = None, *, replay: bool = False) -> None:
        self._directory = directory
        self._replay = replay
        self._memory: dict[str, Any] = {}
        if directory is not None:
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def key(method: str, url: str, params: dict[str, Any] | None, body: str | None) -> str:
        canonical = json.dumps(
            {"m": method, "u": url, "p": params or {}, "b": body or ""}, sort_keys=True
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    def get(self, key: str) -> Any | None:
        if key in self._memory:
            return self._memory[key]
        if self._directory is not None:
            path = self._directory / f"{key}.json"
            if path.exists():
                value = json.loads(path.read_text())
                self._memory[key] = value
                return value
        if self._replay:
            raise ToolUnavailable(f"no recorded response for {key}")
        return None

    def put(self, key: str, value: Any) -> None:
        self._memory[key] = value
        if self._directory is not None and not self._replay:
            (self._directory / f"{key}.json").write_text(json.dumps(value, ensure_ascii=False))


_RETRY_STATUS = {429, 500, 502, 503, 504}
_BACKOFF_SECONDS = (2.0, 5.0)


async def _with_retry(send: Callable[[], Awaitable[httpx.Response]]) -> httpx.Response:
    """Public endpoints blip (Overpass answers 502 under load); try twice more, then give up."""
    for delay in (*_BACKOFF_SECONDS, None):
        try:
            response = await send()
        except httpx.TransportError:
            if delay is None:
                raise
        else:
            if response.status_code not in _RETRY_STATUS or delay is None:
                return response
        await asyncio.sleep(delay)
    raise AssertionError("unreachable")  # pragma: no cover


class HttpTool:
    """Shared plumbing: one `httpx.AsyncClient`, the cache, an identified UA."""

    USER_AGENT = "ZEITZEUGE/0.1 (Zentral Hack 2026; Staatsarchiv Schwyz challenge)"

    def __init__(self, client: httpx.AsyncClient, cache: ToolCache) -> None:
        self._client = client
        self._cache = cache

    async def get_json(self, url: str, params: dict[str, Any] | None = None) -> Any:
        key = ToolCache.key("GET", url, params, None)
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        try:
            response = await _with_retry(
                lambda: self._client.get(
                    url, params=params, headers={"User-Agent": self.USER_AGENT}, timeout=20
                )
            )
            response.raise_for_status()
            value = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ToolUnavailable(f"{url}: {exc}") from exc
        self._cache.put(key, value)
        return value

    async def post_form_json(
        self,
        url: str,
        data: dict[str, str],
        *,
        validate: Callable[[Any], None] | None = None,
    ) -> Any:
        """POST a form, parse JSON. `validate` may raise `ToolUnavailable` for a
        200 that is really a failure (Overpass reports timeouts in a `remark`),
        so the failure is not cached as if it were an answer."""
        body = json.dumps(data, sort_keys=True)
        key = ToolCache.key("POST", url, None, body)
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        try:
            response = await _with_retry(
                lambda: self._client.post(
                    url, data=data, headers={"User-Agent": self.USER_AGENT}, timeout=40
                )
            )
            response.raise_for_status()
            value = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ToolUnavailable(f"{url}: {exc}") from exc
        if validate is not None:
            validate(value)
        self._cache.put(key, value)
        return value

    async def get_text(self, url: str, params: dict[str, Any] | None = None) -> str:
        key = ToolCache.key("GET-TEXT", url, params, None)
        cached = self._cache.get(key)
        if cached is not None:
            return str(cached)
        try:
            response = await _with_retry(
                lambda: self._client.get(
                    url,
                    params=params,
                    headers={"User-Agent": self.USER_AGENT},
                    timeout=20,
                    follow_redirects=True,
                )
            )
            response.raise_for_status()
            value = response.text
        except httpx.HTTPError as exc:
            raise ToolUnavailable(f"{url}: {exc}") from exc
        self._cache.put(key, value)
        return value
