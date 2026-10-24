"""Alpine places: names that are not Ortschaften still place the photo (feedback 11:00)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from zeitzeuge_api.investigation.context import Asset, RunContext
from zeitzeuge_api.investigation.stages.grounding import _ANCHOR_RANK, Anchor, _address_named
from zeitzeuge_api.investigation.tools.base import MatchKind, ToolHit
from zeitzeuge_api.investigation.tools.swisstopo import _search_hit


def _item(label: str, origin: str, e: float = 2700000.0, n: float = 1200000.0) -> dict[str, Any]:
    return {"attrs": {"origin": origin, "label": label, "y": e, "x": n}, "id": 1}


def test_the_canton_suffix_is_not_part_of_the_name() -> None:
    hit = _search_hit(_item("<i>Ort</i> <b>Stoos SZ</b> (SZ) - Morschach", "gazetteer"), "Stoos")
    assert hit.kind == "settlement"
    assert hit.match in (MatchKind.EXACT, MatchKind.NORMALISED)


def test_an_area_name_is_an_alpine_kind() -> None:
    hit = _search_hit(
        _item("<i>Gebiet</i> <b>Glattalp</b> (SZ) - Muotathal", "gazetteer"), "Glattalp"
    )
    assert hit.kind == "area_name"


def test_the_most_specific_place_is_searched_around_first() -> None:
    anchors = [
        Anchor("Muotathal", (0.0, 0.0), "ev_1", kind="zipcode"),
        Anchor("glattalp", (1.0, 1.0), "ev_2", kind="alpine"),
        Anchor("Bisisthal", (2.0, 2.0), "ev_3", kind="settlement"),
    ]
    anchors.sort(key=lambda a: _ANCHOR_RANK.get(a.kind, 2))
    assert [a.name for a in anchors] == ["glattalp", "Bisisthal", "Muotathal"]


@dataclass
class FakeSwisstopo:
    results: list[ToolHit] = field(default_factory=list)

    async def search_locations(self, text: str, **kwargs: Any) -> list[ToolHit]:
        return self.results


@dataclass
class FakeTools:
    swisstopo: FakeSwisstopo


def _ctx(results: list[ToolHit]) -> RunContext:
    return RunContext(
        run_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        asset=Asset(id=uuid.uuid4(), external_ref="SG.CIV.17.96.jpg", image=b"", prepared=b""),
        models=None,  # type: ignore[arg-type]
        tools=FakeTools(FakeSwisstopo(results)),  # type: ignore[arg-type]
    )


def _address(street: str, number: str, e: float = 2706000.0, n: float = 1198000.0) -> ToolHit:
    return ToolHit(
        tool="swisstopo.search",
        label=f"{street} {number} 6436 Bisisthal",
        source="swisstopo, Amtliches Gebäudeadressverzeichnis (GeoAdmin-Suche)",
        source_uri="https://map.geo.admin.ch/",
        match=MatchKind.FUZZY,
        kind="address",
        lv95=(e, n),
        attrs={"street": street, "house_number": number, "locality": "Bisisthal"},
    )


async def test_an_alpine_building_is_placed_at_the_address_of_its_name() -> None:
    ctx = _ctx([_address("Glattalp", "1"), _address("Glattalpstrasse", "4")])
    (hit,) = await _address_named(ctx, "Kapelle Glattalp")
    assert hit.label == "Kapelle Glattalp"
    assert hit.attrs["addr:street"] == "Glattalp"
    assert hit.attrs["addr:housenumber"] == "1"


async def test_a_place_word_alone_is_not_looked_up_as_an_address() -> None:
    ctx = _ctx([_address("Stoos", "1")])
    assert await _address_named(ctx, "Kapelle Stoos") == []


async def test_an_address_outside_the_canton_is_not_used() -> None:
    ctx = _ctx([_address("Glattalp", "1", e=2600000.0, n=1100000.0)])
    assert await _address_named(ctx, "Kapelle Glattalp") == []
