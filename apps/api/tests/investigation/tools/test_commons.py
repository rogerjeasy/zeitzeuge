"""Wikimedia Commons client on recorded responses (no network)."""

from __future__ import annotations

import httpx
import pytest

from zeitzeuge_api.investigation.tools.base import MatchKind, ToolCache
from zeitzeuge_api.investigation.tools.commons import Commons
from zeitzeuge_api.investigation.tools.geo import lv95_to_wgs84

from .conftest import ACHERHOF


@pytest.fixture
def commons(offline_client: httpx.AsyncClient, replay: ToolCache) -> Commons:
    return Commons(offline_client, replay)


async def test_search_acherhof_schwyz(commons: Commons) -> None:
    hits = await commons.search_files("Acherhof Schwyz")
    assert len(hits) == 1
    hit = hits[0]
    assert hit.label == "CH-NB Archive Rudolf Zinggeler EAD-ZING-9411.tif"
    assert hit.kind == "photo"
    # The title does not carry the words; the description does. FUZZY by the stated rule.
    assert hit.match is MatchKind.FUZZY
    assert "Der Acherhof" in hit.attrs["description"]
    assert "CH-NB-Schwyz (Kanton)" in hit.attrs["categories"]
    assert hit.attrs["thumbnail"].startswith("https://thumb.wikimedia.org/")
    assert hit.source_uri == (
        "https://commons.wikimedia.org/wiki/File:CH-NB_Archive_Rudolf_Zinggeler_EAD-ZING-9411.tif"
    )
    assert hit.attrs["artist"] == "Rudolf Zinggeler"


async def test_geosearch_around_acherhof(commons: Commons) -> None:
    lat, lon = lv95_to_wgs84(*ACHERHOF)
    hits = await commons.geosearch(lat, lon)
    assert hits
    assert all(h.match is MatchKind.SPATIAL and h.kind == "photo" for h in hits)
    located = [h for h in hits if h.distance_m is not None]
    assert located and max(h.distance_m or 0.0 for h in located) <= 520
    assert [h.distance_m for h in located] == sorted(h.distance_m or 0.0 for h in located)
    assert any("Dominikanerinnenkloster St. Peter" in h.label for h in hits)
    assert all(h.attrs["thumbnail"] for h in hits)
