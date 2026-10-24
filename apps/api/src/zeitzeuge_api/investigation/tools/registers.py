"""Two Schwyz registers of *named* buildings, each with photographs to compare.

**KSI — Kantonales Schutzinventar** (Amt für Kultur, Canton Schwyz, open data):
1,110 protected buildings on the canton's WFS (`ms:ch.sz.a133a.kantonales_
schutzinventar`). The layer carries only a point and a link to the inventory
sheet; the sheet (PDF) carries the name («Schwyz - Pfarrkirche St. Martin»),
EGID, classification, a description and a photograph. Sheets are fetched only
for objects near a candidate place, cached, and their photographs become
reference images for the comparison stage.

**Wikidata** — every item located in Canton Schwyz (`P131+ wd:Q12433`) with
coordinates: 2,045 items, 672 with an image (`P18`). One SPARQL query per
process.

Neither register says what a photograph shows. A hit is a *named candidate with
a position and a picture*: the reference stage decides whether the photo shows
it (identification-upgrade note §2).
"""

from __future__ import annotations

import asyncio
import io
import re
from dataclasses import dataclass, field
from typing import Any

import httpx
from PIL import Image

from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.investigation.names import distinctive
from zeitzeuge_api.investigation.tools.base import HttpTool, MatchKind, ToolHit, ToolUnavailable
from zeitzeuge_api.investigation.tools.geo import distance_m, wgs84_to_lv95
from zeitzeuge_api.investigation.tools.text import contains_all_tokens, fold

log = get_logger(__name__)

KSI_WFS = (
    "https://map.geo.sz.ch/mapserv_proxy?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
    "&TYPENAME=ms:ch.sz.a133a.kantonales_schutzinventar&lang=de"
)
KSI_SOURCE = "Kanton Schwyz, Kantonales Schutzinventar KSI"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
WIKIDATA_QUERY = """
SELECT ?item ?itemLabel ?c ?img (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types)
WHERE {
  ?item wdt:P131+ wd:Q12433; wdt:P625 ?c .
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P31 ?type . ?type rdfs:label ?typeLabel . FILTER(LANG(?typeLabel) = "de") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en" }
}
GROUP BY ?item ?itemLabel ?c ?img
"""
MIN_PHOTO_BYTES = 30_000
"""Sheet images below this are logos and map snippets, not photographs."""

_MEMBER = re.compile(r"<wfs:member>(.*?)</wfs:member>", re.S)
_POS = re.compile(r"<gml:pos>\s*([\d.]+)\s+([\d.]+)\s*</gml:pos>")
_LINK = re.compile(r"href=&#39;(https://[^&]+?\.pdf)&#39;")
_POINT = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")


@dataclass(frozen=True, slots=True)
class KsiObject:
    number: str
    lv95: tuple[float, float]
    sheet_url: str


@dataclass(slots=True)
class KsiSheet:
    number: str
    municipality: str = ""
    name: str = ""
    egid: str = ""
    classification: str = ""
    kind: str = ""
    description: str = ""
    address: str = ""
    dated: str = ""
    photos: list[bytes] = field(default_factory=list)


def parse_ksi_layer(gml: str) -> list[KsiObject]:
    objects = []
    for member in _MEMBER.findall(gml):
        pos, link = _POS.search(member), _LINK.search(member)
        if pos is None or link is None:
            continue
        url = link.group(1)
        number = url.rsplit("/", 1)[-1].removesuffix(".pdf")
        objects.append(KsiObject(number, (float(pos.group(1)), float(pos.group(2))), url))
    return objects


def _field(text: str, label: str) -> str:
    found = re.search(rf"^{label}\s*:\s*(.+)$", text, re.M)
    return found.group(1).strip() if found else ""


def parse_ksi_sheet(number: str, text: str, photos: list[bytes]) -> KsiSheet:
    """Both sheet layouts the canton publishes.

    Older: «Schwyz  -  Pfarrkirche St. Martin 01.001» · «EGID : 190208071».
    Newer: «Küssnacht, Remise Rigigasse 23 27.078» · «Objekt-Adresse: Rigigasse 23,
    6403 Küssnacht» · «KTN  /  EGID: 1312  /  504128357».
    """
    sheet = KsiSheet(number=number, photos=photos)
    for line in text.splitlines():
        if line.rstrip().endswith(number):
            head = re.sub(r"\s+", " ", line.rstrip()[: -len(number)]).strip()
            separator = " - " if " - " in head else ", "
            municipality, _, name = head.partition(separator)
            sheet.municipality, sheet.name = municipality.strip(), name.strip()
            break
    egid = re.search(r"EGID\s*:\s*(?:\d+\s*/\s*)?(\d{5,})", text)
    sheet.egid = egid.group(1) if egid else ""
    sheet.address = _field(text, "Objekt-Adresse")
    sheet.dated = _field(text, "Datierung")
    sheet.classification = _field(text, "Einstufung")
    sheet.kind = _field(text, "Gattung")
    found = re.search(r"^Beschreibung\s*:\s*(.+?)(?:\n[A-Z][^\n:]{2,30}\s*:|\Z)", text, re.M | re.S)
    sheet.description = re.sub(r"\s+", " ", found.group(1)).strip()[:600] if found else ""
    return sheet


def _photos(pdf: bytes) -> tuple[str, list[bytes]]:
    from pypdf import PdfReader

    from zeitzeuge_api.investigation.tools.pages import limit_pdf_decompression

    limit_pdf_decompression()
    reader = PdfReader(io.BytesIO(pdf))
    page = reader.pages[0]
    text = page.extract_text() or ""
    photos = []
    for image in page.images:
        if len(image.data) < MIN_PHOTO_BYTES:
            continue
        try:
            picture = Image.open(io.BytesIO(image.data)).convert("RGB")
            picture.thumbnail((1024, 1024))
            out = io.BytesIO()
            picture.save(out, "JPEG", quality=85)
            photos.append(out.getvalue())
        except Exception as exc:  # one unreadable image must not lose the sheet
            log.info("ksi.image_skipped", error=type(exc).__name__)
    return text, photos


_STREET_NUMBER = re.compile(r"^(?P<street>[^\d,()]+?)\s+(?P<number>\d+[a-z]?)\b")


def street_and_number(sheet: KsiSheet) -> tuple[str, str] | None:
    """«Oberdorf 44, 6403 Küssnacht» or a name «Haus Hauptplatz 3 (…)» → (street, number)."""
    for text in (sheet.address, re.sub(r"^Haus\s+", "", sheet.name)):
        found = _STREET_NUMBER.match(text.strip()) if text else None
        if found:
            return found.group("street").strip(), found.group("number")
    return None


def alias(register_name: str) -> str | None:
    """«Haus Hauptplatz 3 (Hotel Wysses Rössli)» → «Hotel Wysses Rössli»."""
    found = re.search(r"\(([^)]+)\)\s*$", register_name)
    return found.group(1).split(",")[0].strip() if found else None


def names_match(register_name: str, proposed: str) -> bool:
    """«Pfarrkirche St. Martin» ~ «Kirche St. Martin Schwyz»: tokens, or the distinctive core."""
    a, b = distinctive(register_name), distinctive(proposed)
    if not a:
        return False  # «Kapelle», «Haus»: a register entry with no name of its own
    if contains_all_tokens(register_name, proposed) or contains_all_tokens(proposed, register_name):
        return True
    return a == b


class KsiInventory(HttpTool):
    def __init__(
        self, client: httpx.AsyncClient, cache: Any, images: dict[str, bytes | None]
    ) -> None:
        super().__init__(client, cache)
        self._objects: list[KsiObject] | None = None
        self._sheets: dict[str, KsiSheet | None] = {}
        self._lock = asyncio.Lock()
        self._images = images
        """The toolbox's image memo: sheet photos are put there under `<sheet>#photo<i>`."""

    async def _layer(self) -> list[KsiObject]:
        async with self._lock:
            if self._objects is None:
                text = await self._get_text(KSI_WFS)
                self._objects = parse_ksi_layer(text)
                log.info("ksi.loaded", objects=len(self._objects))
        return self._objects

    async def _get_text(self, url: str) -> str:
        key = self._cache.key("GET", url, None, None)
        cached = self._cache.get(key)
        if cached is not None:
            return str(cached)
        try:
            response = await self._client.get(
                url, headers={"User-Agent": self.USER_AGENT}, timeout=60
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ToolUnavailable(f"KSI: {exc}") from exc
        self._cache.put(key, response.text)
        return response.text

    async def sheet(self, obj: KsiObject) -> KsiSheet | None:
        if obj.number in self._sheets:
            return self._sheets[obj.number]
        sheet: KsiSheet | None = None
        try:
            response = await self._client.get(
                obj.sheet_url, headers={"User-Agent": self.USER_AGENT}, timeout=30
            )
            response.raise_for_status()
            text, photos = await asyncio.to_thread(_photos, response.content)
            sheet = parse_ksi_sheet(obj.number, text, photos)
            for i, photo in enumerate(photos):
                self._images[f"{obj.sheet_url}#photo{i}"] = photo
        except Exception as exc:
            log.warning("ksi.sheet_failed", number=obj.number, error=type(exc).__name__)
        self._sheets[obj.number] = sheet
        return sheet

    async def near(
        self, e: float, n: float, *, radius_m: float = 1500, limit: int = 12
    ) -> list[ToolHit]:
        objects = sorted(
            (o for o in await self._layer() if distance_m((e, n), o.lv95) <= radius_m),
            key=lambda o: distance_m((e, n), o.lv95),
        )[:limit]
        sheets = await asyncio.gather(*(self.sheet(o) for o in objects))
        hits = []
        for obj, sheet in zip(objects, sheets, strict=True):
            if sheet is None or not sheet.name:
                continue
            hits.append(
                ToolHit(
                    tool="ksi",
                    label=sheet.name,
                    source=f"{KSI_SOURCE}, Inventarblatt {obj.number}",
                    source_uri=obj.sheet_url,
                    match=MatchKind.SPATIAL,
                    kind="heritage",
                    lv95=obj.lv95,
                    distance_m=distance_m((e, n), obj.lv95),
                    attrs={
                        "ksi_nr": obj.number,
                        "egid": sheet.egid,
                        "municipality": sheet.municipality,
                        "classification": sheet.classification,
                        "gattung": sheet.kind,
                        "description": sheet.description,
                        "address": sheet.address,
                        "dated": sheet.dated,
                        **(
                            {"addr:street": sn[0], "addr:housenumber": sn[1]}
                            if (sn := street_and_number(sheet))
                            else {}
                        ),
                        "alias": alias(sheet.name),
                        "thumbnail": f"{obj.sheet_url}#photo0" if sheet.photos else None,
                    },
                )
            )
        return hits


class WikidataGazetteer(HttpTool):
    def __init__(self, client: httpx.AsyncClient, cache: Any) -> None:
        super().__init__(client, cache)
        self._items: list[ToolHit] | None = None
        self._lock = asyncio.Lock()

    async def items(self) -> list[ToolHit]:
        async with self._lock:
            if self._items is None:
                data = await self.get_json(
                    WIKIDATA_SPARQL, {"query": WIKIDATA_QUERY, "format": "json"}
                )
                self._items = [h for h in map(_wikidata_hit, data["results"]["bindings"]) if h]
                log.info("wikidata.loaded", items=len(self._items))
        return self._items

    async def find(self, name: str, *, near: tuple[float, float] | None = None) -> list[ToolHit]:
        hits = [h for h in await self.items() if names_match(h.label, name)]
        if near is not None:
            hits.sort(key=lambda h: distance_m(near, h.lv95) if h.lv95 else 1e9)
        return hits[:5]

    async def near(self, e: float, n: float, *, radius_m: float = 1500) -> list[ToolHit]:
        return sorted(
            (h for h in await self.items() if h.lv95 and distance_m((e, n), h.lv95) <= radius_m),
            key=lambda h: distance_m((e, n), h.lv95),  # type: ignore[arg-type]
        )


def _wikidata_hit(row: dict[str, Any]) -> ToolHit | None:
    point = _POINT.search(row.get("c", {}).get("value", ""))
    label = row.get("itemLabel", {}).get("value", "")
    if point is None or not label or re.fullmatch(r"Q\d+", label):
        return None
    lon, lat = float(point.group(1)), float(point.group(2))
    image = row.get("img", {}).get("value", "").replace("http://", "https://", 1)
    uri = row["item"]["value"].replace("http://", "https://", 1)
    return ToolHit(
        tool="wikidata",
        label=label,
        source=f"Wikidata, {uri.rsplit('/', 1)[-1]}",
        source_uri=uri,
        match=MatchKind.EXACT,
        kind=(row.get("types", {}).get("value") or "").split("|")[0],
        lv95=wgs84_to_lv95(lat, lon),
        attrs={
            "qid": uri.rsplit("/", 1)[-1],
            "types": row.get("types", {}).get("value", ""),
            "thumbnail": f"{image}?width=1024" if image else None,
            "folded": fold(label),
        },
    )
