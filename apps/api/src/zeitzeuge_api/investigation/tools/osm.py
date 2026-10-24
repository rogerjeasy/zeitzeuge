"""OpenStreetMap via Overpass: the names that official registers do not carry.

The Gebäudeadressverzeichnis knows that «Grundstrasse 32a» exists; it does not
know that the building is the «Alterszentrum Acherhof». OSM does, with the
amenity it serves and often the address on the same object. That makes it the
bridge from a building *type* the model saw (an old people's home, a church) to
a building *name* and back to an official address.

OSM is volunteered data, so a hit is evidence, never a register entry: name
search is FUZZY unless the name is identical, and features found around a point
are SPATIAL with their distance.
"""

from __future__ import annotations

from typing import Any

from zeitzeuge_api.investigation.tools.base import HttpTool, MatchKind, ToolHit, ToolUnavailable
from zeitzeuge_api.investigation.tools.geo import distance_m, lv95_to_wgs84, wgs84_to_lv95
from zeitzeuge_api.investigation.tools.text import name_match

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SOURCE = "OpenStreetMap-Mitwirkende (ODbL), via Overpass API"

# Keys whose value says what a named feature *is*, in order of preference.
KIND_KEYS = ("amenity", "tourism", "healthcare", "historic", "leisure", "shop", "office")
# Named but useless for identifying a photographed place.
_NOISE = frozenset(
    {
        "parking",
        "parking_entrance",
        "parking_space",
        "bicycle_parking",
        "motorcycle_parking",
        "charging_station",
        "car_sharing",
        "vending_machine",
        "waste_basket",
        "bench",
        "atm",
        "baby_hatch",
        "post_box",
        "recycling",
        "toilets",
        "drinking_water",
    }
)
_KEPT_TAGS = (
    "name",
    "amenity",
    "building",
    "tourism",
    "healthcare",
    "historic",
    "leisure",
    "social_facility",
    "social_facility:for",
    "religion",
    "operator",
    "addr:street",
    "addr:housenumber",
    "addr:postcode",
    "addr:city",
    "wikidata",
    "wikipedia",
    "website",
    "start_date",
    "heritage",
    "highway",
    "place",
)
# Canton of Schwyz bounding box (S, W, N, E). A bbox is an index lookup for
# Overpass; `area[...]` and large `around:` circles with a name regex time out.
SZ_BBOX = (46.88, 8.38, 47.23, 9.01)


def _kind(tags: dict[str, str]) -> str:
    for key in KIND_KEYS:
        if tags.get(key):
            return tags[key]
    building = tags.get("building")
    if building and building != "yes":
        return building
    if building:
        return "building"
    if tags.get("highway"):
        return "street"
    return tags.get("place") or tags.get("natural") or tags.get("waterway") or "feature"


def _ql_regex(text: str) -> str:
    """Escape `text` for an Overpass QL string holding a POSIX regex.

    Two layers, in order: first make every character a literal for the regex,
    then make the result safe inside a double-quoted QL string. Names come from
    a model and from registers, so control characters and newlines are dropped
    before either step — they have no business in a place name.
    """
    printable = "".join(ch for ch in text if ch.isprintable())[:120]
    regex = "".join("\\" + ch if ch in r"\.^$|?*+()[]{}" else ch for ch in printable)
    return regex.replace("\\", "\\\\").replace('"', '\\"')


class Overpass(HttpTool):
    """Named OSM features around a point, or by name."""

    async def _run(self, query: str) -> list[dict[str, Any]]:
        data = await self.post_form_json(OVERPASS_URL, {"data": query}, validate=_check_remark)
        return list(data.get("elements", []))

    async def named_features_near(
        self, e: float, n: float, *, radius_m: float = 400
    ) -> list[ToolHit]:
        """Named buildings, amenities and tourism features within `radius_m`, nearest first."""
        lat, lon = lv95_to_wgs84(e, n)
        around = f"(around:{radius_m:.0f},{lat:.6f},{lon:.6f})"
        selectors = "".join(
            f'nwr{around}["name"]["{key}"];' for key in ("building", *KIND_KEYS[:5])
        )
        query = f"[out:json][timeout:25];({selectors});out center tags;"
        hits = [
            hit
            for element in await self._run(query)
            if (hit := self._hit(element, at=(e, n), query=None)) is not None
        ]
        hits = [h for h in hits if h.distance_m is None or h.distance_m <= radius_m]
        return sorted(hits, key=lambda h: (h.distance_m or 0.0, h.label))

    async def search_name(
        self,
        name: str,
        *,
        near: tuple[float, float] | None = None,
        radius_m: float = 8000,
    ) -> list[ToolHit]:
        """Features whose name contains `name` (case-insensitive).

        With `near` (LV95) the search covers a circle of `radius_m` (queried as
        its bounding box, then cut to the circle); without it, the canton of
        Schwyz's bounding box.
        """
        pattern = _ql_regex(name)
        if near is not None:
            south, west = lv95_to_wgs84(near[0] - radius_m, near[1] - radius_m)
            north, east = lv95_to_wgs84(near[0] + radius_m, near[1] + radius_m)
            bbox = (south, west, north, east)
        else:
            bbox = SZ_BBOX
        scope = "({:.4f},{:.4f},{:.4f},{:.4f})".format(*bbox)
        query = f'[out:json][timeout:35];nwr["name"~"{pattern}",i]{scope};out center tags;'
        hits = [
            hit
            for element in await self._run(query)
            if (hit := self._hit(element, at=near, query=name)) is not None
        ]
        if near is not None:
            hits = [h for h in hits if h.distance_m is None or h.distance_m <= radius_m]
        rank = {MatchKind.EXACT: 0, MatchKind.NORMALISED: 1, MatchKind.FUZZY: 2}
        return sorted(hits, key=lambda h: (rank.get(h.match, 3), h.distance_m or 0.0))

    @staticmethod
    def _hit(
        element: dict[str, Any], *, at: tuple[float, float] | None, query: str | None
    ) -> ToolHit | None:
        tags: dict[str, str] = element.get("tags", {})
        name = tags.get("name")
        if not name:
            return None
        kind = _kind(tags)
        if query is None and kind in _NOISE:
            return None
        if "lat" in element:
            lat, lon = float(element["lat"]), float(element["lon"])
        elif "center" in element:
            lat, lon = float(element["center"]["lat"]), float(element["center"]["lon"])
        else:
            return None
        pos = wgs84_to_lv95(lat, lon)
        pos = (round(pos[0], 1), round(pos[1], 1))
        osm_type, osm_id = str(element.get("type", "node")), element.get("id")
        attrs: dict[str, Any] = {k: tags[k] for k in _KEPT_TAGS if k in tags}
        attrs.update(osm_type=osm_type, osm_id=osm_id, lat=lat, lon=lon)
        return ToolHit(
            tool="osm.overpass",
            label=name,
            source=SOURCE,
            source_uri=f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
            match=name_match(name, query) if query is not None else MatchKind.SPATIAL,
            kind=kind,
            lv95=pos,
            distance_m=round(distance_m(pos, at), 1) if at is not None else None,
            attrs=attrs,
        )


def _check_remark(data: Any) -> None:
    """Overpass answers a timed-out query with HTTP 200, no elements and a remark."""
    remark = str(data.get("remark", "")) if isinstance(data, dict) else ""
    if "error" in remark.lower():
        raise ToolUnavailable(f"Overpass: {remark}")
