"""Google's public tools, as the brief names them: image search, Maps, Street View.

* **Cloud Vision** `images:annotate` — WEB_DETECTION (pages that carry the same or
  a near-identical picture, best-guess labels, web entities), LANDMARK_DETECTION
  (name + position) and TEXT_DETECTION (OCR) in one call per photograph.
* **Google Lens** through SerpApi — a second reverse-image engine; it needs a
  public URL of the image (a short-lived presigned URL of the access copy).
* **Places API (New)** — named places with position, address and photos.
* **Street View Static** — the view at a candidate's position (metadata is free).

Keys never leave this module: Places and Street View photos are addressed as
`places-photo://…` and `streetview://…` and resolved by `fetch_photo`, so no
URL with a key reaches the ledger, the cache keys or the workbook.
"""

from __future__ import annotations

import base64
import math
from typing import Any

import httpx

from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.investigation.tools.base import (
    HttpTool,
    MatchKind,
    ToolCache,
    ToolHit,
    ToolUnavailable,
)
from zeitzeuge_api.investigation.tools.geo import lv95_to_wgs84, wgs84_to_lv95

log = get_logger(__name__)

VISION_URL = "https://vision.googleapis.com/v1/images:annotate"
SERPAPI_URL = "https://serpapi.com/search.json"
PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_MEDIA_URL = "https://places.googleapis.com/v1/{name}/media"
STREETVIEW_META_URL = "https://maps.googleapis.com/maps/api/streetview/metadata"
STREETVIEW_URL = "https://maps.googleapis.com/maps/api/streetview"
PLACES_FIELDS = ",".join(
    f"places.{f}"
    for f in (
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "primaryType",
        "photos",
        "addressComponents",
        "googleMapsUri",
    )
)
PLACES_SOURCE = "Google Maps (Places API)"
STREETVIEW_SOURCE = "Google Street View"


class GoogleTools(HttpTool):
    def __init__(
        self, client: httpx.AsyncClient, cache: ToolCache, *, google_key: str, serpapi_key: str
    ) -> None:
        super().__init__(client, cache)
        self._key = google_key
        self._serpapi = serpapi_key

    @property
    def available(self) -> bool:
        return bool(self._key)

    @property
    def lens_available(self) -> bool:
        return bool(self._serpapi)

    # --- Cloud Vision ------------------------------------------------------------

    async def annotate(self, image_jpeg: bytes, image_sha256: str) -> dict[str, Any]:
        if not self._key:
            raise ToolUnavailable("kein Google-Schlüssel")
        key = ToolCache.key("VISION", "annotate-v1", None, image_sha256)
        cached = self._cache.get(key)
        if cached is not None:
            return dict(cached)
        body = {
            "requests": [
                {
                    "image": {"content": base64.b64encode(image_jpeg).decode()},
                    "features": [
                        {"type": "WEB_DETECTION", "maxResults": 30},
                        {"type": "LANDMARK_DETECTION", "maxResults": 5},
                        {"type": "TEXT_DETECTION", "maxResults": 50},
                    ],
                    "imageContext": {"webDetectionParams": {"includeGeoResults": True}},
                }
            ]
        }
        try:
            response = await self._client.post(
                VISION_URL, params={"key": self._key}, json=body, timeout=60
            )
            response.raise_for_status()
            result = dict(response.json()["responses"][0])
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ToolUnavailable(f"Cloud Vision: {type(exc).__name__}") from exc
        if "error" in result:
            raise ToolUnavailable(f"Cloud Vision: {result['error'].get('message', '')[:160]}")
        self._cache.put(key, result)
        return result

    # --- Google Lens (SerpApi) ---------------------------------------------------

    async def lens(self, public_url: str, image_sha256: str) -> dict[str, Any]:
        if not self._serpapi:
            raise ToolUnavailable("kein SerpApi-Schlüssel")
        key = ToolCache.key("LENS", "google_lens-v1", None, image_sha256)
        cached = self._cache.get(key)
        if cached is not None:
            return dict(cached)
        params = {
            "engine": "google_lens",
            "url": public_url,
            "hl": "de",
            "country": "ch",
            "api_key": self._serpapi,
        }
        try:
            response = await self._client.get(SERPAPI_URL, params=params, timeout=90)
            response.raise_for_status()
            result = dict(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise ToolUnavailable(f"Google Lens: {type(exc).__name__}") from exc
        if result.get("error"):
            raise ToolUnavailable(f"Google Lens: {str(result['error'])[:160]}")
        result.pop("search_metadata", None)
        result.pop("search_parameters", None)  # carries the presigned URL
        self._cache.put(key, result)
        return result

    # --- Places ------------------------------------------------------------------

    async def places_text(
        self, query: str, *, near: tuple[float, float] | None, radius_m: float = 15_000
    ) -> list[ToolHit]:
        if not self._key:
            return []
        body: dict[str, Any] = {
            "textQuery": query,
            "languageCode": "de",
            "regionCode": "CH",
            "maxResultCount": 5,
        }
        if near is not None:
            lat, lon = lv95_to_wgs84(*near)
            body["locationBias"] = {
                "circle": {"center": {"latitude": lat, "longitude": lon}, "radius": radius_m}
            }
        key = ToolCache.key("PLACES", PLACES_TEXT_URL, None, repr(sorted(body.items())))
        cached = self._cache.get(key)
        if cached is None:
            try:
                response = await self._client.post(
                    PLACES_TEXT_URL,
                    json=body,
                    headers={"X-Goog-Api-Key": self._key, "X-Goog-FieldMask": PLACES_FIELDS},
                    timeout=30,
                )
                response.raise_for_status()
                cached = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise ToolUnavailable(f"Google Places: {type(exc).__name__}") from exc
            self._cache.put(key, cached)
        return [hit for place in cached.get("places", []) if (hit := _place_hit(place, near))]

    # --- Street View -------------------------------------------------------------

    async def streetview_toward(
        self, target: tuple[float, float], *, radius_m: int = 80
    ) -> ToolHit | None:
        """The nearest outdoor panorama within `radius_m`, looking at `target` (LV95)."""
        if not self._key:
            return None
        lat, lon = lv95_to_wgs84(*target)
        params = {"location": f"{lat:.6f},{lon:.6f}", "radius": str(radius_m), "source": "outdoor"}
        key = ToolCache.key("STREETVIEW-META", STREETVIEW_META_URL, params, None)
        meta = self._cache.get(key)
        if meta is None:
            try:
                response = await self._client.get(
                    STREETVIEW_META_URL, params={**params, "key": self._key}, timeout=20
                )
                response.raise_for_status()
                meta = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise ToolUnavailable(f"Street View: {type(exc).__name__}") from exc
            self._cache.put(key, meta)
        if meta.get("status") != "OK" or not meta.get("pano_id"):
            return None
        pano_lat, pano_lon = meta["location"]["lat"], meta["location"]["lng"]
        heading = _bearing(pano_lat, pano_lon, lat, lon)
        pano = wgs84_to_lv95(pano_lat, pano_lon)
        return ToolHit(
            tool="streetview",
            label=f"Street View ({meta.get('date', 'Datum unbekannt')}), Blick {heading:.0f}°",
            source=STREETVIEW_SOURCE,
            source_uri=(
                "https://www.google.com/maps/@?api=1&map_action=pano"
                f"&pano={meta['pano_id']}&heading={heading:.0f}"
            ),
            match=MatchKind.SPATIAL,
            kind="street_view",
            lv95=pano,
            distance_m=math.dist(pano, target),
            attrs={
                "thumbnail": f"streetview://{meta['pano_id']}/{heading:.0f}",
                "pano_date": meta.get("date"),
            },
        )

    # --- photos behind internal addresses ------------------------------------------

    async def fetch_photo(self, address: str) -> bytes | None:
        if not self._key:
            return None
        if address.startswith("places-photo://"):
            url = PLACES_MEDIA_URL.format(name=address.removeprefix("places-photo://"))
            params = {"maxWidthPx": "1024", "key": self._key}
        elif address.startswith("streetview://"):
            pano, _, heading = address.removeprefix("streetview://").partition("/")
            url = STREETVIEW_URL
            params = {
                "size": "640x640",
                "pano": pano,
                "heading": heading,
                "fov": "75",
                "pitch": "8",
                "key": self._key,
            }
        else:
            return None
        try:
            response = await self._client.get(url, params=params, timeout=30, follow_redirects=True)
            if not response.is_success or not response.headers.get("content-type", "").startswith(
                "image/"
            ):
                return None
            return response.content
        except httpx.HTTPError:
            return None


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_lon = math.radians(lon2 - lon1)
    x = math.sin(d_lon) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _component(place: dict[str, Any], kind: str) -> str:
    for component in place.get("addressComponents", []) or []:
        if kind in component.get("types", []):
            return str(component.get("longText") or component.get("shortText") or "")
    return ""


def _place_hit(place: dict[str, Any], near: tuple[float, float] | None) -> ToolHit | None:
    location = place.get("location") or {}
    name = (place.get("displayName") or {}).get("text", "")
    if not name or "latitude" not in location:
        return None
    lv95 = wgs84_to_lv95(location["latitude"], location["longitude"])
    photos = [p["name"] for p in place.get("photos", []) or [] if p.get("name")][:2]
    attrs: dict[str, Any] = {
        "place_id": place.get("id"),
        "address": place.get("formattedAddress", ""),
        "types": place.get("types", []),
        "thumbnail": f"places-photo://{photos[0]}" if photos else None,
        "thumbnails": [f"places-photo://{p}" for p in photos],
        "municipality": _component(place, "locality"),
    }
    street, number = _component(place, "route"), _component(place, "street_number")
    if street and number:
        attrs["addr:street"], attrs["addr:housenumber"] = street, number
    return ToolHit(
        tool="google.places",
        label=name,
        source=PLACES_SOURCE,
        source_uri=str(place.get("googleMapsUri") or ""),
        match=MatchKind.FUZZY,
        kind=str(place.get("primaryType") or ""),
        lv95=lv95,
        distance_m=math.dist(near, lv95) if near else None,
        attrs=attrs,
    )
