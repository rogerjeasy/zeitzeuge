"""Resolve (roster: `geo`) — the Point → Fields resolver (architecture §7.7).

Once a witness fixes the point the photograph shows (the subject point: a
building confirmed by a reference photo, or one the registers place exactly),
Ortschaft, Gemeinde and Strasse stop being judgement calls: they are what the
federal registers say about that point. Each lookup is its own
`geodata_layer` evidence item, so every field cites its own layer.

A derived field is only as right as its point, so it also cites the chain that
placed the point (design note §3): the reference photo that confirmed the
building is restated as evidence *for the locality*, in its own class. One
witness therefore supports several fields, but within each field the classes
stay independent and each class counts once.

Without a building point, the best locality anchor (an exact register hit for
a name the image suggested) still yields the Gemeinde.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from zeitzeuge_api.db.models.enums import AgentId, EvidenceKind, SourceClass
from zeitzeuge_api.investigation.confidence import strength_for_match
from zeitzeuge_api.investigation.context import RunContext
from zeitzeuge_api.investigation.contracts import Evidence
from zeitzeuge_api.investigation.names import feature_key, massif
from zeitzeuge_api.investigation.stages.grounding import Anchor, BuildingCandidate
from zeitzeuge_api.investigation.tools.base import MatchKind, ToolHit, ToolUnavailable
from zeitzeuge_api.investigation.tools.text import fold

STAGE = "resolve"
FEATURE_RADIUS_M = 8000
NEAREST_ADDRESS_STRENGTH = 0.6
"""The nearest address to a building's point: probably, not certainly, its entrance."""


def _base_number(hit: ToolHit) -> str | None:
    found = re.match(r"\d+", str(hit.attrs.get("house_number") or ""))
    return found.group() if found else None


def _complex(addresses: list[ToolHit], chosen: ToolHit) -> tuple[str, list[str]]:
    """«Grundstrasse 32» for a complex whose entrances are 32a…32h.

    The building register numbers each entrance; the archive (and the brief's
    expected answer) names the building's address. When the nearest entrance's
    street and base number are shared by other entrances, the base address is
    the building's address; the entrances are listed in the observation.
    """
    street = str(chosen.attrs.get("street") or "")
    number = str(chosen.attrs.get("house_number") or "")
    base = _base_number(chosen)
    if not street or base is None:
        return chosen.label, [number] if number else []
    entrances = sorted(
        {
            str(a.attrs.get("house_number"))
            for a in addresses
            if a.attrs.get("street") == street and _base_number(a) == base
        }
    )
    if len(entrances) > 1 or number != base:
        return f"{street} {base}", entrances
    return chosen.label, entrances


def _best_building(ctx: RunContext) -> tuple[BuildingCandidate, Evidence] | None:
    best: tuple[BuildingCandidate, Evidence] | None = None
    for candidate in ctx.facts.get("building_candidates", []):
        if not candidate.lv95:
            continue
        for local_id in candidate.evidence_ids:
            item = ctx.ledger.by_id(local_id)
            if item is None or item.attrs.get("refutes"):
                continue
            weight = (item.source_class is SourceClass.REFERENCE_IMAGE, item.strength)
            if best is None or weight > (
                best[1].source_class is SourceClass.REFERENCE_IMAGE,
                best[1].strength,
            ):
                best = (candidate, item)
    return best


def _restate(ctx: RunContext, witness: Evidence, field: str, value: str, why: str) -> None:
    """Carry the witness that placed the point over to a field derived from it."""
    ctx.ledger.add(
        kind=witness.kind,
        source_class=witness.source_class,
        agent_id=AgentId.GEO,
        model_id=witness.model_id,
        observation=f"{why} (gestützt auf {witness.local_id})",
        strength=witness.strength,
        source=witness.source,
        source_uri=witness.source_uri,
        field=field,
        value=value,
        attrs={"derived_from": witness.local_id},
    )


async def run(ctx: RunContext) -> None:
    record = ctx.begin(STAGE, AgentId.GEO)
    sw = ctx.tools.swisstopo
    chosen = _best_building(ctx)
    anchors: list[Anchor] = ctx.facts.get("anchors", [])
    output: dict[str, Any] = {}

    point: tuple[float, float] | None = None
    witness: Evidence | None = None
    building: BuildingCandidate | None = None
    if chosen:
        building, witness = chosen
        point = building.lv95
    elif anchors:
        point = anchors[0].lv95

    if point is None:
        ctx.ledger.note(AgentId.GEO, "Kein Motivpunkt bestimmbar — Ortsfelder bleiben offen")
        record.ended_at = datetime.now(UTC)
        return

    async def lookup(name: str, coro: Any) -> Any:
        try:
            return await coro
        except ToolUnavailable as exc:
            ctx.ledger.note(AgentId.GEO, f"{name} nicht erreichbar: {exc}")
            return None

    locality: ToolHit | None = await lookup("Ortschaftenverzeichnis", sw.locality_at(*point))
    municipality: ToolHit | None = await lookup("swissBOUNDARIES3D", sw.municipality_at(*point))
    spatial = strength_for_match(MatchKind.SPATIAL)

    if locality is not None:
        ctx.ledger.add_from_hit(
            locality,
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.GEODATA_LAYER,
            agent_id=AgentId.GEO,
            observation=f"Motivpunkt liegt in der Ortschaft «{locality.label}» "
            f"(PLZ {locality.attrs.get('plz', '?')})",
            strength=spatial,
            field="locality",
            value=locality.label,
            typed_value={"name": locality.label, "plz": locality.attrs.get("plz"), "lv95": point},
        )
        if witness and building:
            _restate(
                ctx,
                witness,
                "locality",
                locality.label,
                f"Gebäude «{building.name}» bestätigt; es liegt in {locality.label}",
            )
    if municipality is not None:
        ctx.ledger.add_from_hit(
            municipality,
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.GEODATA_LAYER,
            agent_id=AgentId.GEO,
            observation=f"Motivpunkt liegt in der Gemeinde «{municipality.label}» "
            f"(BFS {municipality.attrs.get('bfs_nr', '?')})",
            strength=spatial,
            field="municipality",
            value=municipality.label,
            typed_value={"name": municipality.label, "bfs_nr": municipality.attrs.get("bfs_nr")},
        )
        if witness and building:
            _restate(
                ctx,
                witness,
                "municipality",
                municipality.label,
                f"Gebäude «{building.name}» bestätigt; "
                f"es liegt in der Gemeinde {municipality.label}",
            )

    if building is not None and witness is not None:
        ctx.ledger.add(
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.GEODATA_LAYER,
            agent_id=AgentId.HERITAGE,
            observation=f"«{building.name}» ist an diesem Punkt verzeichnet ({building.kind})",
            strength=min(0.85, spatial),
            source=building.hit.source if building.hit else None,
            source_uri=building.hit.source_uri if building.hit else None,
            field="building",
            value=building.name,
            lv95=building.lv95,
        )
        addresses: list[ToolHit] = await lookup("Gebäudeadressen", sw.addresses_near(*point)) or []
        tagged_street = fold(
            str((building.hit.attrs if building.hit else {}).get("addr:street", ""))
        )
        tagged_number = str(
            (building.hit.attrs if building.hit else {}).get("addr:housenumber", "")
        )
        exact = [
            a
            for a in addresses
            if tagged_street
            and fold(str(a.attrs.get("street", ""))) == tagged_street
            and (not tagged_number or str(a.attrs.get("house_number", "")) == tagged_number)
        ]
        address = exact[0] if exact else (addresses[0] if addresses else None)
        complex_label, entrances = _complex(addresses, address) if address else (None, [])
        if address is not None:
            ctx.ledger.add_from_hit(
                address,
                kind=EvidenceKind.EXTERNAL,
                source_class=SourceClass.GEODATA_LAYER,
                agent_id=AgentId.GEO,
                observation=(
                    f"Adresse «{complex_label}» "
                    + (f"(Eingänge {', '.join(entrances)}) " if len(entrances) > 1 else "")
                    + (
                        "stimmt mit der Gebäudeadresse in OpenStreetMap überein"
                        if exact
                        else f"ist die nächste amtliche Adresse ({address.distance_m or 0:.0f} m)"
                    )
                ),
                strength=1.0 if exact else NEAREST_ADDRESS_STRENGTH,
                field="street",
                value=complex_label,
                typed_value={
                    "name": address.label,
                    "street": address.attrs.get("street"),
                    "house_number": address.attrs.get("house_number"),
                    "plz_ortschaft": f"{address.attrs.get('plz', '')} "
                    f"{address.attrs.get('locality', '')}".strip(),
                },
            )
            _restate(
                ctx,
                witness,
                "street",
                complex_label or address.label,
                f"Gebäude «{building.name}» bestätigt; Adresse {complex_label}",
            )
            if exact:
                ctx.ledger.add_from_hit(
                    address,
                    kind=EvidenceKind.EXTERNAL,
                    source_class=SourceClass.GEODATA_LAYER,
                    agent_id=AgentId.HERITAGE,
                    observation=f"«{building.name}» hat die amtliche Adresse {complex_label}",
                    strength=1.0,
                    field="building",
                    value=building.name,
                )

    # Features the image suggested that really lie within view of the point.
    suggested = {
        feature_key(e.value): e.value for e in ctx.ledger.for_field("landscape_feature") if e.value
    }
    if suggested:
        names: list[ToolHit] = (
            await lookup("swissNAMES3D", sw.names_near(*point, radius_m=FEATURE_RADIUS_M)) or []
        )
        for hit in names:
            if hit.kind not in {"peak", "lake", "river"}:
                continue
            label = hit.attrs.get("name") or hit.label
            if feature_key(label) not in suggested:
                continue
            ctx.ledger.add_from_hit(
                hit,
                kind=EvidenceKind.GEOMETRIC,
                source_class=SourceClass.GEODATA_LAYER,
                agent_id=AgentId.GEO,
                observation=f"«{label}» liegt {hit.distance_m or 0:.0f} m vom Motivpunkt "
                "— in Sichtweite plausibel",
                strength=spatial,
                field="landscape_feature",
                value=massif(label) or label,
            )
            suggested.pop(feature_key(label), None)

    ctx.facts["subject_point"] = {
        "lv95": list(point),
        "precision_m": 30 if building else 500,
        "confidence": witness.strength if witness else 0.5,
        "source_class": (witness.source_class.value if witness else "geodata_layer"),
        "evidence": witness.local_id if witness else (anchors[0].evidence_id if anchors else ""),
        "object": building.name if building else None,
    }
    output["subject_point"] = ctx.facts["subject_point"]
    record.output = output
    record.ended_at = datetime.now(UTC)
