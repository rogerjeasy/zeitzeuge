"""The deterministic half of the pipeline: grouping, citation checks, the rule's verdict.

No model and no network: a hand-built ledger goes through `hypothesise` and
`adjudicate.decide`, which is exactly what runs after the models have spoken.
"""

from __future__ import annotations

import uuid

import pytest

from zeitzeuge_api.db.models.enums import (
    AbstainReason,
    AgentId,
    EvidenceKind,
    FieldDecisionKind,
    SourceClass,
)
from zeitzeuge_api.investigation.context import Asset, RunContext
from zeitzeuge_api.investigation.names import distinctive, feature_key, is_placeholder, massif
from zeitzeuge_api.investigation.stages import hypothesise
from zeitzeuge_api.investigation.stages.adjudicate import decide


def _ctx() -> RunContext:
    return RunContext(
        run_id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        asset=Asset(id=uuid.uuid4(), external_ref="SG.CIV.17.3.jpg", image=b"", prepared=b""),
        models=None,  # type: ignore[arg-type]
        tools=None,  # type: ignore[arg-type]
    )


def _add(ctx: RunContext, field: str, value: str, cls: SourceClass, strength: float, **attrs):
    return ctx.ledger.add(
        kind=EvidenceKind.EXTERNAL,
        source_class=cls,
        agent_id=AgentId.GEO,
        observation=f"{value} ({cls.value})",
        strength=strength,
        field=field,
        value=value,
        attrs=attrs,
    )


def test_names() -> None:
    assert massif("Gross Mythen") == "Mythen"
    assert massif("Grosser Mythen") == "Mythen"
    assert massif("Chli Mythen") == "Mythen"
    assert massif("Rigi") is None
    assert feature_key("Grosser Mythen") == feature_key("Chli Mythen") == "mythen"
    assert distinctive("Alterszentrum Acherhof") == "acherhof"
    assert is_placeholder("Alters- oder Pflegeheim (unbekannt)")
    assert not is_placeholder("Alterszentrum Acherhof")


async def test_summits_group_into_their_massif() -> None:
    ctx = _ctx()
    _add(ctx, "landscape_feature", "Grosser Mythen", SourceClass.VISUAL, 0.75)
    _add(ctx, "landscape_feature", "Gross Mythen", SourceClass.GEODATA_LAYER, 0.85)
    await hypothesise.run(ctx)
    [hypothesis] = [h for h in ctx.ledger.hypotheses if h.field == "landscape_feature"]
    assert hypothesis.value == "Mythen"
    assert len(hypothesis.supporting) == 2


async def test_the_register_spelling_labels_the_hypothesis() -> None:
    ctx = _ctx()
    _add(ctx, "locality", "schwyz", SourceClass.VISUAL, 0.6)
    _add(ctx, "locality", "Schwyz", SourceClass.GEODATA_LAYER, 1.0)
    await hypothesise.run(ctx)
    assert [h.value for h in ctx.ledger.hypotheses] == ["Schwyz"]


async def test_three_classes_emit_and_a_bogus_citation_is_dropped() -> None:
    ctx = _ctx()
    a = _add(ctx, "locality", "Schwyz", SourceClass.GEODATA_LAYER, 1.0)
    b = _add(ctx, "locality", "Schwyz", SourceClass.REFERENCE_IMAGE, 0.8)
    c = _add(ctx, "locality", "Schwyz", SourceClass.TEXT_IN_IMAGE, 0.8)
    await hypothesise.run(ctx)
    [hyp] = ctx.ledger.hypotheses
    decision, scored = decide(ctx, "locality", hyp.local_id, ["ev_999", a.local_id], [], "ok")
    # the invented id is dropped; the valid citation alone (one class) is not enough…
    assert decision.evidence == [a.local_id]
    assert decision.decision is FieldDecisionKind.EMIT_WITH_REVIEW
    # …citing all three classes is.
    decision, scored = decide(
        ctx, "locality", hyp.local_id, [a.local_id, b.local_id, c.local_id], [], ""
    )
    assert decision.decision is FieldDecisionKind.EMIT
    assert scored.raw == pytest.approx(0.906, abs=1e-3)
    assert decision.value == "Schwyz"


async def test_counter_evidence_costs_confidence() -> None:
    ctx = _ctx()
    _add(ctx, "building", "Spital Lachen", SourceClass.GEODATA_LAYER, 0.85)
    _add(ctx, "building", "Spital Lachen", SourceClass.REFERENCE_IMAGE, 0.8)
    _add(ctx, "building", "Spital Lachen", SourceClass.REFERENCE_IMAGE, 0.4, refutes=True)
    _add(ctx, "building", "Spital Lachen", SourceClass.REFERENCE_IMAGE, 0.4, refutes=True)
    await hypothesise.run(ctx)
    [hyp] = ctx.ledger.hypotheses
    assert len(hyp.refuting) == 2
    decision, scored = decide(ctx, "building", hyp.local_id, [], [], "")
    # 1 - 0.405*0.52 = 0.789, * 0.6 * 0.6 = 0.284 -> left empty
    assert scored.raw == pytest.approx(0.284, abs=2e-3)
    assert decision.decision is FieldDecisionKind.ABSTAIN
    assert decision.abstain_reason is AbstainReason.INSUFFICIENT_EVIDENCE
    assert scored.objection_count == 2


async def test_no_hypothesis_is_an_abstention() -> None:
    ctx = _ctx()
    decision, _ = decide(ctx, "street", None, [], [], "")
    assert decision.decision is FieldDecisionKind.ABSTAIN
    assert decision.value is None


async def test_a_name_that_merely_exists_does_not_identify_the_building() -> None:
    ctx = _ctx()
    _add(ctx, "building", "Spital Lachen", SourceClass.VISUAL, 0.4)
    _add(ctx, "building", "Spital Lachen", SourceClass.GEODATA_LAYER, 0.85, existence_only=True)
    await hypothesise.run(ctx)
    [hyp] = ctx.ledger.hypotheses
    assert len(hyp.supporting) == 1  # the register entry is context, not support
    decision, _ = decide(ctx, "building", hyp.local_id, [], [], "")
    assert decision.decision is FieldDecisionKind.ABSTAIN


async def test_existence_counts_once_a_reference_photo_identifies_it() -> None:
    ctx = _ctx()
    _add(
        ctx,
        "building",
        "Alterszentrum Acherhof",
        SourceClass.GEODATA_LAYER,
        0.85,
        existence_only=True,
    )
    _add(ctx, "building", "Alterszentrum Acherhof", SourceClass.REFERENCE_IMAGE, 0.8)
    await hypothesise.run(ctx)
    [hyp] = ctx.ledger.hypotheses
    assert len(hyp.supporting) == 2
