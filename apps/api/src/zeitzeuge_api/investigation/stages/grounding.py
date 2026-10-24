"""Grounding (roster: `geo`, `heritage`) — resolve names against official registers.

Every name the image suggested is looked up in swisstopo's SearchServer. A hit
that *is* that name (exact or after folding) becomes `geodata_layer` evidence
with the register's spelling and position; a merely similar hit does not count
for the place fields. Building names are also searched in OpenStreetMap near
the locality.

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
from zeitzeuge_api.investigation.confidence import strength_for_match
from zeitzeuge_api.investigation.context import RunContext
from zeitzeuge_api.investigation.contracts import Perception
from zeitzeuge_api.investigation.names import feature_key, is_placeholder, massif
from zeitzeuge_api.investigation.tools.base import MatchKind, ToolHit, ToolUnavailable
from zeitzeuge_api.investigation.tools.geo import distance_m
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
    return sorted(hits, key=lambda h: (not _equal(h), not in_canton(h.lv95)))


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
    for candidate in seen.localities[:4]:
        for hit in (await _search(ctx, candidate.name))[:6]:
            if not _equal(hit) or not in_schwyz(hit):
                continue
            if hit.kind == "municipality":
                ctx.ledger.add_from_hit(
                    hit,
                    kind=EvidenceKind.EXTERNAL,
                    source_class=SourceClass.GEODATA_LAYER,
                    agent_id=AgentId.GEO,
                    observation=f"Gemeinde «{hit.attrs.get('name')}» im Register (BFS "
                    f"{hit.attrs.get('bfs_nr')})",
                    strength=strength_for_match(hit.match),
                    field="municipality",
                    value=hit.attrs.get("name") or hit.label,
                    typed_value={"name": hit.attrs.get("name"), "bfs_nr": hit.attrs.get("bfs_nr")},
                )
            elif hit.kind in {"zipcode", "settlement"}:
                name = hit.attrs.get("locality") or hit.attrs.get("name") or hit.label
                if any(
                    e.field == "locality"
                    and e.value == name
                    and e.source_class is SourceClass.GEODATA_LAYER
                    for e in ctx.ledger.evidence
                ):
                    continue
                item = ctx.ledger.add_from_hit(
                    hit,
                    kind=EvidenceKind.EXTERNAL,
                    source_class=SourceClass.GEODATA_LAYER,
                    agent_id=AgentId.GEO,
                    observation=f"Ortschaft «{name}» im Register ({hit.label})",
                    strength=strength_for_match(hit.match),
                    field="locality",
                    value=name,
                )
                if hit.lv95 and not any(a.name == name for a in anchors):
                    anchors.append(Anchor(name=name, lv95=hit.lv95, evidence_id=item.local_id))

    # --- named features (See / Fluss / Berg) --------------------------------
    for candidate in seen.features[:4]:
        key = feature_key(candidate.name)
        for hit in (await _search(ctx, massif(candidate.name) or candidate.name))[:10]:
            name = hit.attrs.get("name") or hit.label
            if hit.kind not in {"peak", "lake", "river"} or feature_key(name) != key:
                continue
            if not in_schwyz(hit) and hit.kind != "lake":
                continue
            value = massif(name) or name
            exact = fold(name) == fold(candidate.name)
            ctx.ledger.add_from_hit(
                hit,
                kind=EvidenceKind.EXTERNAL,
                source_class=SourceClass.GEODATA_LAYER,
                agent_id=AgentId.GEO,
                observation=(
                    f"{hit.kind} «{name}» im swissNAMES3D-Register"
                    + (f" (Teil des Massivs «{value}»)" if value != name else "")
                ),
                strength=strength_for_match(MatchKind.EXACT if exact else MatchKind.NORMALISED),
                field="landscape_feature",
                value=value,
                typed_value={
                    "name": value,
                    "summit": name,
                    "kind": hit.kind,
                    "lv95": list(hit.lv95 or ()),
                },
            )
            break

    # --- buildings the image names ------------------------------------------
    for candidate in [b for b in seen.buildings if not is_placeholder(b.name)][:3]:
        near = anchors[0].lv95 if anchors else None
        hits: list[ToolHit] = []
        try:
            hits = await ctx.tools.overpass.search_name(candidate.name, near=near, radius_m=8000)
        except ToolUnavailable as exc:
            ctx.ledger.note(AgentId.HERITAGE, f"OpenStreetMap nicht erreichbar: {exc}")
        for hit in hits[:3]:
            strength = min(OSM_STRENGTH_CAP, strength_for_match(hit.match))
            item = ctx.ledger.add_from_hit(
                hit,
                kind=EvidenceKind.EXTERNAL,
                source_class=SourceClass.GEODATA_LAYER,
                agent_id=AgentId.HERITAGE,
                observation=f"OpenStreetMap kennt «{hit.label}» ({hit.kind})",
                strength=strength,
                field="building",
                value=hit.label,
            )
            candidates.append(
                BuildingCandidate(hit.label, hit.lv95, hit.kind, hit, "perception", [item.local_id])
            )
        if not hits:
            candidates.append(
                BuildingCandidate(candidate.name, None, candidate.kind, None, "perception")
            )

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


def nearest(point: tuple[float, float], hits: list[ToolHit]) -> ToolHit | None:
    placed = [h for h in hits if h.lv95]
    return min(placed, key=lambda h: distance_m(point, h.lv95), default=None)  # type: ignore[arg-type]


def describe(candidate: BuildingCandidate) -> dict[str, Any]:
    return {"name": candidate.name, "kind": candidate.kind, "lv95": candidate.lv95}
