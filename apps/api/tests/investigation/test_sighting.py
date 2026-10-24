"""Sighting: the strength of «the same picture online» comes from the match, not a model."""

from __future__ import annotations

from zeitzeuge_api.investigation.confidence import ReverseMatch
from zeitzeuge_api.investigation.stages.sighting import Sighted, collect, strength_for

VISION = {
    "webDetection": {
        "pagesWithMatchingImages": [
            {
                "url": "https://www.acherhof.ch/",
                "pageTitle": "<b>Alterszentrum Acherhof</b> Schwyz",
                "fullMatchingImages": [{"url": "https://www.acherhof.ch/a.jpg"}],
            },
            {
                "url": "https://example.ch/schwyz",
                "pageTitle": "Schwyz im Winter",
                "partialMatchingImages": [{"url": "https://example.ch/b.jpg"}],
            },
        ],
        "bestGuessLabels": [{"label": "acherhof schwyz"}],
    }
}
LENS = {
    "visual_matches": [
        {
            "title": "Spital Schwyz",
            "link": "https://spital.ch/",
            "thumbnail": "https://encrypted-tbn0.gstatic.com/x",
        }
    ]
}


def test_pages_from_both_engines_keep_their_match_kind() -> None:
    pages = collect(VISION, LENS)
    assert [(p.origin, p.kind) for p in pages] == [
        ("vision", ReverseMatch.FULL),
        ("vision", ReverseMatch.PARTIAL),
        ("lens", ReverseMatch.SIMILAR),
    ]
    assert pages[0].title == "Alterszentrum Acherhof Schwyz"  # HTML stripped


def test_the_best_page_naming_the_value_sets_the_strength() -> None:
    pages = collect(VISION, LENS)
    assert strength_for("Alterszentrum Acherhof", pages, []) == 0.95
    assert strength_for("Schwyz", pages, []) == 0.95  # also on the full-match page
    assert strength_for("Spital Schwyz", pages, []) == 0.5  # only a similar picture
    assert strength_for("Mythen", pages, []) is None


def test_a_label_alone_is_only_similar() -> None:
    pages = [Sighted("Ferien in der Schweiz", "https://x.ch/", ReverseMatch.FULL, "vision")]
    assert strength_for("Acherhof", pages, ["acherhof schwyz"]) == 0.5
