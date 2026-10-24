"""swisstopo GeoAdmin client on recorded SG.CIV.17.3 responses (no network).

What the registers actually say around the Acherhof, recorded 2026-10-24:
Ortschaft «Schwyz» (PLZ 6430), Gemeinde «Schwyz» (BFS 1372, SZ), and a ring of
«Grundstrasse 32a…32h» / «Grundstrasse 32.1, 32.2» addresses. There is **no**
plain «Grundstrasse 32» in the Gebäudeadressverzeichnis — the brief's value is
the parent number of that group, so a register lookup for it is FUZZY, not
EXACT, and the tests pin that rather than pretend otherwise.
"""

from __future__ import annotations

import httpx
import pytest

from zeitzeuge_api.investigation.tools.base import MatchKind, ToolCache, ToolUnavailable
from zeitzeuge_api.investigation.tools.swisstopo import (
    LAYER_ADDRESS,
    Swisstopo,
    _leading_name,
    map_url,
)
from zeitzeuge_api.investigation.tools.text import fold, name_match

from .conftest import ACHERHOF


@pytest.fixture
def topo(offline_client: httpx.AsyncClient, replay: ToolCache) -> Swisstopo:
    return Swisstopo(offline_client, replay)


async def test_search_acherhof_finds_the_name_point_and_its_street(topo: Swisstopo) -> None:
    hits = await topo.search_locations("Acherhof Schwyz")
    first = hits[0]
    assert first.label == "Acherhof (SZ) - Schwyz"
    assert first.kind == "field_name"
    assert first.attrs["objectclass"] == "TLM_FLURNAME"
    assert first.lv95 == ACHERHOF
    assert first.match is MatchKind.FUZZY  # «Acherhof» ≠ «Acherhof Schwyz»
    assert first.source.startswith("swisstopo, swissNAMES3D")
    assert first.source_uri.startswith("https://map.geo.admin.ch/?")

    address = next(h for h in hits if h.kind == "address")
    assert address.label == "Acherhofstrasse 5c 6430 Schwyz"
    assert address.attrs["street"] == "Acherhofstrasse"
    assert address.attrs["house_number"] == "5c"
    assert address.attrs["plz"] == "6430"
    assert address.attrs["egid"] == "191759735"
    assert address.attrs["api_uri"].endswith(f"{LAYER_ADDRESS}/102571739")
    assert "<b>" not in address.label


async def test_search_alterszentrum_acherhof_is_not_in_swisstopo(topo: Swisstopo) -> None:
    # The nursing home's name is not a swisstopo name: only look-alike farm names.
    hits = await topo.search_locations("Alterszentrum Acherhof")
    assert hits
    assert all(h.match is MatchKind.FUZZY for h in hits)
    assert not any("Schwyz" in h.label for h in hits)


async def test_search_schwyz_municipality_is_exact_with_bfs_number(topo: Swisstopo) -> None:
    hits = await topo.search_locations("Schwyz")
    municipality = hits[0]
    assert municipality.kind == "municipality"
    assert municipality.label == "Schwyz (SZ)"
    assert municipality.match is MatchKind.EXACT
    assert municipality.attrs["bfs_nr"] == 1372
    kinds = {h.kind for h in hits}
    assert {"municipality", "district", "canton", "settlement"} <= kinds


async def test_search_mythen_finds_the_peak(topo: Swisstopo) -> None:
    hits = await topo.search_locations("Mythen")
    peak = next(h for h in hits if h.kind == "peak")
    assert peak.label == "Chli Mythen (SZ) - Schwyz"
    assert peak.attrs["category"] == "Gipfel"
    assert peak.attrs["name"] == "Chli Mythen"
    assert peak.match is MatchKind.FUZZY


async def test_find_address_grundstrasse_32(topo: Swisstopo) -> None:
    hits = await topo.find_address("Grundstrasse", "32", locality="Schwyz")
    numbers = {h.attrs["house_number"] for h in hits}
    assert {"32a", "32b", "32c", "32d", "32e", "32.1", "32.2"} <= numbers
    assert "32" not in numbers  # the register has no bare «Grundstrasse 32»
    assert all(h.match is MatchKind.FUZZY for h in hits)
    assert all(h.attrs["street"] == "Grundstrasse" for h in hits)


async def test_locality_at_acherhof(topo: Swisstopo) -> None:
    hit = await topo.locality_at(*ACHERHOF)
    assert hit is not None
    assert hit.label == "Schwyz"
    assert hit.kind == "locality"
    assert hit.attrs["plz"] == "6430"
    assert hit.match is MatchKind.SPATIAL
    assert hit.source == "swisstopo, Amtliches Ortschaftenverzeichnis"
    assert "ch.swisstopo-vd.ortschaftenverzeichnis_plz" in hit.source_uri


async def test_municipality_at_acherhof(topo: Swisstopo) -> None:
    hit = await topo.municipality_at(*ACHERHOF, year=2026)
    assert hit is not None
    assert hit.label == "Schwyz"
    assert hit.attrs["bfs_nr"] == 1372
    assert hit.attrs["canton"] == "SZ"
    assert hit.attrs["year"] == 2026
    assert hit.match is MatchKind.SPATIAL


async def test_addresses_near_acherhof(topo: Swisstopo) -> None:
    hits = await topo.addresses_near(*ACHERHOF)
    assert hits[0].label == "Grundstrasse 32h"
    assert hits[0].distance_m == pytest.approx(20.9, abs=0.1)
    distances = [h.distance_m or 0.0 for h in hits]
    assert distances == sorted(distances)
    assert max(distances) <= 60
    streets = {h.attrs["street"] for h in hits}
    assert streets == {"Grundstrasse", "Acherhofstrasse"}
    a32 = next(h for h in hits if h.label == "Grundstrasse 32a")
    assert a32.attrs["egid"] == 261136
    assert a32.attrs["plz"] == "6430"
    assert a32.attrs["locality"] == "Schwyz"
    assert a32.attrs["bfs_nr"] == 1372
    assert a32.match is MatchKind.SPATIAL


async def test_names_near_acherhof(topo: Swisstopo) -> None:
    hits = await topo.names_near(*ACHERHOF)
    river = next(h for h in hits if h.kind == "river")
    assert river.label == "Tobelbach"
    assert river.distance_m == pytest.approx(117, abs=2)
    # The point lies inside the settlement polygon «Schwyz»: distance 0, no single position.
    schwyz = next(h for h in hits if h.label == "Schwyz")
    assert schwyz.distance_m == 0.0 and schwyz.lv95 is None
    assert all(h.label == h.label.strip() for h in hits)


async def test_names_near_peaks_include_the_mythen(topo: Swisstopo) -> None:
    hits = await topo.names_near(*ACHERHOF, radius_m=6000, kinds={"peak"})
    assert {h.kind for h in hits} == {"peak"}
    labels = [h.label for h in hits]
    assert "Gross Mythen" in labels and "Chli Mythen" in labels
    gross = next(h for h in hits if h.label == "Gross Mythen")
    assert gross.attrs["objektart"] == "Hauptgipfel"
    assert gross.distance_m == pytest.approx(2713, abs=5)
    assert gross.lv95 == (2695024.6, 1209521.6)


async def test_unrecorded_question_is_unavailable(topo: Swisstopo) -> None:
    with pytest.raises(ToolUnavailable):
        await topo.locality_at(2600000, 1200000)


def test_leading_name_and_matching() -> None:
    assert _leading_name("gazetteer", "Acherhof (SZ) - Schwyz") == "Acherhof"
    assert _leading_name("gg25", "Schwyz (SZ)") == "Schwyz"
    assert _leading_name("address", "Grundstrasse 32a 6430 Schwyz") == "Grundstrasse 32a"
    assert _leading_name("zipcode", "6430 - Schwyz") == "Schwyz"
    assert name_match("Schwyz", "Schwyz") is MatchKind.EXACT
    assert name_match("Zürich", "zurich") is MatchKind.NORMALISED
    assert name_match("St. Gallen", "Sankt-Gallen") is MatchKind.NORMALISED
    assert name_match("Acherhof", "Acherhof Schwyz") is MatchKind.FUZZY
    assert fold("Haus «Bethlehem»") == "haus «bethlehem»"


def test_map_url_selects_the_feature() -> None:
    url = map_url(2692632.6, 1208198.8, layer=LAYER_ADDRESS, feature_id=100221981)
    assert url.startswith("https://map.geo.admin.ch/?lang=de&E=2692632.6&N=1208198.8")
    assert f"{LAYER_ADDRESS}=100221981" in url
