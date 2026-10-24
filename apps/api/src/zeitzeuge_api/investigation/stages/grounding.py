"""Grounding (roster: `geo`, `heritage`) — resolve names against official registers.

Every name a stage proposed — the image (Perception), the web (Research), the
picture online (Sighting) — is looked up in swisstopo's SearchServer. A hit that
*is* that name (exact or after folding) becomes `geodata_layer` evidence with the
register's spelling and position, at `REGISTER_EXISTENCE` strength: it proves the
name exists and where, not that this photograph shows it (identification-upgrade
note §2). Schwyz hits are preferred; a name that exists only outside the canton is
kept, because the brief allows «Orte ausserhalb des Kantons». Building names are
also searched in OpenStreetMap near the locality.

When the image shows a building of a recognisable type but no readable name
(SG.CIV.17.3: a large care home under the Mythen, no sign), the stage asks
OpenStreetMap for named buildings of that type around each candidate locality.
Those are *candidates*, not evidence: only the reference stage, by comparing
photographs, can turn one into evidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from zeitzeuge_api.db.models.enums import AgentId, EvidenceKind, SourceClass
from zeitzeuge_api.investigation.confidence import REGISTER_EXISTENCE, strength_for_match
from zeitzeuge_api.investigation.context import RunContext
from zeitzeuge_api.investigation.contracts import Perception
from zeitzeuge_api.investigation.names import feature_key, is_placeholder, massif
from zeitzeuge_api.investigation.tools.base import MatchKind, ToolHit, ToolUnavailable
from zeitzeuge_api.investigation.tools.geo import distance_m
from zeitzeuge_api.investigation.tools.registers import names_match
from zeitzeuge_api.investigation.tools.text import fold

STAGE = "grounding"

SZ_BOX = (2_675_000.0, 1_190_000.0, 2_735_000.0, 1_235_000.0)
"""Canton Schwyz, LV95 bounding box with a margin: registers hold many «Schwyz»es."""
OSM_STRENGTH_CAP = 0.85
"""OpenStreetMap is open data, not an official register."""
INSTITUTIONAL = {
    "nursing_home",
    "social_facility",
    "retirement_home",
    "hospital",
    "clinic",
    "school",
    "college",
    "university",
    "hotel",
    "townhall",
    "church",
    "place_of_worship",
    "monastery",
    "museum",
    "public",
    "civic",
    "government",
    "office",
    "apartments",
    "residential",
}
_TYPE_SYNONYMS = {
    "nursing_home": {"nursing_home", "social_facility", "retirement_home", "hospital"},
    "care_home": {"nursing_home", "social_facility", "retirement_home"},
    "retirement_home": {"nursing_home", "social_facility", "retirement_home"},
    "hospital": {"hospital", "clinic", "nursing_home"},
    "hotel": {"hotel", "guest_house"},
    "church": {"church", "place_of_worship", "chapel", "monastery"},
    "school": {"school", "college", "university"},
}


@dataclass(slots=True)
class Anchor:
    name: str
    lv95: tuple[float, float]
    evidence_id: str


@dataclass(slots=True)
class BuildingCandidate:
    name: str
    lv95: tuple[float, float] | None
    kind: str
    hit: ToolHit | None
    named_by: str
    """`perception` (the image suggested it) or `nearby` (a register listed it)."""
    evidence_ids: list[str] = field(default_factory=list)


def in_canton(point: tuple[float, float] | None) -> bool:
    if point is None:
        return False
    e, n = point
    return SZ_BOX[0] <= e <= SZ_BOX[2] and SZ_BOX[1] <= n <= SZ_BOX[3]


def _equal(hit: ToolHit) -> bool:
    return hit.match in (MatchKind.EXACT, MatchKind.NORMALISED)


def in_schwyz(hit: ToolHit) -> bool:
    """Register labels carry the canton: «Brunnen (SZ) - Ingenbohl» vs «Brunnen (SG) - Nesslau»."""
    if "(" in hit.label and ")" in hit.label:
        return "(SZ)" in hit.label
    return in_canton(hit.lv95)


def _rank(hits: list[ToolHit]) -> list[ToolHit]:
    return sorted(hits, key=lambda h: (not _equal(h), not in_schwyz(h)))


def _prefer_schwyz(hits: list[ToolHit]) -> list[ToolHit]:
    """Equal hits in Schwyz if there are any; otherwise the first equal hit elsewhere.

    Registers hold many «Brunnen»s; the archive's photos are mostly in Schwyz, so a
    Schwyz namesake wins. A name that exists *only* elsewhere is still kept.
    """
    equal = [h for h in hits if _equal(h)]
    local = [h for h in equal if in_schwyz(h)]
    return local or equal[:1]


def candidate_names(ctx: RunContext, field: str, proposed: list[str]) -> list[str]:
    """Names to ground for a field: other stages' proposals first, then the image's."""
    extra = ctx.facts.get("extra_candidates", {}).get(field, [])
    seen: dict[str, str] = {}
    for name in [*extra, *proposed]:
        if name and not is_placeholder(name):
            seen.setdefault(fold(name), name)
    return list(seen.values())


async def _search(ctx: RunContext, name: str) -> list[ToolHit]:
    try:
        return _rank(await ctx.tools.swisstopo.search_locations(name, limit=10))
    except ToolUnavailable as exc:
        ctx.ledger.note(AgentId.GEO, f"swisstopo nicht erreichbar für «{name}»: {exc}")
        return []


async def run(ctx: RunContext) -> None:
    record = ctx.begin(STAGE, AgentId.GEO, AgentId.HERITAGE)
    seen: Perception = ctx.facts["perception"]
    anchors: list[Anchor] = []
    candidates: list[BuildingCandidate] = []

    # --- localities and municipalities --------------------------------------
    localities = candidate_names(
        ctx, "locality", [c.name for c in seen.localities]
    ) + candidate_names(ctx, "municipality", [])
    for name in list(dict.fromkeys(localities))[:6]:
        for hit in _prefer_schwyz((await _search(ctx, name))[:6]):
            if hit.kind == "municipality":
                ctx.ledger.add_from_hit(
                    hit,
                    kind=EvidenceKind.EXTERNAL,
                    source_class=SourceClass.GEODATA_LAYER,
                    agent_id=AgentId.GEO,
                    observation=f"Gemeinde «{hit.attrs.get('name')}» im Register (BFS "
                    f"{hit.attrs.get('bfs_nr')}) — der Name existiert",
                    strength=REGISTER_EXISTENCE,
                    field="municipality",
                    value=hit.attrs.get("name") or hit.label,
                    typed_value={"name": hit.attrs.get("name"), "bfs_nr": hit.attrs.get("bfs_nr")},
                )
            elif hit.kind in {"zipcode", "settlement"}:
                place = hit.attrs.get("locality") or hit.attrs.get("name") or hit.label
                if any(
                    e.field == "locality"
                    and e.value == place
                    and e.source_class is SourceClass.GEODATA_LAYER
                    for e in ctx.ledger.evidence
                ):
                    continue
                item = ctx.ledger.add_from_hit(
                    hit,
                    kind=EvidenceKind.EXTERNAL,
                    source_class=SourceClass.GEODATA_LAYER,
                    agent_id=AgentId.GEO,
                    observation=f"Ortschaft «{place}» im Register ({hit.label}) — der Name "
                    "existiert",
                    strength=REGISTER_EXISTENCE,
                    field="locality",
                    value=place,
                )
                if hit.lv95 and not any(a.name == place for a in anchors):
                    anchors.append(Anchor(name=place, lv95=hit.lv95, evidence_id=item.local_id))

    # --- named features (See / Fluss / Berg) --------------------------------
    for feature in candidate_names(ctx, "landscape_feature", [c.name for c in seen.features])[:5]:
        key = feature_key(feature)
        found = [
            h
            for h in (await _search(ctx, massif(feature) or feature))[:10]
            if h.kind in {"peak", "lake", "river"}
            and feature_key(h.attrs.get("name") or h.label) == key
        ]
        for hit in sorted(found, key=lambda h: not in_schwyz(h))[:1]:
            name = hit.attrs.get("name") or hit.label
            value = massif(name) or name
            ctx.ledger.add_from_hit(
                hit,
                kind=EvidenceKind.EXTERNAL,
                source_class=SourceClass.GEODATA_LAYER,
                agent_id=AgentId.GEO,
                observation=(
                    f"{hit.kind} «{name}» im swissNAMES3D-Register"
                    + (f" (Teil des Massivs «{value}»)" if value != name else "")
                    + " — der Name existiert"
                ),
                strength=REGISTER_EXISTENCE,
                field="landscape_feature",
                value=value,
                typed_value={
                    "name": value,
                    "summit": name,
                    "kind": hit.kind,
                    "lv95": list(hit.lv95 or ()),
                },
            )

    # --- buildings any stage named: registers first, then OpenStreetMap -------
    research_named = {fold(n) for n in ctx.facts.get("extra_candidates", {}).get("building", [])}
    kinds = {b.name: b.kind for b in seen.buildings}
    ksi_near: list[ToolHit] = []
    for anchor in anchors[:2]:
        ksi_near += await _ksi_near(ctx, anchor.lv95)
    near = anchors[0].lv95 if anchors else None
    for building_name in candidate_names(ctx, "building", [b.name for b in seen.buildings])[:4]:
        origin = "research" if fold(building_name) in research_named else "perception"
        hits = [h for h in ksi_near if names_match(h.label, building_name)]
        hits += await _wikidata_named(ctx, building_name, near)
        if not hits:
            try:
                hits = await ctx.tools.overpass.search_name(building_name, near=near, radius_m=8000)
            except ToolUnavailable as exc:
                ctx.ledger.note(AgentId.HERITAGE, f"OpenStreetMap nicht erreichbar: {exc}")
        placed = False
        for hit in _unique(hits)[:3]:
            item = ctx.ledger.add_from_hit(
                hit,
                kind=EvidenceKind.EXTERNAL,
                source_class=SourceClass.GEODATA_LAYER,
                agent_id=AgentId.HERITAGE,
                observation=f"{_REGISTER_DE.get(hit.tool, hit.tool)} kennt «{hit.label}»"
                + (f" ({hit.attrs['municipality']})" if hit.attrs.get("municipality") else "")
                + f" — Kandidat für «{building_name}»",
                strength=min(OSM_STRENGTH_CAP, strength_for_match(hit.match)),
                field="building",
                value=_value_for(hit, building_name),
                attrs_extra={"existence_only": True, "proposed_as": building_name},
            )
            candidates.append(
                BuildingCandidate(
                    _value_for(hit, building_name), hit.lv95, hit.kind, hit, origin, [item.local_id]
                )
            )
            placed = True
        if not placed:
            candidates.append(
                BuildingCandidate(building_name, None, kinds.get(building_name, ""), None, origin)
            )

    # --- protected buildings nearby: named, placed, with a photograph --------
    if seen.scene_type in {"building", "village", "street"} or seen.buildings:
        for hit in sorted(_unique(ksi_near), key=lambda h: h.distance_m or 0.0)[:4]:
            if hit.attrs.get("thumbnail") and not any(c.name == hit.label for c in candidates):
                candidates.append(BuildingCandidate(hit.label, hit.lv95, hit.kind, hit, "nearby"))

    # --- buildings of the right type near each locality ---------------------
    wanted = set(_TYPE_SYNONYMS.get(seen.building_type.strip().lower(), set()))
    for building in seen.buildings:
        wanted |= _TYPE_SYNONYMS.get(building.kind.strip().lower(), set())
    if seen.scene_type in {"building", "village", "street"} or wanted:
        for anchor in anchors[:2]:
            try:
                nearby = await ctx.tools.overpass.named_features_near(
                    anchor.lv95[0], anchor.lv95[1], radius_m=2500
                )
            except ToolUnavailable as exc:
                ctx.ledger.note(AgentId.HERITAGE, f"OpenStreetMap nicht erreichbar: {exc}")
                continue
            typed = sorted(
                (h for h in nearby if h.kind in (wanted | INSTITUTIONAL)),
                key=lambda h: (h.kind not in wanted, h.distance_m or 0.0),
            )
            for hit in typed[:6]:
                if any(c.name == hit.label for c in candidates):
                    continue
                candidates.append(BuildingCandidate(hit.label, hit.lv95, hit.kind, hit, "nearby"))
        ctx.ledger.note(
            AgentId.HERITAGE,
            f"{len(candidates)} Gebäudekandidaten zur Prüfung mit Referenzbildern",
        )

    ctx.facts["anchors"] = anchors
    ctx.facts["building_candidates"] = candidates
    record.output = {
        "anchors": [{"name": a.name, "lv95": a.lv95} for a in anchors],
        "candidates": [
            {"name": c.name, "kind": c.kind, "lv95": c.lv95, "named_by": c.named_by}
            for c in candidates
        ],
    }
    record.ended_at = datetime.now(UTC)


_REGISTER_DE = {
    "ksi": "Das kantonale Schutzinventar (KSI)",
    "wikidata": "Wikidata",
    "osm.overpass": "OpenStreetMap",
}


def _value_for(hit: ToolHit, proposed: str) -> str:
    """The archive's name for the building: a KSI entry's alias when it is what was proposed.

    «Haus Hauptplatz 3 (Hotel Wysses Rössli)» is catalogued as «Hotel Wysses Rössli»;
    the inventory's full title stays in the observation and the Belege sheet.
    """
    nickname = hit.attrs.get("alias")
    if nickname and names_match(nickname, proposed):
        return str(nickname)
    return hit.label


def _unique(hits: list[ToolHit]) -> list[ToolHit]:
    seen: dict[str, ToolHit] = {}
    for hit in hits:
        seen.setdefault(fold(hit.label), hit)
    return list(seen.values())


async def _ksi_near(ctx: RunContext, point: tuple[float, float]) -> list[ToolHit]:
    ksi = getattr(ctx.tools, "ksi", None)
    if ksi is None:
        return []
    try:
        return list(await ksi.near(point[0], point[1], radius_m=2500, limit=12))
    except ToolUnavailable as exc:
        ctx.ledger.note(AgentId.HERITAGE, f"Schutzinventar nicht erreichbar: {exc}")
        return []


async def _wikidata_named(
    ctx: RunContext, name: str, near: tuple[float, float] | None
) -> list[ToolHit]:
    """Wikidata items of that name, within 15 km of the candidate place when there is one."""
    gazetteer = getattr(ctx.tools, "wikidata", None)
    if gazetteer is None:
        return []
    try:
        hits = await gazetteer.find(name, near=near)
    except ToolUnavailable as exc:
        ctx.ledger.note(AgentId.HERITAGE, f"Wikidata nicht erreichbar: {exc}")
        return []
    if near is not None:
        hits = [h for h in hits if h.lv95 and distance_m(near, h.lv95) <= 15_000]
    return list(hits)


def nearest(point: tuple[float, float], hits: list[ToolHit]) -> ToolHit | None:
    placed = [h for h in hits if h.lv95]
    return min(placed, key=lambda h: distance_m(point, h.lv95), default=None)  # type: ignore[arg-type]


def describe(candidate: BuildingCandidate) -> dict[str, Any]:
    return {"name": candidate.name, "kind": candidate.kind, "lv95": candidate.lv95}
