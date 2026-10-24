"""swisstopo's keyless GeoAdmin API: the official registers behind four of the five fields.

Ortschaft, Gemeinde and Strasse are not judgement calls once a point is known:
they are what the Amtliches Ortschaftenverzeichnis, swissBOUNDARIES3D and the
Amtliches Gebäudeadressverzeichnis say about that point. This client asks them
(identify) and turns names into points first (SearchServer), always in LV95
(`sr=2056`) so no coordinate is ever converted twice.

Two quirks of the API are handled here so no caller trips over them:

* SearchServer returns `y` = East and `x` = North (the old Swiss axis naming).
* The municipality layer is a time series: an identify without `timeInstant`
  returns one feature per year since 1850. We ask for the current year and
  keep only `is_current_jahr` features.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import replace
from datetime import date
from typing import Any
from urllib.parse import urlencode

from zeitzeuge_api.investigation.tools.base import HttpTool, MatchKind, ToolHit
from zeitzeuge_api.investigation.tools.geo import LV95, distance_m, envelope
from zeitzeuge_api.investigation.tools.text import fold, name_match, strip_html

API = "https://api3.geo.admin.ch/rest/services"
SEARCH_URL = f"{API}/api/SearchServer"
IDENTIFY_URL = f"{API}/api/MapServer/identify"

LAYER_LOCALITY = "ch.swisstopo-vd.ortschaftenverzeichnis_plz"
LAYER_MUNICIPALITY = "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill"
LAYER_ADDRESS = "ch.swisstopo.amtliches-gebaeudeadressverzeichnis"
LAYER_NAMES = "ch.swisstopo.swissnames3d"

SOURCE_LOCALITY = "swisstopo, Amtliches Ortschaftenverzeichnis"
SOURCE_MUNICIPALITY = "swisstopo, swissBOUNDARIES3D Gemeindegrenzen"
SOURCE_ADDRESS = "swisstopo, Amtliches Gebäudeadressverzeichnis"
SOURCE_NAMES = "swisstopo, swissNAMES3D"

_SEARCH_SOURCE = {
    "gazetteer": f"{SOURCE_NAMES} (GeoAdmin-Suche)",
    "address": f"{SOURCE_ADDRESS} (GeoAdmin-Suche)",
    "gg25": f"{SOURCE_MUNICIPALITY} (GeoAdmin-Suche)",
    "zipcode": f"{SOURCE_LOCALITY} (GeoAdmin-Suche)",
    "district": "swisstopo, swissBOUNDARIES3D Bezirke (GeoAdmin-Suche)",
    "kantone": "swisstopo, swissBOUNDARIES3D Kantone (GeoAdmin-Suche)",
    "parcel": "Amtliche Vermessung, Liegenschaften (GeoAdmin-Suche)",
}
_SEARCH_KIND = {
    "address": "address",
    "zipcode": "zipcode",
    "gg25": "municipality",
    "district": "district",
    "kantone": "canton",
    "parcel": "parcel",
}
_SEARCH_LAYER = {
    "address": LAYER_ADDRESS,
    "zipcode": LAYER_LOCALITY,
    "gg25": LAYER_MUNICIPALITY,
    "gazetteer": LAYER_NAMES,
}

# swissNAMES3D `objektart` → the five-field vocabulary (See/Fluss/Berg, Gebäude).
_OBJEKTART_KIND = {
    "Gipfel": "peak",
    "Hauptgipfel": "peak",
    "Alpiner Gipfel": "peak",
    "Huegel": "peak",
    "Haupthuegel": "peak",
    "Felskopf": "peak",
    "See": "lake",
    "Seeteil": "lake",
    "Fliessgewaesser": "river",
    "Gebaeude": "building",
    "Offenes Gebaeude": "building",
}
# swissTLM3D object classes when no `objektart` is given (SearchServer labels).
_OBJECTCLASS_KIND = {
    "TLM_STEHENDES_GEWAESSER": "lake",
    "TLM_FLIESSGEWAESSER": "river",
    "TLM_GEBAEUDE": "building",
    "TLM_SIEDLUNGSNAME": "settlement",
    "TLM_FLURNAME": "field_name",
    "TLM_GELAENDENAME": "terrain_name",
    "TLM_GEBIETSNAME": "area_name",
    "TLM_STRASSE": "street",
    "TLM_NAME_PKT": "named_point",
    "TLM_AUS_EINFAHRT": "motorway_exit",
    "TLM_FREIZEITAREAL": "leisure_area",
}
NAME_KINDS = frozenset({"peak", "lake", "river", "building", "other"})

_CATEGORY = re.compile(r"<i>(.*?)</i>", re.S)
_CANTON_SUFFIX = re.compile(r"\s*\([A-Z]{2}\)(\s*-.*)?$")
_ADDRESS = re.compile(r"^(?P<street>.+?)\s+(?P<number>\d[\w./-]*)\s+(?P<plz>\d{4})\s+(?P<loc>.+)$")
_ZIPCODE = re.compile(r"^(?P<plz>\d{4})\s*-\s*(?P<loc>.+)$")


def map_url(
    e: float,
    n: float,
    *,
    layer: str | None = None,
    feature_id: str | int | None = None,
    zoom: int = 10,
) -> str:
    """A map.geo.admin.ch permalink centred on (E, N), with the layer and feature selected."""
    params: dict[str, str] = {"lang": "de", "E": f"{e:.1f}", "N": f"{n:.1f}", "zoom": str(zoom)}
    if layer:
        params["layers"] = layer
        if feature_id is not None:
            params[layer] = str(feature_id)
    params["crosshair"] = "marker"
    return "https://map.geo.admin.ch/?" + urlencode(params)


def feature_url(layer: str, feature_id: str | int) -> str:
    """The GeoAdmin REST URL of one feature (machine-readable proof)."""
    return f"{API}/api/MapServer/{layer}/{feature_id}"


def names_kind(objektart: str | None) -> str:
    return _OBJEKTART_KIND.get(objektart or "", "other")


def _leading_name(origin: str, label: str) -> str:
    """The name part of a SearchServer label, without canton, PLZ or municipality."""
    if origin == "address":
        m = _ADDRESS.match(label)
        return f"{m['street']} {m['number']}" if m else label
    if origin == "zipcode":
        m = _ZIPCODE.match(label)
        return m["loc"] if m else label
    return _CANTON_SUFFIX.sub("", label).strip()


def _search_hit(item: dict[str, Any], query: str) -> ToolHit:
    attrs_in = item.get("attrs", {})
    origin = str(attrs_in.get("origin", ""))
    raw_label = str(attrs_in.get("label", ""))
    category_match = _CATEGORY.search(raw_label)
    category = strip_html(category_match.group(1)) if category_match else None
    label = strip_html(_CATEGORY.sub("", raw_label))
    name = _leading_name(origin, label)
    objectclass = str(attrs_in.get("objectclass") or "")

    if origin == "gazetteer":
        kind = _OBJEKTART_KIND.get(category or "") or _OBJECTCLASS_KIND.get(
            objectclass, "gazetteer"
        )
    else:
        kind = _SEARCH_KIND.get(origin, origin or "location")

    # SearchServer's old axis naming: y is East, x is North.
    e, n = float(attrs_in["y"]), float(attrs_in["x"])
    feature_id = attrs_in.get("featureId")
    if origin in ("gg25", "zipcode", "district", "kantone"):
        feature_id = feature_id or item.get("id")

    attrs: dict[str, Any] = {
        "origin": origin,
        "name": name,
        "search_id": item.get("id"),
        "lat": attrs_in.get("lat"),
        "lon": attrs_in.get("lon"),
    }
    if objectclass:
        attrs["objectclass"] = objectclass
    if category:
        attrs["category"] = category
    if feature_id is not None:
        attrs["featureId"] = feature_id
    if origin == "gg25":
        # For municipalities SearchServer's `featureId` is the BFS number; `id` is internal.
        attrs["bfs_nr"] = _int_or_none(attrs_in.get("featureId"))
    if origin == "address":
        m = _ADDRESS.match(label)
        if m:
            attrs.update(
                street=m["street"], house_number=m["number"], plz=m["plz"], locality=m["loc"]
            )
        for link in attrs_in.get("links", []) or []:
            if link.get("title") == LAYER_ADDRESS:
                attrs["egaid"] = str(link.get("href", "")).rsplit("/", 1)[-1]
                attrs["api_uri"] = API + str(link["href"]).removeprefix("/rest/services")
        if isinstance(feature_id, str) and "_" in feature_id:
            attrs["egid"] = feature_id.split("_", 1)[0]
    if origin == "zipcode":
        m = _ZIPCODE.match(label)
        if m:
            attrs.update(plz=m["plz"], locality=m["loc"])

    layer = _SEARCH_LAYER.get(origin)
    selected = attrs.get("egaid") if origin == "address" else feature_id
    zoom = 6 if origin in ("gg25", "zipcode") else 10
    return ToolHit(
        tool="swisstopo.search",
        label=label,
        source=_SEARCH_SOURCE.get(origin, "swisstopo, GeoAdmin-Suche"),
        source_uri=map_url(e, n, layer=layer, feature_id=selected, zoom=zoom),
        match=name_match(name, query),
        kind=kind,
        lv95=(e, n),
        attrs=attrs,
    )


def _point_and_distance(geometry: dict[str, Any] | None, at: LV95) -> tuple[LV95 | None, float]:
    """Nearest vertex of a GeoJSON geometry to `at`, and its distance.

    A point that lies inside a polygon gets distance 0 and no position: the
    feature (a lake, a region) has no single point to report.
    """
    if not geometry:
        return None, float("inf")
    gtype = geometry.get("type", "")
    coords = geometry.get("coordinates", [])
    rings: list[list[list[float]]] = []
    if gtype == "Point":
        points = [coords]
    elif gtype in ("MultiPoint", "LineString"):
        points = list(coords)
    elif gtype in ("MultiLineString", "Polygon"):
        rings = list(coords) if gtype == "Polygon" else []
        points = [p for line in coords for p in line]
    elif gtype == "MultiPolygon":
        rings = [poly[0] for poly in coords if poly]
        points = [p for poly in coords for ring in poly for p in ring]
    else:
        points = []
    if not points:
        return None, float("inf")
    nearest = min(points, key=lambda p: distance_m((p[0], p[1]), at))
    best: LV95 = (float(nearest[0]), float(nearest[1]))
    if any(_inside(at, ring) for ring in rings):
        return None, 0.0
    return best, distance_m(best, at)


def _inside(point: LV95, ring: Iterable[list[float]]) -> bool:
    """Ray casting; good enough to say «the query point lies in this lake»."""
    x, y = point
    pts = list(ring)
    inside = False
    for i in range(len(pts)):
        x1, y1 = pts[i][0], pts[i][1]
        x2, y2 = pts[i - 1][0], pts[i - 1][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


class Swisstopo(HttpTool):
    """SearchServer (names → points) and identify (points → registers)."""

    async def search_locations(
        self, text: str, *, limit: int = 10, origins: str | None = None
    ) -> list[ToolHit]:
        """Free-text location search; `origins` narrows to e.g. `address` or `gazetteer`."""
        params: dict[str, Any] = {
            "searchText": text,
            "type": "locations",
            "sr": "2056",
            "limit": str(limit),
        }
        if origins:
            params["origins"] = origins
        data = await self.get_json(SEARCH_URL, params)
        return [_search_hit(item, text) for item in data.get("results", [])]

    async def find_address(
        self, street: str, house_number: str | None, *, locality: str | None = None
    ) -> list[ToolHit]:
        """Addresses only. EXACT when street and number are exactly the register's."""
        query = " ".join(p for p in (street, house_number, locality) if p)
        hits = await self.search_locations(query, limit=10, origins="address")
        wanted = f"{street} {house_number}" if house_number else street
        out: list[ToolHit] = []
        for hit in hits:
            found = str(hit.attrs.get("name", hit.label))
            if not house_number:
                found = str(hit.attrs.get("street", found))
            if locality and fold(str(hit.attrs.get("locality", ""))) != fold(locality):
                continue
            out.append(_replace_match(hit, name_match(found, wanted)))
        rank = {MatchKind.EXACT: 0, MatchKind.NORMALISED: 1, MatchKind.FUZZY: 2}
        return sorted(out, key=lambda h: rank.get(h.match, 3))

    async def _identify(
        self,
        layer: str,
        geometry: str,
        *,
        geometry_type: str = "esriGeometryPoint",
        return_geometry: bool = False,
        limit: int | None = None,
        extra: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "geometryType": geometry_type,
            "geometry": geometry,
            "sr": "2056",
            "layers": f"all:{layer}",
            "tolerance": "0",
            "returnGeometry": "true" if return_geometry else "false",
            "lang": "de",
        }
        if return_geometry:
            params["geometryFormat"] = "geojson"
        if limit is not None:
            params["limit"] = str(limit)
        if extra:
            params.update(extra)
        data = await self.get_json(IDENTIFY_URL, params)
        return list(data.get("results", []))

    async def locality_at(self, e: float, n: float) -> ToolHit | None:
        """The Ortschaft (PLZ area) containing the point."""
        results = await self._identify(LAYER_LOCALITY, f"{e:.2f},{n:.2f}")
        if not results:
            return None
        feature = results[0]
        a = feature.get("attributes") or feature.get("properties") or {}
        return ToolHit(
            tool="swisstopo.identify",
            label=str(a.get("langtext", "")),
            source=SOURCE_LOCALITY,
            source_uri=map_url(e, n, layer=LAYER_LOCALITY, feature_id=feature.get("featureId")),
            match=MatchKind.SPATIAL,
            kind="locality",
            distance_m=0.0,
            attrs={
                "plz": str(a.get("plz", "")),
                "zusziff": a.get("zusziff"),
                "featureId": feature.get("featureId"),
                "layer": LAYER_LOCALITY,
                "api_uri": feature_url(LAYER_LOCALITY, str(feature.get("featureId"))),
            },
        )

    async def municipality_at(
        self, e: float, n: float, *, year: int | None = None
    ) -> ToolHit | None:
        """The political municipality (Gemeinde) containing the point, with its BFS number.

        `year` defaults to the current one; tests pin it so a recorded response
        stays addressable next year.
        """
        point = f"{e:.2f},{n:.2f}"
        instant = str(year or date.today().year)
        results = await self._identify(LAYER_MUNICIPALITY, point, extra={"timeInstant": instant})
        current = [r for r in results if _attrs(r).get("is_current_jahr")]
        if not current:
            # A new year whose boundaries are not loaded yet: take the whole series.
            results = await self._identify(LAYER_MUNICIPALITY, point)
            current = [r for r in results if _attrs(r).get("is_current_jahr")]
        if not current:
            return None
        feature = current[0]
        a = _attrs(feature)
        return ToolHit(
            tool="swisstopo.identify",
            label=str(a.get("gemname", "")),
            source=SOURCE_MUNICIPALITY,
            source_uri=map_url(
                e, n, layer=LAYER_MUNICIPALITY, feature_id=feature.get("featureId"), zoom=6
            ),
            match=MatchKind.SPATIAL,
            kind="municipality",
            distance_m=0.0,
            attrs={
                "bfs_nr": a.get("gde_nr"),
                "canton": a.get("kanton"),
                "year": a.get("jahr"),
                "featureId": feature.get("featureId"),
                "layer": LAYER_MUNICIPALITY,
                "api_uri": feature_url(LAYER_MUNICIPALITY, str(feature.get("featureId"))),
            },
        )

    async def addresses_near(self, e: float, n: float, *, radius_m: float = 60) -> list[ToolHit]:
        """Official building addresses within `radius_m`, nearest first."""
        results = await self._identify(
            LAYER_ADDRESS,
            envelope(e, n, radius_m),
            geometry_type="esriGeometryEnvelope",
            return_geometry=True,
            limit=200,
        )
        hits: list[ToolHit] = []
        for feature in results:
            a = _attrs(feature)
            pos, dist = _point_and_distance(feature.get("geometry"), (e, n))
            if pos is None or dist > radius_m:
                continue
            street = str(a.get("stn_label", ""))
            number = str(a.get("adr_number") or "")
            zip_label = str(a.get("zip_label", ""))
            plz, _, locality = zip_label.partition(" ")
            fid = feature.get("featureId")
            hits.append(
                ToolHit(
                    tool="swisstopo.identify",
                    label=f"{street} {number}".strip(),
                    source=SOURCE_ADDRESS,
                    source_uri=map_url(pos[0], pos[1], layer=LAYER_ADDRESS, feature_id=fid),
                    match=MatchKind.SPATIAL,
                    kind="address",
                    lv95=pos,
                    distance_m=round(dist, 1),
                    attrs={
                        "street": street,
                        "house_number": number,
                        "plz": plz,
                        "locality": locality,
                        "egid": a.get("bdg_egid"),
                        "egaid": a.get("adr_egaid"),
                        "municipality": a.get("com_name"),
                        "bfs_nr": a.get("com_fosnr"),
                        "building_category": a.get("bdg_category"),
                        "official": a.get("adr_official"),
                        "featureId": fid,
                        "api_uri": feature_url(LAYER_ADDRESS, str(fid)),
                    },
                )
            )
        return sorted(hits, key=lambda h: (h.distance_m or 0.0, h.label))

    async def names_near(
        self,
        e: float,
        n: float,
        *,
        radius_m: float = 3000,
        kinds: set[str] | None = None,
    ) -> list[ToolHit]:
        """swissNAMES3D named features within `radius_m`, nearest first.

        `kinds` filters on the normalised kind (`peak`, `lake`, `river`,
        `building`, `other`). The identify call returns at most 200 features
        for the square around the point; a large radius in a dense area can
        therefore miss small names — narrow `kinds` and keep the radius honest.
        """
        results = await self._identify(
            LAYER_NAMES,
            envelope(e, n, radius_m),
            geometry_type="esriGeometryEnvelope",
            return_geometry=True,
            limit=200,
        )
        best: dict[tuple[str, str], ToolHit] = {}
        for feature in results:
            a = _attrs(feature)
            name = str(a.get("name", "")).strip()
            objektart = str(a.get("objektart", ""))
            kind = names_kind(objektart)
            if not name or (kinds is not None and kind not in kinds):
                continue
            pos, dist = _point_and_distance(feature.get("geometry"), (e, n))
            if dist > radius_m:
                continue
            fid = feature.get("featureId")
            centre = pos or (e, n)
            hit = ToolHit(
                tool="swisstopo.identify",
                label=name,
                source=SOURCE_NAMES,
                source_uri=map_url(centre[0], centre[1], layer=LAYER_NAMES, feature_id=fid),
                match=MatchKind.SPATIAL,
                kind=kind,
                lv95=pos,
                distance_m=round(dist, 1),
                attrs={
                    "objektart": objektart,
                    "objektklasse": a.get("objektklasse"),
                    "status": a.get("status"),
                    "geometry_type": (feature.get("geometry") or {}).get("type"),
                    "featureId": fid,
                    "api_uri": feature_url(LAYER_NAMES, str(fid)),
                },
            )
            key = (name, objektart)
            if key not in best or (hit.distance_m or 0.0) < (best[key].distance_m or 0.0):
                best[key] = hit
        return sorted(best.values(), key=lambda h: (h.distance_m or 0.0, h.label))


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _attrs(feature: dict[str, Any]) -> dict[str, Any]:
    return dict(feature.get("attributes") or feature.get("properties") or {})


def _replace_match(hit: ToolHit, match: MatchKind) -> ToolHit:
    return replace(hit, match=match)
