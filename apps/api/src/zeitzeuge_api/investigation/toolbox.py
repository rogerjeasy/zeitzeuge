"""The lookup clients a run uses, built once per process (`context.Tools`)."""

from __future__ import annotations

from pathlib import Path

import httpx

from zeitzeuge_api.investigation.tools.base import HttpTool, ToolCache
from zeitzeuge_api.investigation.tools.commons import Commons
from zeitzeuge_api.investigation.tools.osm import Overpass
from zeitzeuge_api.investigation.tools.stasz import StaatsarchivCatalogue
from zeitzeuge_api.investigation.tools.swisstopo import Swisstopo
from zeitzeuge_api.investigation.tools.wikipedia import Wikipedia

MAX_REFERENCE_BYTES = 6 * 1024 * 1024
_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")


class Toolbox:
    def __init__(self, *, cache_dir: Path | None = None, replay: bool = False) -> None:
        self.client = httpx.AsyncClient(follow_redirects=True)
        self.cache = ToolCache(cache_dir, replay=replay)
        self.swisstopo = Swisstopo(self.client, self.cache)
        self.overpass = Overpass(self.client, self.cache)
        self.commons = Commons(self.client, self.cache)
        self.wikipedia = Wikipedia(self.client, self.cache)
        self.catalogue = StaatsarchivCatalogue(self.client, self.cache)
        self._images: dict[str, bytes | None] = {}
        self._image_dir = cache_dir / "images" if cache_dir else None
        if self._image_dir:
            try:
                self._image_dir.mkdir(parents=True, exist_ok=True)
            except OSError:
                self._image_dir = None
        self._replay = replay

    async def fetch_image(self, url: str) -> bytes | None:
        """A reference photo's thumbnail; None when it cannot be had."""
        if not url.startswith(("https://", "http://")):
            return None
        if url in self._images:
            return self._images[url]
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
            data = None
            try:
                response = await self.client.get(
                    url, headers={"User-Agent": HttpTool.USER_AGENT}, timeout=20
                )
                kind = response.headers.get("content-type", "").split(";")[0]
                if response.is_success and kind in _IMAGE_TYPES:
                    data = response.content[:MAX_REFERENCE_BYTES]
            except httpx.HTTPError:
                data = None
            if data and path is not None:
                path.write_bytes(data)
        self._images[url] = data
        return data

    async def close(self) -> None:
        await self.client.aclose()
