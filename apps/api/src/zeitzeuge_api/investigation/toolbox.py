"""The lookup clients a run uses, built once per process (`context.Tools`)."""

from __future__ import annotations

import ssl
from pathlib import Path

import certifi
import httpx

from zeitzeuge_api.investigation.tools.base import HttpTool, ToolCache
from zeitzeuge_api.investigation.tools.commons import Commons
from zeitzeuge_api.investigation.tools.fetch import guarded_get
from zeitzeuge_api.investigation.tools.google import GoogleTools
from zeitzeuge_api.investigation.tools.keys import ExternalKeys
from zeitzeuge_api.investigation.tools.osm import Overpass
from zeitzeuge_api.investigation.tools.pages import PageVerifier
from zeitzeuge_api.investigation.tools.registers import KsiInventory, WikidataGazetteer
from zeitzeuge_api.investigation.tools.research import GeminiResearch, OpenAIResearch
from zeitzeuge_api.investigation.tools.stasz import StaatsarchivCatalogue
from zeitzeuge_api.investigation.tools.swisstopo import Swisstopo
from zeitzeuge_api.investigation.tools.wikipedia import Wikipedia

MAX_REFERENCE_BYTES = 6 * 1024 * 1024


def _tls_context() -> ssl.SSLContext:
    """Certificates verified as usual; OpenSSL's DEFAULT cipher list instead of Python's.

    The canton's file server (data.geo.sz.ch, the KSI inventory sheets) resets the
    handshake for Python's narrower default list and accepts OpenSSL's DEFAULT,
    which still excludes every insecure suite.
    """
    context = ssl.create_default_context(cafile=certifi.where())
    context.set_ciphers("DEFAULT")
    return context


_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")


class Toolbox:
    def __init__(
        self,
        *,
        cache_dir: Path | None = None,
        replay: bool = False,
        keys: ExternalKeys | None = None,
        research_models: tuple[str, str] = ("gpt-5.5", "gemini-4-argon"),
        research_effort: str = "medium",
    ) -> None:
        self.keys = keys or ExternalKeys()
        self.client = httpx.AsyncClient(follow_redirects=True, verify=_tls_context())
        self.cache = ToolCache(cache_dir, replay=replay)
        self.swisstopo = Swisstopo(self.client, self.cache)
        self.overpass = Overpass(self.client, self.cache)
        self.commons = Commons(self.client, self.cache)
        self.wikipedia = Wikipedia(self.client, self.cache)
        self.catalogue = StaatsarchivCatalogue(self.client, self.cache)
        self.pages = PageVerifier(self.client, self.cache)
        self._images: dict[str, bytes | None] = {}
        self.ksi = KsiInventory(self.client, self.cache, self._images)
        self.wikidata = WikidataGazetteer(self.client, self.cache)
        self.google = GoogleTools(
            self.client, self.cache, google_key=self.keys.google, serpapi_key=self.keys.serpapi
        )
        self.research_openai = OpenAIResearch(
            self.client, self.cache, self.keys.openai, research_models[0], effort=research_effort
        )
        self.research_gemini = GeminiResearch(
            self.client, self.cache, self.keys.gemini, research_models[1]
        )
        self._image_dir = cache_dir / "images" if cache_dir else None
        if self._image_dir:
            try:
                self._image_dir.mkdir(parents=True, exist_ok=True)
            except OSError:
                self._image_dir = None
        self._replay = replay

    async def fetch_image(self, url: str) -> bytes | None:
        """A reference photo; None when it cannot be had.

        Pictures the pipeline holds itself (KSI sheet photos) are served from the
        memo. Everything else is a URL someone else chose — a search engine, a
        research model — and goes through `guarded_get` (public https only,
        address pinned, size-capped).
        """
        if url in self._images:
            return self._images[url]
        if url.startswith(("places-photo://", "streetview://")):
            photo = await self.google.fetch_photo(url)
            self._images[url] = photo
            return photo
        if not url.startswith("https://"):
            return None
        path = (
            self._image_dir / f"{ToolCache.key('IMG', url, None, None)}.bin"
            if self._image_dir
            else None
        )
        if path is not None and path.exists():
            data: bytes | None = path.read_bytes()
        elif self._replay:
            data = None
        else:
            fetched = await guarded_get(
                self.client,
                url,
                max_bytes=MAX_REFERENCE_BYTES,
                types=_IMAGE_TYPES,
                read_seconds=20,
                user_agent=HttpTool.USER_AGENT,
            )
            data = fetched.body if fetched else None
            if data and path is not None:
                path.write_bytes(data)
        self._images[url] = data
        return data

    async def close(self) -> None:
        await self.client.aclose()
