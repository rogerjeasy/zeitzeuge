"""The confidence rule (design note §3, architecture §8.5, BR-6).

These tests are the rule's specification in executable form: the Methode sheet
of the workbook prints the same rule in German, and a judge who recomputes a
row by hand must get the number these tests pin.
"""

from __future__ import annotations

import random

import pytest

from zeitzeuge_api.db.models.enums import AbstainReason, FieldDecisionKind, SourceClass
from zeitzeuge_api.investigation.confidence import (
    ACCEPT_AT,
    REGISTER_EXISTENCE,
    REVIEW_AT,
    WEIGHTS,
    Objection,
    ReverseMatch,
    Support,
    landmark_strength,
    model_strength,
    research_strength,
    reverse_image_strength,
    row_confidence,
    score,
    strength_for_match,
)
from zeitzeuge_api.investigation.tools.base import MatchKind

G = SourceClass.GEODATA_LAYER
V = SourceClass.VISUAL
T = SourceClass.TEXT_IN_IMAGE
R = SourceClass.REFERENCE_IMAGE
W = SourceClass.OPEN_WEB
RI = SourceClass.REVERSE_IMAGE
OR = SourceClass.OPEN_RESEARCH
S = SourceClass.STREET_LEVEL


def test_the_weights_are_the_documented_defaults() -> None:
    assert WEIGHTS == {
        SourceClass.EXIF: 0.6,
        SourceClass.VISUAL: 0.3,
        SourceClass.TEXT_IN_IMAGE: 0.5,
        SourceClass.GEODATA_LAYER: 0.7,
        SourceClass.REFERENCE_IMAGE: 0.6,
        SourceClass.REVERSE_IMAGE: 0.8,
        SourceClass.OPEN_RESEARCH: 0.5,
        SourceClass.OPEN_WEB: 0.4,
        SourceClass.TERRAIN_GEOMETRY: 0.9,
        SourceClass.STREET_LEVEL: 0.5,
        SourceClass.ARCHIVAL: 0.7,
        SourceClass.HUMAN: 0.95,
    }
    assert (ACCEPT_AT, REVIEW_AT) == (0.90, 0.50)


def test_one_exact_register_match_alone_needs_review() -> None:
    result = score([Support(G, 1.0)])
    assert result.raw == pytest.approx(0.7)
    assert result.decision is FieldDecisionKind.EMIT_WITH_REVIEW
    assert result.explanation == "1 Quellenart bestätigt (Geodaten) · 0 anerkannte Einwände"


def test_three_independent_classes_reach_acceptance() -> None:
    result = score([Support(G, 1.0), Support(T, 0.8), Support(R, 0.8)])
    # 1 - (1 - 0.7)(1 - 0.4)(1 - 0.48) = 0.9064
    assert result.raw == pytest.approx(0.906, abs=1e-3)
    assert result.decision is FieldDecisionKind.EMIT
    assert result.source_classes == (G, R, T)
    assert result.corroborating_count == 3
    assert result.explanation == (
        "3 Quellenarten bestätigen (Geodaten, Referenzbild, Schrift im Bild) "
        "· 0 anerkannte Einwände"
    )


def test_ten_hits_from_one_class_count_once() -> None:
    once = score([Support(W, 0.6)])
    ten = score([Support(W, 0.6)] * 10)
    assert ten.raw == once.raw == pytest.approx(0.24)
    assert ten.corroborating_count == 10
    assert ten.source_classes == (W,)


def test_the_strongest_item_in_a_class_is_the_one_that_counts() -> None:
    assert score([Support(G, 0.6), Support(G, 1.0)]).raw == pytest.approx(0.7)


def test_an_upheld_objection_costs_its_severity() -> None:
    result = score([Support(G, 1.0), Support(R, 0.8)], [Objection(0.5)])
    # (1 - 0.3 * 0.52) * 0.5 = 0.422
    assert result.raw == pytest.approx(0.422, abs=1e-3)
    assert result.objection_count == 1
    assert result.decision is FieldDecisionKind.ABSTAIN
    assert result.abstain_reason is AbstainReason.INSUFFICIENT_EVIDENCE


def test_a_refutation_sets_the_field_to_zero_and_leaves_it_empty() -> None:
    result = score([Support(G, 1.0), Support(T, 0.8)], refuted=True)
    assert result.raw == 0.0
    assert result.decision is FieldDecisionKind.ABSTAIN
    assert result.abstain_reason is AbstainReason.CONFLICTING_EVIDENCE
    assert result.explanation.startswith("Widerlegt")


def test_a_full_severity_objection_is_a_refutation() -> None:
    result = score([Support(G, 1.0), Support(T, 0.8)], [Objection(1.0)])
    assert result.abstain_reason is AbstainReason.CONFLICTING_EVIDENCE


def test_no_support_is_an_abstention_never_a_guess() -> None:
    result = score([])
    assert result.raw == 0.0
    assert result.decision is FieldDecisionKind.ABSTAIN
    assert result.abstain_reason is AbstainReason.INSUFFICIENT_EVIDENCE
    assert result.explanation == "Keine belastbare Quelle · bewusst leer gelassen"


def test_a_model_alone_can_never_be_accepted() -> None:
    assert model_strength(1.0) == 0.8
    assert model_strength(-0.2) == 0.0
    assert score([Support(V, model_strength(1.0))]).raw == pytest.approx(0.24)


def test_tool_matches_map_to_the_stated_strengths() -> None:
    assert strength_for_match(MatchKind.EXACT) == 1.0
    assert strength_for_match(MatchKind.NORMALISED) == 0.85
    assert strength_for_match(MatchKind.FUZZY) == 0.6
    assert strength_for_match(MatchKind.SPATIAL) == 0.9


def test_the_row_confidence_is_the_weakest_emitted_field() -> None:
    emitted = score([Support(G, 1.0), Support(T, 0.8), Support(R, 0.8)])
    review = score([Support(G, 1.0)])
    empty = score([])
    assert row_confidence([emitted, review, empty]) == review.raw
    assert row_confidence([empty, empty]) is None


@pytest.mark.parametrize("seed", range(200))
def test_the_rule_is_bounded_and_monotone(seed: int) -> None:
    rng = random.Random(seed)  # noqa: S311 - a reproducible property test, not crypto
    classes = list(WEIGHTS)
    support = [Support(rng.choice(classes), rng.random()) for _ in range(rng.randint(0, 6))]
    objections = [Objection(rng.random() * 0.99) for _ in range(rng.randint(0, 2))]

    base = score(support, objections)
    more = score([*support, Support(rng.choice(classes), rng.random())], objections)
    objected = score(support, [*objections, Objection(rng.random() * 0.99)])

    assert 0.0 <= base.raw <= 1.0
    assert more.raw >= base.raw - 1e-9  # more evidence never lowers it
    assert objected.raw <= base.raw + 1e-9  # another objection never raises it


# --- identification upgrade (note 2026-10-24-identification-upgrade §5) -------------


def test_a_name_that_only_exists_in_a_register_stays_empty() -> None:
    # «Schwyz exists in swissNAMES3D» is not evidence that the photo shows Schwyz.
    assert REGISTER_EXISTENCE == 0.35
    result = score([Support(G, REGISTER_EXISTENCE)])
    assert result.raw == pytest.approx(0.245)
    assert result.decision is FieldDecisionKind.ABSTAIN


def test_reverse_image_strengths_follow_the_kind_of_match() -> None:
    assert reverse_image_strength(ReverseMatch.FULL) == 0.95
    assert reverse_image_strength(ReverseMatch.PARTIAL) == 0.8
    assert reverse_image_strength(ReverseMatch.SIMILAR) == 0.5
    assert landmark_strength(0.97) == 0.85
    assert landmark_strength(0.4) == 0.4
    assert landmark_strength(-1.0) == 0.0


def test_research_strength_rewards_only_verified_agreement() -> None:
    assert research_strength(verified=True, families_agreeing=1, any_verified=True) == 0.6
    assert research_strength(verified=False, families_agreeing=1, any_verified=False) == 0.3
    # Two families agree but nobody's source names the value: no bonus.
    assert research_strength(verified=False, families_agreeing=2, any_verified=False) == 0.3
    # Two families agree and one source is verified: both items carry the agreement.
    assert research_strength(verified=False, families_agreeing=2, any_verified=True) == 0.9
    assert research_strength(verified=True, families_agreeing=2, any_verified=True) == 0.9


def test_research_alone_never_fills_a_field() -> None:
    # Both families agreeing, verified: 0.5 x 0.9 = 0.45, still below the review line.
    agreed = research_strength(verified=True, families_agreeing=2, any_verified=True)
    assert score([Support(OR, agreed)]).decision is FieldDecisionKind.ABSTAIN


def test_research_plus_existence_plus_model_needs_review() -> None:
    agreed = research_strength(verified=True, families_agreeing=2, any_verified=True)
    result = score(
        [Support(OR, agreed), Support(G, REGISTER_EXISTENCE), Support(V, model_strength(0.8))]
    )
    assert result.raw == pytest.approx(0.684, abs=1e-3)
    assert result.decision is FieldDecisionKind.EMIT_WITH_REVIEW


def test_a_sign_a_register_point_and_research_reach_acceptance() -> None:
    # SG.CIV.17.58: «HOTEL DU LAC SEEHOF» on the facade.
    agreed = research_strength(verified=True, families_agreeing=2, any_verified=True)
    result = score([Support(T, 0.8), Support(G, 1.0), Support(OR, agreed)])
    assert result.raw == pytest.approx(0.901, abs=1e-3)
    assert result.decision is FieldDecisionKind.EMIT


def test_the_same_picture_online_plus_a_reference_photo_reach_acceptance() -> None:
    agreed = research_strength(verified=True, families_agreeing=2, any_verified=True)
    partial = reverse_image_strength(ReverseMatch.PARTIAL)
    without = score([Support(RI, partial), Support(OR, agreed), Support(V, 0.8)])
    assert without.raw == pytest.approx(0.850, abs=1e-3)
    assert without.decision is FieldDecisionKind.EMIT_WITH_REVIEW
    with_reference = score(
        [Support(RI, partial), Support(OR, agreed), Support(V, 0.8), Support(R, 0.8)]
    )
    assert with_reference.raw == pytest.approx(0.922, abs=1e-3)
    assert with_reference.decision is FieldDecisionKind.EMIT


def test_reference_and_street_view_without_anything_online_stay_in_review() -> None:
    # SG.CIV.17.3, the target: honest Prüfbedarf, not acceptance.
    agreed = research_strength(verified=True, families_agreeing=2, any_verified=True)
    result = score([Support(R, 0.8), Support(S, 0.8), Support(OR, agreed)])
    assert result.raw == pytest.approx(0.828, abs=1e-3)
    assert result.decision is FieldDecisionKind.EMIT_WITH_REVIEW
