"""Wikimedia Commons: other people's photographs of the same place.

A Commons file titled «Schwyz - Acherhof» with a thumbnail an archivist can put
next to the Staatsarchiv print is reference evidence (`reference_image`): it
does not prove the place, it lets a person compare. Two entry points match the
two questions the reference stage asks — «what is called like this?» (search)
and «what was photographed here?» (geosearch around the candidate point).
"""

from __future__ import annotations

from typing import Any

from zeitzeuge_api.investigation.tools.base import HttpTool, MatchKind, ToolHit
from zeitzeuge_api.investigation.tools.geo import distance_m, wgs84_to_lv95
from zeitzeuge_api.investigation.tools.text import contains_all_tokens, strip_html

API_URL = "https://commons.wikimedia.org/w/api.php"
SOURCE = "Wikimedia Commons"
THUMB_WIDTH = "320"
# Wikimedia's robot policy (https://w.wiki/4wJS) rejects a User-Agent without
# contact information with a 403, so these two clients name the public repo.
WIKIMEDIA_USER_AGENT = (
    "ZEITZEUGE/0.1 (+https://github.com/rogerjeasy/zeitzeuge; Zentral Hack 2026, "
    "Staatsarchiv Schwyz challenge) httpx"
)
_EXTMETA = (
    "ImageDescription|ObjectName|Categories|DateTimeOriginal|Artist|LicenseShortName"
    "|GPSLatitude|GPSLongitude"
)


def _meta(extmetadata: dict[str, Any], key: str) -> str | None:
    value = (extmetadata.get(key) or {}).get("value")
    if value is None or value == "":
        return None
    return strip_html(str(value))


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class Commons(HttpTool):
    """File search and geosearch in the File: namespace."""

    USER_AGENT = WIKIMEDIA_USER_AGENT

    def _base_params(self) -> dict[str, Any]:
        return {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo|coordinates",
            "iiprop": "url|extmetadata",
            "iiurlwidth": THUMB_WIDTH,
            "iiextmetadatafilter": _EXTMETA,
            "iiextmetadatalanguage": "de",
            "colimit": "max",
        }

    async def search_files(self, query: str, *, limit: int = 10) -> list[ToolHit]:
        params = self._base_params() | {
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": "6",
            "gsrlimit": str(limit),
        }
        data = await self.get_json(API_URL, params)
        pages = sorted(data.get("query", {}).get("pages", []), key=lambda p: p.get("index", 0))
        return [self._hit(page, query=query, at=None) for page in pages]

    async def geosearch(
        self, lat: float, lon: float, *, radius_m: int = 500, limit: int = 20
    ) -> list[ToolHit]:
        """Files with camera or object coordinates within `radius_m` (Commons caps at 10 km)."""
        params = self._base_params() | {
            "generator": "geosearch",
            "ggscoord": f"{lat:.6f}|{lon:.6f}",
            "ggsradius": str(min(radius_m, 10000)),
            "ggslimit": str(limit),
            "ggsnamespace": "6",
        }
        data = await self.get_json(API_URL, params)
        at = wgs84_to_lv95(lat, lon)
        hits = [
            self._hit(page, query=None, at=at) for page in data.get("query", {}).get("pages", [])
        ]
        return sorted(hits, key=lambda h: (h.distance_m is None, h.distance_m or 0.0))

    @staticmethod
    def _hit(page: dict[str, Any], *, query: str | None, at: tuple[float, float] | None) -> ToolHit:
        title = str(page.get("title", ""))
        info = (page.get("imageinfo") or [{}])[0]
        ext = info.get("extmetadata") or {}
        description = _meta(ext, "ImageDescription")
        categories = [c for c in (_meta(ext, "Categories") or "").split("|") if c]

        lat = lon = None
        coords = page.get("coordinates") or []
        if coords:
            lat, lon = _float(coords[0].get("lat")), _float(coords[0].get("lon"))
        if lat is None or lon is None:
            lat, lon = _float(_meta(ext, "GPSLatitude")), _float(_meta(ext, "GPSLongitude"))
        lv95 = None
        if lat is not None and lon is not None:
            e, n = wgs84_to_lv95(lat, lon)
            lv95 = (round(e, 1), round(n, 1))

        if query is None:
            match = MatchKind.SPATIAL
        elif contains_all_tokens(title, query):
            match = MatchKind.NORMALISED
        else:
            match = MatchKind.FUZZY

        label = title.removeprefix("File:")
        return ToolHit(
            tool="commons.geosearch" if query is None else "commons.search",
            label=label,
            source=f"{SOURCE}, «{label}»",
            source_uri=str(
                info.get("descriptionurl")
                or "https://commons.wikimedia.org/wiki/" + title.replace(" ", "_")
            ),
            match=match,
            kind="photo",
            lv95=lv95,
            distance_m=round(distance_m(lv95, at), 1) if lv95 and at else None,
            attrs={
                "title": title,
                "page_id": page.get("pageid"),
                "description": description,
                "object_name": _meta(ext, "ObjectName"),
                "categories": categories,
                "date": _meta(ext, "DateTimeOriginal"),
                "artist": _meta(ext, "Artist"),
                "license": _meta(ext, "LicenseShortName"),
                "thumbnail": info.get("thumburl"),
                "url": info.get("url"),
                "lat": lat,
                "lon": lon,
            },
        )
