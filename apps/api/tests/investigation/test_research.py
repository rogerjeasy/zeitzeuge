"""Research: two families propose, our code checks their sources, the rule weighs.

No network: the families and the page verifier are fakes. What is pinned here is
the part a judge must be able to trust — a sourced-looking answer whose sources
do not name the value is weak, agreement counts only with a verified source,
and research alone never fills a field (identification-upgrade note §5).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest

from zeitzeuge_api.db.models.enums import SourceClass
from zeitzeuge_api.investigation.confidence import Support, score
from zeitzeuge_api.investigation.context import Asset, RunContext
from zeitzeuge_api.investigation.stages import research
from zeitzeuge_api.investigation.tools.base import ToolUnavailable
from zeitzeuge_api.investigation.tools.pages import Page, _page, mentions
from zeitzeuge_api.investigation.tools.research import (
    ResearchAnswer,
    ResearchResult,
    ResearchValue,
    parse_answer,
)
from zeitzeuge_api.investigation.tools.text import fold


def test_mentions_needs_every_token_or_the_distinctive_core() -> None:
    text = fold("Willkommen im Alterszentrum Acherhof an der Grundstrasse 32 in Schwyz")
    assert mentions(text, "Alterszentrum Acherhof")
    assert mentions(text, "Acherhof")
    assert mentions(text, "Pflegeheim Acherhof")  # the core «acherhof» is there
    # «Spital» is generic, so the core of «Spital Schwyz» is the place itself: refused.
    assert not mentions(text, "Spital Schwyz", place="Schwyz")
    assert not mentions(text, "")


def test_html_is_reduced_to_folded_text_with_its_title() -> None:
    html = (
        b"<html><head><title>Seehof K\xc3\xbcssnacht</title><script>var x='Mythen'</script>"
        b"</head><body><p>Hotel du Lac <b>Seehof</b>, Seeplatz 6</p></body></html>"
    )
    page = _page("https://example.ch/", "text/html", html)
    assert page is not None
    assert page.title == "Seehof Küssnacht"
    assert "hotel du lac seehof" in page.text
    assert "mythen" not in page.text  # script content is not page text


def test_parse_answer_keeps_only_https_and_blank_is_null() -> None:
    answer = parse_answer(
        'Here you go: {"fields": {"locality": {"value": " ", "sources": []}, '
        '"building": {"value": "Mythenhaus", "sources": ["http://x.ch", "https://y.ch"]}}, '
        '"reference_images": [{"url": "ftp://z"}, {"url": "https://img.ch/a.jpg"}], '
        '"outside_canton": false}'
    )
    assert answer.fields["locality"].value is None
    assert answer.fields["building"].sources == ["https://y.ch"]
    assert [r.url for r in answer.reference_images] == ["https://img.ch/a.jpg"]


def test_parse_answer_without_json_is_unavailable() -> None:
    with pytest.raises(ToolUnavailable):
        parse_answer("I could not determine the location.")


# --- the stage, on fakes ----------------------------------------------------------


@dataclass
class FakeFamily:
    family: str
    answer: ResearchAnswer | None
    available: bool = True

    async def investigate(self, image: bytes, sha: str, *, exif_date: str | None) -> Any:
        if self.answer is None:
            raise ToolUnavailable("credit depleted")
        return ResearchResult(
            family=self.family, model_id=f"{self.family}-model", answer=self.answer
        )


@dataclass
class FakePages:
    """URL → page text; a page verifies a value if it mentions it (and the place)."""

    pages: dict[str, str] = field(default_factory=dict)

    async def verify(self, url: str, value: str, *, place: str | None = None) -> Page | None:
        text = fold(self.pages.get(url, ""))
        if not text or not mentions(text, value, place=place):
            return None
        if place and not mentions(text, place):
            return None
        return Page(url=url, title=url, text=text)


@dataclass
class FakeTools:
    research_openai: Any
    research_gemini: Any
    pages: FakePages


def _answer(**values: tuple[str, list[str]]) -> ResearchAnswer:
    return ResearchAnswer(
        fields={k: ResearchValue(value=v, sources=s) for k, (v, s) in values.items()}  # type: ignore[misc]
    )


def _ctx(tools: FakeTools) -> RunContext:
    return RunContext(
        run_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        asset=Asset(id=uuid.uuid4(), external_ref="SG.CIV.17.378.jpg", image=b"x", prepared=b"x"),
        models=None,  # type: ignore[arg-type]
        tools=tools,  # type: ignore[arg-type]
    )


def _items(ctx: RunContext, field_key: str) -> list[Any]:
    return [
        e for e in ctx.ledger.for_field(field_key) if e.source_class is SourceClass.OPEN_RESEARCH
    ]


async def test_two_families_agreeing_with_a_verified_source_carry_the_agreement() -> None:
    pages = FakePages(
        {"https://grosser-mythen.ch/": "Das Mythenhaus auf dem Grossen Mythen, Schwyz"}
    )
    tools = FakeTools(
        FakeFamily(
            "openai",
            _answer(
                locality=("Schwyz", []), building=("Mythenhaus", ["https://grosser-mythen.ch/"])
            ),
        ),
        FakeFamily("google", _answer(locality=("Schwyz", []), building=("Mythenhaus", []))),
        pages,
    )
    ctx = _ctx(tools)
    await research.run(ctx)

    building = _items(ctx, "building")
    assert {e.attrs["family"] for e in building} == {"openai", "google"}
    assert {e.strength for e in building} == {0.9}
    assert next(e for e in building if e.attrs["family"] == "openai").attrs["verified"]
    # Research alone stays below the review line: 0.5 x 0.9 = 0.45.
    assert score([Support(e.source_class, e.strength) for e in building]).raw == pytest.approx(0.45)
    assert ctx.facts["extra_candidates"]["building"][0] == "Mythenhaus"


async def test_a_sourced_looking_answer_whose_sources_do_not_name_it_is_weak() -> None:
    # SG.CIV.17.3: real pages about the Spital, cited for a claim they do not support.
    pages = FakePages({"https://spital.ch/": "Spital Schwyz, Waldeggstrasse 10, 6430 Schwyz"})
    tools = FakeTools(
        FakeFamily(
            "openai",
            _answer(
                locality=("Schwyz", []), building=("Alterszentrum Acherhof", ["https://spital.ch/"])
            ),
        ),
        FakeFamily("google", None),
        pages,
    )
    ctx = _ctx(tools)
    await research.run(ctx)
    (item,) = _items(ctx, "building")
    assert item.strength == 0.3
    assert not item.attrs["verified"]
    assert any("credit depleted" in e.summary for e in ctx.ledger.events)


async def test_disagreeing_families_get_no_agreement_bonus() -> None:
    pages = FakePages(
        {
            "https://a.ch/": "Kapelle Maria Hilf auf dem Stoos, Morschach",
            "https://b.ch/": "Goldau, Gemeinde Arth",
        }
    )
    tools = FakeTools(
        FakeFamily("openai", _answer(locality=("Stoos", ["https://a.ch/"]))),
        FakeFamily("google", _answer(locality=("Goldau", ["https://b.ch/"]))),
        pages,
    )
    ctx = _ctx(tools)
    await research.run(ctx)
    assert sorted((e.value, e.strength) for e in _items(ctx, "locality")) == [
        ("Goldau", 0.6),
        ("Stoos", 0.6),
    ]


async def test_a_building_source_must_also_name_the_place() -> None:
    # The page names «Hotel Schwert», but in another town: not this photo's Schwert.
    pages = FakePages({"https://other.ch/": "Hotel Schwert, Thalwil"})
    tools = FakeTools(
        FakeFamily(
            "openai",
            _answer(locality=("Gersau", []), building=("Hotel Schwert", ["https://other.ch/"])),
        ),
        FakeFamily("google", None, available=False),
        pages,
    )
    ctx = _ctx(tools)
    await research.run(ctx)
    (item,) = _items(ctx, "building")
    assert not item.attrs["verified"]


async def test_without_any_key_the_stage_says_so_and_adds_nothing() -> None:
    tools = FakeTools(
        FakeFamily("openai", None, available=False),
        FakeFamily("google", None, available=False),
        FakePages(),
    )
    ctx = _ctx(tools)
    await research.run(ctx)
    assert ctx.ledger.evidence == []
    assert any("übersprungen" in e.summary for e in ctx.ledger.events)
