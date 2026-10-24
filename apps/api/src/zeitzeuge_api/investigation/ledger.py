"""The only writer of the Evidence Ledger and of the machine's record versions.

Stages compute in memory (`context.py`); this module persists what a stage
added, in one transaction per stage, under the run's tenant (RLS applies to the
pipeline exactly as to the API). Run-local ids (`ev_007`, `hyp_B`) are mapped
to row ids here, so citations survive into `record_field_evidence`.

Each commit ends with `pg_notify('zz_runs', …)` carrying only ids and the stage
name. The API's stream endpoint listens on that channel and re-reads the run
under the *viewer's* tenant (design note D8) — the notification itself never
carries tenant data across the boundary.

P0 departs from the architecture's Data API transport (design note D2); this
module is the seam where that swap happens.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.db.models import (
    AgentInvocation,
    Asset,
    CatalogueRecord,
    EvidenceItem,
    EvidenceLink,
    Hypothesis,
    Objection,
    RecordField,
    RecordFieldEvidence,
    RecordVersion,
    Run,
    RunEvent,
)
from zeitzeuge_api.db.models.enums import (
    ActorKind,
    AssetStatus,
    EvidenceRelation,
    EvidenceRole,
    FieldDecisionKind,
    HypothesisKind,
    HypothesisStatus,
    InvocationStatus,
    ObjectionResolution,
    RecordStatus,
    RunStatus,
    VersionChange,
)
from zeitzeuge_api.investigation.confidence import WEIGHTS, Scored
from zeitzeuge_api.investigation.context import RunContext, StageRecord
from zeitzeuge_api.investigation.contracts import FieldDecision

CHANNEL = "zz_runs"
GENERATED_BY = "zeitzeuge/investigation@0.1.0"

_KIND = {
    "locality": HypothesisKind.PLACE,
    "municipality": HypothesisKind.PLACE,
    "building": HypothesisKind.BUILDING,
    "landscape_feature": HypothesisKind.FEATURE,
    "street": HypothesisKind.STREET,
}
_OWNER = {
    "locality": "geo",
    "municipality": "geo",
    "building": "heritage",
    "landscape_feature": "geo",
    "street": "geo",
}


class LedgerWriter:
    """Tracks what has been persisted for one run, so each stage writes only its delta."""

    def __init__(self, ctx: RunContext, *, batch_id: uuid.UUID | None) -> None:
        self.ctx = ctx
        self.batch_id = batch_id
        self.evidence_ids: dict[str, uuid.UUID] = {}
        self.hypothesis_ids: dict[str, uuid.UUID] = {}
        self.objection_ids: list[uuid.UUID] = []
        self._events = 0
        self._seq = 0
        self._started = datetime.now(UTC)

    async def stage_started(self, session: AsyncSession, stage: str) -> None:
        run = await session.get(Run, self.ctx.run_id)
        assert run is not None
        run.current_stage = stage
        run.heartbeat_at = datetime.now(UTC)
        await self._notify(session, stage, "started")

    async def stage_done(self, session: AsyncSession, record: StageRecord) -> None:
        ctx, org = self.ctx, self.ctx.org_id
        invocation = AgentInvocation(
            id=uuid.uuid4(),
            org_id=org,
            run_id=ctx.run_id,
            agent_id=record.agent_id,
            stage=record.stage,
            acting_as=[a.value for a in record.acting_as],
            tier=_TIER.get(record.agent_id.value, 0),
            status=InvocationStatus.FAILED if record.error else InvocationStatus.SUCCEEDED,
            model_id=record.model_id,
            inference_profile=record.model_id,
            region=record.region,
            output=_jsonable(record.output),
            started_at=record.started_at,
            ended_at=record.ended_at or datetime.now(UTC),
            input_tokens=record.input_tokens,
            output_tokens=record.output_tokens,
            cost_usd=Decimal(str(round(record.cost_usd, 6))),
            error={"detail": record.error} if record.error else None,
        )
        session.add(invocation)
        await session.flush()

        for item in ctx.ledger.evidence[len(self.evidence_ids) :]:
            row = EvidenceItem(
                id=uuid.uuid4(),
                org_id=org,
                run_id=ctx.run_id,
                local_id=item.local_id,
                kind=item.kind,
                source_class=item.source_class,
                agent_id=item.agent_id,
                invocation_id=invocation.id,
                model_id=item.model_id,
                observation=item.observation,
                source=item.source,
                source_uri=item.source_uri,
                strength=Decimal(str(round(item.strength, 3))),
                implies=_jsonable(
                    {
                        "field": item.field,
                        "value": item.value,
                        "lv95": list(item.lv95) if item.lv95 else None,
                        **item.attrs,
                    }
                ),
            )
            session.add(row)
            self.evidence_ids[item.local_id] = row.id
        await session.flush()

        for hypothesis in ctx.ledger.hypotheses[len(self.hypothesis_ids) :]:
            hyp_row = Hypothesis(
                id=uuid.uuid4(),
                org_id=org,
                run_id=ctx.run_id,
                local_id=hypothesis.local_id,
                kind=_KIND[hypothesis.field],
                field_key=hypothesis.field,
                statement=hypothesis.value,
                value=_jsonable(hypothesis.typed_value),
                prior=Decimal(str(hypothesis.prior)),
            )
            session.add(hyp_row)
            self.hypothesis_ids[hypothesis.local_id] = hyp_row.id
            await session.flush()
            for local_id in hypothesis.supporting:
                session.add(
                    EvidenceLink(
                        evidence_id=self.evidence_ids[local_id],
                        hypothesis_id=hyp_row.id,
                        org_id=org,
                        relation=EvidenceRelation.SUPPORTS,
                    )
                )
            for local_id in hypothesis.refuting:
                session.add(
                    EvidenceLink(
                        evidence_id=self.evidence_ids[local_id],
                        hypothesis_id=hyp_row.id,
                        org_id=org,
                        relation=EvidenceRelation.REFUTES,
                    )
                )

        for objection in ctx.ledger.objections[len(self.objection_ids) :]:
            objection_row = Objection(
                id=uuid.uuid4(),
                org_id=org,
                run_id=ctx.run_id,
                hypothesis_id=self.hypothesis_ids[objection.hypothesis],
                from_agent="redteam",
                model_id=objection.model_id,
                claim=objection.claim,
                severity=Decimal(str(round(objection.severity, 3))),
            )
            session.add(objection_row)
            self.objection_ids.append(objection_row.id)

        for event in ctx.ledger.events[self._events :]:
            self._seq += 1
            session.add(
                RunEvent(
                    org_id=org,
                    run_id=ctx.run_id,
                    seq=self._seq,
                    t_ms=int((event.at - self._started).total_seconds() * 1000),
                    agent_id=event.agent_id,
                    kind=event.kind,
                    summary=event.summary,
                    evidence_local_id=event.evidence_local_id,
                )
            )
        self._events = len(ctx.ledger.events)

        run = await session.get(Run, ctx.run_id)
        assert run is not None
        run.agents_completed = len({a for r in ctx.records for a in r.acting_as})
        run.cost_usd = Decimal(str(round(sum(r.cost_usd for r in ctx.records), 6)))
        run.heartbeat_at = datetime.now(UTC)
        await session.flush()
        await self._notify(session, record.stage, "done")

    async def produce(
        self,
        session: AsyncSession,
        decisions: dict[str, FieldDecision],
        scores: dict[str, Scored],
        *,
        subject_point: dict[str, Any] | None,
        fonds_id: uuid.UUID,
    ) -> uuid.UUID:
        """Cartographer: write the machine's record version (roster `cartographer`)."""
        ctx, org = self.ctx, self.ctx.org_id
        record = await session.scalar(
            select(CatalogueRecord).where(CatalogueRecord.asset_id == ctx.asset.id)
        )
        if record is None:
            record = CatalogueRecord(
                id=uuid.uuid4(),
                org_id=org,
                asset_id=ctx.asset.id,
                fonds_id=fonds_id,
                current_version=0,
            )
            session.add(record)
            await session.flush()
        version_no = record.current_version + 1
        version = RecordVersion(
            id=uuid.uuid4(),
            org_id=org,
            record_id=record.id,
            version=version_no,
            run_id=ctx.run_id,
            parent_version=record.current_version or None,
            actor_kind=ActorKind.MACHINE,
            change_kind=VersionChange.GENERATED,
            formula_weights={k.value: v for k, v in WEIGHTS.items()},
            summary=f"Maschinelle Erschliessung, Lauf {ctx.run_id}",
        )
        session.add(version)
        await session.flush()

        models = sorted({r.model_id for r in ctx.records if r.model_id})
        for field_key, decision in decisions.items():
            scored = scores[field_key]
            emitted = decision.decision is not FieldDecisionKind.ABSTAIN
            row = RecordField(
                id=uuid.uuid4(),
                org_id=org,
                record_version_id=version.id,
                field_key=field_key,
                decision=decision.decision,
                abstain_reason=decision.abstain_reason,
                value_text=decision.value if emitted else None,
                value=_jsonable(decision.typed_value) if emitted else None,
                confidence=Decimal(str(scored.raw)) if emitted else None,
                raw_confidence=Decimal(str(scored.raw)),
                source_classes=[c.value for c in scored.source_classes],
                corroborating_count=scored.corroborating_count,
                objection_count=scored.objection_count,
                explanation=scored.explanation,
                rationale=decision.rationale or None,
                generated_by=GENERATED_BY,
                agent_id=_OWNER[field_key],
                models=models,
                method="evidence_ledger+noisy_or_rule",
            )
            session.add(row)
            await session.flush()
            for position, local_id in enumerate(decision.evidence):
                evidence_id = self.evidence_ids.get(local_id)
                if evidence_id is None:
                    continue
                session.add(
                    RecordFieldEvidence(
                        record_field_id=row.id,
                        evidence_id=evidence_id,
                        org_id=org,
                        role=EvidenceRole.PRIMARY if position == 0 else EvidenceRole.SUPPORTING,
                    )
                )
            if decision.hypothesis and decision.hypothesis in self.hypothesis_ids:
                hypothesis = await session.get(Hypothesis, self.hypothesis_ids[decision.hypothesis])
                if hypothesis is not None:
                    hypothesis.status = (
                        HypothesisStatus.SELECTED if emitted else HypothesisStatus.SURVIVING
                    )
                    hypothesis.posterior = Decimal(str(scored.raw))
            for index in decision.upheld_objections:
                if 0 <= index < len(self.objection_ids):
                    upheld = await session.get(Objection, self.objection_ids[index])
                    if upheld is not None:
                        upheld.resolution = ObjectionResolution.UPHELD

        if subject_point:
            point = RecordField(
                id=uuid.uuid4(),
                org_id=org,
                record_version_id=version.id,
                field_key="subject_point",
                decision=FieldDecisionKind.EMIT_WITH_REVIEW,
                value_text=f"{subject_point['lv95'][0]:.0f} / {subject_point['lv95'][1]:.0f}",
                value=_jsonable(subject_point),
                confidence=Decimal(str(subject_point.get("confidence", 0.5))),
                raw_confidence=Decimal(str(subject_point.get("confidence", 0.5))),
                source_classes=[subject_point.get("source_class", "geodata_layer")],
                corroborating_count=1,
                explanation="Punkt des identifizierten Objekts",
                generated_by=GENERATED_BY,
                agent_id="geo",
                models=models,
                method="point_from_resolved_object",
            )
            session.add(point)
            await session.flush()
            evidence_id = self.evidence_ids.get(subject_point.get("evidence", ""))
            if evidence_id:
                session.add(
                    RecordFieldEvidence(
                        record_field_id=point.id, evidence_id=evidence_id, org_id=org
                    )
                )

        record.current_version = version_no
        record.status = RecordStatus.IN_REVIEW
        emitted_scores = [
            scores[k].raw
            for k, d in decisions.items()
            if d.decision is not FieldDecisionKind.ABSTAIN
        ]
        run = await session.get(Run, ctx.run_id)
        asset = await session.get(Asset, ctx.asset.id)
        assert run is not None and asset is not None
        run.status = RunStatus.AWAITING_REVIEW if emitted_scores else RunStatus.ABSTAINED
        run.outcome_confidence = Decimal(str(min(emitted_scores))) if emitted_scores else None
        run.abstentions = sum(
            1 for d in decisions.values() if d.decision is FieldDecisionKind.ABSTAIN
        )
        run.current_stage = "produce"
        run.finished_at = datetime.now(UTC)
        asset.status = AssetStatus.DONE
        await session.flush()
        await self._notify(session, "produce", "done")
        return record.id

    async def failed(self, session: AsyncSession, stage: str, error: str) -> None:
        run = await session.get(Run, self.ctx.run_id)
        asset = await session.get(Asset, self.ctx.asset.id)
        if run is not None:
            run.status = RunStatus.FAILED
            run.error = {"stage": stage, "detail": error[:2000]}
            run.finished_at = datetime.now(UTC)
        if asset is not None:
            asset.status = AssetStatus.ERROR
        await self._notify(session, stage, "failed")

    async def _notify(self, session: AsyncSession, stage: str, state: str) -> None:
        if session.bind is None or session.bind.dialect.name != "postgresql":
            return
        payload = json.dumps(
            {
                "run_id": str(self.ctx.run_id),
                "batch_id": str(self.batch_id) if self.batch_id else None,
                "org_id": str(self.ctx.org_id),
                "stage": stage,
                "state": state,
            }
        )
        await session.execute(text("SELECT pg_notify(:c, :p)"), {"c": CHANNEL, "p": payload})


_TIER = {
    "forensics": 0,
    "scene": 1,
    "text-in-image": 1,
    "skyline": 1,
    "geo": 2,
    "heritage": 1,
    "memory": 2,
    "research": 2,
    "synthesiser": 3,
    "redteam": 3,
    "adjudicator": 3,
    "cartographer": 4,
}


def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    return json.loads(json.dumps(value, default=_default))


def _default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    if isinstance(value, tuple):
        return list(value)
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    raise TypeError(type(value).__name__)
