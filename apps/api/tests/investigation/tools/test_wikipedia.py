"""Wikipedia client on a recorded response (no network)."""

from __future__ import annotations

import httpx

from zeitzeuge_api.investigation.tools.base import MatchKind, ToolCache
from zeitzeuge_api.investigation.tools.geo import distance_m
from zeitzeuge_api.investigation.tools.wikipedia import Wikipedia

from .conftest import ACHERHOF


async def test_alterszentrum_acherhof_finds_the_article(
    offline_client: httpx.AsyncClient, replay: ToolCache
) -> None:
    hits = await Wikipedia(offline_client, replay).search("Alterszentrum Acherhof")
    assert len(hits) == 1
    hit = hits[0]
    assert hit.label == "Acherhof"
    assert hit.kind == "article"
    assert hit.match is MatchKind.FUZZY
    assert hit.source_uri == "https://de.wikipedia.org/wiki/Acherhof"
    assert "Alterszentrum Acherhof wird ausgebaut" in hit.attrs["snippet"]
    assert "<span" not in hit.attrs["snippet"]
    assert hit.lv95 is not None
    # The article's coordinates sit within 60 m of the swissNAMES3D «Acherhof» point.
    assert distance_m(hit.lv95, ACHERHOF) < 60
