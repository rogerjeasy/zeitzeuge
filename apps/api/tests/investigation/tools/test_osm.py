"""Overpass client on recorded responses around the Acherhof (no network)."""

from __future__ import annotations

import httpx
import pytest

from zeitzeuge_api.investigation.tools.base import MatchKind, ToolCache, ToolUnavailable
from zeitzeuge_api.investigation.tools.osm import Overpass, _check_remark, _ql_regex

from .conftest import ACHERHOF


@pytest.fixture
def osm(offline_client: httpx.AsyncClient, replay: ToolCache) -> Overpass:
    return Overpass(offline_client, replay)


async def test_nearest_named_feature_is_the_alterszentrum(osm: Overpass) -> None:
    hits = await osm.named_features_near(*ACHERHOF)
    first = hits[0]
    assert first.label == "Alterszentrum Acherhof"
    assert first.kind == "social_facility"
    assert first.attrs["social_facility"] == "group_home"
    assert first.attrs["social_facility:for"] == "senior"
    assert first.attrs["addr:street"] == "Grundstrasse"
    assert first.attrs["addr:housenumber"] == "32a"
    assert first.attrs["osm_id"] == 466721100
    assert first.source_uri == "https://www.openstreetmap.org/way/466721100"
    assert first.match is MatchKind.SPATIAL
    assert first.distance_m == pytest.approx(33.9, abs=0.5)


async def test_near_is_sorted_filtered_and_noise_free(osm: Overpass) -> None:
    hits = await osm.named_features_near(*ACHERHOF)
    distances = [h.distance_m or 0.0 for h in hits]
    assert distances == sorted(distances) and max(distances) <= 400
    kinds = {h.kind for h in hits}
    assert "parking" not in kinds and "charging_station" not in kinds
    assert {"school", "townhall", "place_of_worship"} <= kinds
    rathaus = next(h for h in hits if h.label == "Rathaus")
    assert rathaus.attrs["addr:street"] == "Hauptplatz"


async def test_search_name_acherhof(osm: Overpass) -> None:
    hits = await osm.search_name("Acherhof", near=ACHERHOF)
    assert hits[0].label == "Alterszentrum Acherhof"
    assert hits[0].match is MatchKind.FUZZY
    streets = [h for h in hits if h.kind == "street"]
    assert streets and all(h.label == "Acherhofstrasse" for h in streets)


def test_regex_escaping_for_overpass_ql() -> None:
    assert _ql_regex("St. Martin (Kirche)") == "St\\\\. Martin \\\\(Kirche\\\\)"
    assert _ql_regex('Haus "Rose"') == 'Haus \\"Rose\\"'


def test_overpass_timeout_remark_is_a_failure() -> None:
    with pytest.raises(ToolUnavailable):
        _check_remark({"elements": [], "remark": "runtime error: Query timed out"})
    _check_remark({"elements": []})
