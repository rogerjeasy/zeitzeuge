"""Staatsarchiv catalogue client: recorded OpenSearch replies, and the answer-key rule."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from zeitzeuge_api.investigation.tools.base import MatchKind, ToolCache
from zeitzeuge_api.investigation.tools.stasz import (
    OPENSEARCH_URL,
    StaatsarchivCatalogue,
    is_answer_key,
    parse_detail,
)


async def test_search_acherhof_schwyz(offline_client: httpx.AsyncClient, replay: ToolCache) -> None:
    hits = await StaatsarchivCatalogue(offline_client, replay).search("Acherhof Schwyz")
    assert len(hits) == 10
    assert all(h.kind == "catalogue_entry" for h in hits)
    assert not any(is_answer_key(h.attrs["signature"]) for h in hits)
    by_sig = {h.attrs["signature"]: h for h in hits}
    entry = by_sig["SG.CIV.12.1649"]
    assert entry.label == "Haus Grundstrasse 32 (Acherhof), Schwyz"
    assert entry.attrs["thema"] == "Schwyz"
    assert entry.attrs["date"] == "1939"
    assert entry.attrs["stufe"] == "Dokument"
    assert entry.attrs["archivalienart"] == "Bild"
    assert entry.match is MatchKind.NORMALISED
    assert entry.source_uri == "https://query.staatsarchiv.sz.ch/detail.aspx?ID=358826"
    assert entry.source == (
        "Staatsarchiv Schwyz, Online-Archivkatalog (scopeArchiv), SG.CIV.12.1649"
    )
    assert entry.attrs["thumbnail"] == (
        "https://query.staatsarchiv.sz.ch/getImage.aspx?VEID=358826&DEID=10"
    )
    assert "SG.CIV.09.744" in by_sig  # Ortsbildinventar: Haus Grundstrasse 32 (Acherhof)


async def test_no_results(offline_client: httpx.AsyncClient, replay: ToolCache) -> None:
    catalogue = StaatsarchivCatalogue(offline_client, replay)
    assert await catalogue.search("Alterszentrum Acherhof", limit=5, details=False) == []


@pytest.mark.parametrize(
    ("signature", "excluded"),
    [
        ("SG.CIV.17", True),
        ("SG.CIV.17.3", True),
        ("SG.CIV.17.3.1", True),
        ("SG.CIV.170", False),
        ("SG.CIV.170.4", False),
        ("SG.CIV.1.17", False),
        ("SG.CIV.12.1649", False),
        ("SG.CIV.09.744", False),
    ],
)
def test_answer_key_rule(signature: str, excluded: bool) -> None:
    assert is_answer_key(signature) is excluded


def _feed(*items: tuple[str, str, int]) -> str:
    body = "".join(
        f"<item><link>https://query.staatsarchiv.sz.ch//detail.aspx?ID={ve}</link>"
        f"<category>Dokument</category><title>{title}</title>"
        f"<description>{sig}   {title}, 2010 (Dokument)</description></item>"
        for sig, title, ve in items
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?><rss version="2.0">'
        '<channel xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><title>Q</title>'
        f"<opensearch:totalResults>{len(items)}</opensearch:totalResults>{body}</channel></rss>"
    )


async def test_series_17_never_comes_back(
    offline_client: httpx.AsyncClient, tmp_path: Path
) -> None:
    # A hand-made feed (not a recording): the catalogue does not currently list
    # SG.CIV.17 publicly, so the guard is proven on a synthetic page.
    feed = _feed(
        ("SG.CIV.17.3", "Schwyz: Alterszentrum Acherhof", 1),
        ("SG.CIV.17", "Fotografien 21. Jahrhundert", 2),
        ("SG.CIV.17.4", "Schwyz: Grundstrasse", 3),
        ("SG.CIV.170.1", "Nicht die Testserie", 4),
        ("SG.CIV.12.1649", "Haus Grundstrasse 32 (Acherhof), Schwyz", 5),
        ("", "Signatur fehlt", 6),
    )
    key = ToolCache.key("GET-TEXT", OPENSEARCH_URL, {"q": "Acherhof", "format": "rss"}, None)
    ToolCache(tmp_path).put(key, feed)
    catalogue = StaatsarchivCatalogue(offline_client, ToolCache(tmp_path, replay=True))

    hits = await catalogue.search("Acherhof", details=False)

    assert [h.attrs["signature"] for h in hits] == ["SG.CIV.170.1", "SG.CIV.12.1649"]
    assert all(h.attrs["excluded_answer_key_hits"] == 4 for h in hits)
    assert hits[1].source_uri == "https://query.staatsarchiv.sz.ch/detail.aspx?ID=5"


def test_parse_detail_reads_the_attribute_table() -> None:
    html = (
        '<table><tr><td class="veXDetailAttributLabel" valign="top">Signatur:</td>'
        '<td class="veXDetailAttributValue" valign="top">SG.CIV.12.1649</td></tr>'
        '<tr><td class="veXDetailAttributLabel">Thema:</td>'
        '<td class="veXDetailAttributValue">Schwyz &amp; Umgebung</td></tr></table>'
    )
    assert parse_detail(html) == {"Signatur": "SG.CIV.12.1649", "Thema": "Schwyz & Umgebung"}
