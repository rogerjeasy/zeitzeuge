"""The investigation surface: batches, uploads, the case file, reviews.

Every method runs in the caller's request transaction, which `resolve_identity`
has already narrowed to the caller's archive, so a batch id from another
archive is simply not found (RLS), and a parent row used in a write is always
one this archive could read first (the code-level half of the tenant-FK
hardening item, design note §9).

The review path is append-only: accepting, correcting or rejecting a field
writes a new `record_versions` row (`actor_kind = human`) that carries every
other field over unchanged, plus a `field_reviews` row. A correction also adds
a `human` evidence item to the ledger, so the new value cites a source like
every other value (data-model §8.6), and the rule scores it like every other
value.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.core.ids import new_public_id
from zeitzeuge_api.db.models import (
    AgentInvocation,
    Asset,
    AssetFile,
    AuditLog,
    CatalogueRecord,
    EvidenceItem,
    EvidenceLink,
    Export,
    ExportItem,
    FieldDefinition,
    FieldReview,
    Fonds,
    Hypothesis,
    Objection,
    Organization,
    RecordField,
    RecordFieldEvidence,
    RecordVersion,
    Run,
    RunEvent,
    UploadBatch,
    User,
)
from zeitzeuge_api.db.models.enums import (
    AbstainReason,
    ActorKind,
    AgentId,
    AssetSide,
    AssetStatus,
    AuditAction,
    BatchSource,
    BatchStatus,
    DescriptionLevel,
    EvidenceKind,
    EvidenceRelation,
    ExportFormat,
    ExportScope,
    ExtentUnit,
    FieldDecisionKind,
    FieldOrigin,
    FileRole,
    ReviewAction,
    RunStatus,
    SourceClass,
    VersionChange,
)
from zeitzeuge_api.integrations.aws.originals import OriginalsStorage, master_key
from zeitzeuge_api.investigation.confidence import SOURCE_CLASS_DE, Support, score
from zeitzeuge_api.investigation.contracts import RANKED_FIELDS
from zeitzeuge_api.investigation.timing import duration_ms, summarise
from zeitzeuge_api.schemas import investigation as schemas
from zeitzeuge_api.services.exporters.xlsx import build_workbook
from zeitzeuge_api.services.qc import RANKED_FIELD_KEYS, qc_status, qc_summary

FINISHED = {RunStatus.AWAITING_REVIEW, RunStatus.ACCEPTED, RunStatus.ABSTAINED}
HUMAN_STRENGTH = 1.0
FIELD_LABELS = {
    "locality": "Ortschaft",
    "municipality": "Politische Gemeinde",
    "building": "Gebäude",
    "landscape_feature": "See / Fluss / Berg",
    "street": "Strasse",
}


def natural_key(text: str) -> list[Any]:
    """`SG.CIV.17.3` before `SG.CIV.17.11`."""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def status_label(fields: list[RecordField]) -> str | None:
    ranked = [f for f in fields if f.field_key in RANKED_FIELDS]
    if not ranked:
        return None
    emitted = [f for f in ranked if f.decision is not FieldDecisionKind.ABSTAIN]
    if not emitted:
        return "unbestimmt"
    if all(f.decision is FieldDecisionKind.EMIT for f in emitted):
        return "übernahmefähig"
    return "Prüfbedarf"


class InvestigationService:
    def __init__(self, originals: OriginalsStorage) -> None:
        self._originals = originals

    # --- batches --------------------------------------------------------------

    async def list_batches(
        self, session: AsyncSession, *, include_deleted: bool = False
    ) -> list[schemas.BatchSummary]:
        query = select(UploadBatch).order_by(UploadBatch.created_at.desc())
        if not include_deleted:
            query = query.where(UploadBatch.deleted_at.is_(None))
        rows = await session.scalars(query)
        return [
            schemas.BatchSummary(
                id=str(b.id),
                label=b.label,
                status=str(b.status),
                created_at=b.created_at,
                asset_count=b.asset_count,
                mirrored_from=str(b.mirrored_from_id) if b.mirrored_from_id else None,
                deleted_at=b.deleted_at,
            )
            for b in rows
        ]

    async def create_batch(
        self,
        session: AsyncSession,
        *,
        user: User,
        data: schemas.CreateBatchRequest,
        context: RequestContext,
    ) -> schemas.BatchSummary:
        fonds = await self._fonds(session, user.org_id, data.fonds_slug)
        batch = UploadBatch(
            id=uuid.uuid4(),
            org_id=user.org_id,
            created_by=user.id,
            source=BatchSource.BROWSER,
            label=data.label,
            fonds_id=fonds.id,
            run_mode=data.mode,
            status=BatchStatus.UPLOADING,
            issues=[],
        )
        if data.priority is not None:
            batch.issues = [{"code": "default-priority", "priority": data.priority}]
        session.add(batch)
        session.add(
            AuditLog(
                org_id=user.org_id,
                actor_user_id=user.id,
                action=AuditAction.BATCH_CREATED,
                target_type="upload_batch",
                target_id=str(batch.id),
                request_id=context.request_id,
            )
        )
        await session.flush()
        return schemas.BatchSummary(
            id=str(batch.id),
            label=batch.label,
            status=str(batch.status),
            created_at=datetime.now(UTC),
            asset_count=0,
            mirrored_from=None,
        )

    async def register_files(
        self,
        session: AsyncSession,
        *,
        user: User,
        batch_id: uuid.UUID,
        data: schemas.RegisterFilesRequest,
    ) -> schemas.RegisterFilesResponse:
        batch = await self._batch(session, batch_id)
        default_priority = next(
            (i.get("priority") for i in batch.issues or [] if i.get("code") == "default-priority"),
            None,
        )
        existing = {
            a.external_ref: a
            for a in await session.scalars(select(Asset).where(Asset.batch_id == batch.id))
        }
        new_files = sum(1 for item in data.files if item.filename not in existing)
        await self._demo_guard(session, user.org_id, new_photos=new_files)
        out: list[schemas.RegisteredFile] = []
        for item in data.files:
            asset = existing.get(item.filename)
            if asset is not None and asset.deleted_at is not None:
                out.append(
                    schemas.RegisteredFile(
                        asset_id=str(asset.id),
                        filename=item.filename,
                        upload=None,
                        status="withdrawn",
                    )
                )
                continue
            if asset is not None and asset.status not in {
                AssetStatus.QUEUED,
                AssetStatus.UPLOADING,
            }:
                out.append(
                    schemas.RegisteredFile(
                        asset_id=str(asset.id),
                        filename=item.filename,
                        upload=None,
                        status=str(asset.status),
                    )
                )
                continue
            if asset is None:
                asset = Asset(
                    id=uuid.uuid4(),
                    org_id=user.org_id,
                    fonds_id=batch.fonds_id,
                    batch_id=batch.id,
                    external_ref=item.filename,
                    priority=item.priority if item.priority is not None else default_priority,
                    status=AssetStatus.UPLOADING,
                    created_by=user.id,
                )
                session.add(asset)
                await session.flush()
                key = master_key(user.org_id, asset.id, item.content_type)
                session.add(
                    AssetFile(
                        org_id=user.org_id,
                        asset_id=asset.id,
                        side=AssetSide.RECTO,
                        role=FileRole.MASTER,
                        bucket=self._originals.bucket,
                        s3_key=key,
                        original_filename=item.filename,
                        mime_type=item.content_type,
                        bytes=item.content_length,
                        exif={"declared_sha256": item.sha256} if item.sha256 else None,
                    )
                )
                existing[item.filename] = asset
            else:
                key = master_key(user.org_id, asset.id, item.content_type)
            ticket = self._originals.ticket(
                key=key, content_type=item.content_type, content_length=item.content_length
            )
            out.append(
                schemas.RegisteredFile(
                    asset_id=str(asset.id),
                    filename=item.filename,
                    upload=schemas.UploadTicketOut(
                        upload_url=ticket.url,
                        fields=ticket.fields,
                        key=ticket.key,
                        expires_in=ticket.expires_in,
                        max_bytes=ticket.max_bytes,
                    ),
                    status=str(asset.status),
                )
            )
        batch.asset_count = len(existing)
        await session.flush()
        return schemas.RegisterFilesResponse(batch_id=str(batch.id), files=out)

    async def commit_upload(
        self, session: AsyncSession, *, user: User, asset_id: uuid.UUID
    ) -> schemas.CommitResponse:
        asset = await session.get(Asset, asset_id)
        if asset is None:
            raise errors.NotFoundError("No such photograph.")
        batch_of = await session.get(UploadBatch, asset.batch_id) if asset.batch_id else None
        if asset.deleted_at is not None or (batch_of is not None and batch_of.deleted_at):
            raise errors.ConflictError("This photograph has been withdrawn; restore it first.")
        master = await self._master(session, asset.id)
        if asset.status in {AssetStatus.UPLOADED, AssetStatus.ANALYSING, AssetStatus.DONE}:
            run = await self._latest_run(session, asset.id)
            return schemas.CommitResponse(
                asset_id=str(asset.id),
                run_id=run.public_id if run else "",
                status=str(asset.status),
            )
        size, content_type = await self._originals.head(master.s3_key)
        if content_type != master.mime_type or size <= 0:
            raise errors.UnsupportedMediaTypeError("The stored object is not what was announced.")
        master.bytes = size
        master.uploaded_at = datetime.now(UTC)
        asset.status = AssetStatus.UPLOADED
        batch = await session.get(UploadBatch, asset.batch_id) if asset.batch_id else None
        run = Run(
            id=uuid.uuid4(),
            org_id=user.org_id,
            public_id=new_public_id("run"),
            asset_id=asset.id,
            batch_id=asset.batch_id,
            mode=batch.run_mode if batch else "standard",
            triggered_by=user.id,
        )
        session.add(run)
        if batch is not None and batch.status is BatchStatus.UPLOADING:
            batch.status = BatchStatus.RUNNING
        session.add(
            AuditLog(
                org_id=user.org_id,
                actor_user_id=user.id,
                action=AuditAction.ASSET_UPLOADED,
                target_type="asset",
                target_id=str(asset.id),
            )
        )
        await session.flush()
        return schemas.CommitResponse(
            asset_id=str(asset.id), run_id=run.public_id, status=str(asset.status)
        )

    async def rerun(self, session: AsyncSession, *, user: User, asset_id: uuid.UUID) -> str:
        asset = await session.get(Asset, asset_id)
        if asset is None:
            raise errors.NotFoundError("No such photograph.")
        if asset.deleted_at is not None:
            raise errors.ConflictError("This photograph has been withdrawn; restore it first.")
        latest = await self._latest_run(session, asset.id)
        if latest is not None and latest.status in {RunStatus.QUEUED, RunStatus.RUNNING}:
            raise errors.ConflictError("This photograph is already being investigated.")
        await self._demo_guard(session, user.org_id, new_runs=1)
        run = Run(
            id=uuid.uuid4(),
            org_id=user.org_id,
            public_id=new_public_id("run"),
            asset_id=asset.id,
            batch_id=asset.batch_id,
            kind="rerun",
            parent_run_id=latest.id if latest else None,
            triggered_by=user.id,
        )
        session.add(run)
        await session.flush()
        return run.public_id

    async def batch(
        self, session: AsyncSession, batch_id: uuid.UUID, *, include_deleted: bool = False
    ) -> schemas.BatchOut:
        batch = await self._batch(session, batch_id)
        everything = list(await session.scalars(select(Asset).where(Asset.batch_id == batch.id)))
        withdrawn = sum(1 for a in everything if a.deleted_at is not None)
        withdrawers = {
            # The name only, never the address: the Papierkorb says who, not how to reach them.
            u.id: u.full_name or "Archivmitarbeiter:in"
            for u in await session.scalars(
                select(User).where(User.id.in_({a.deleted_by for a in everything if a.deleted_by}))
            )
        }
        assets = sorted(
            (a for a in everything if include_deleted or a.deleted_at is None),
            key=lambda a: natural_key(a.external_ref),
        )
        asset_ids = [a.id for a in assets]
        runs: dict[uuid.UUID, Run] = {}
        for each in await session.scalars(
            select(Run).where(Run.asset_id.in_(asset_ids)).order_by(Run.created_at)
        ):
            runs[each.asset_id] = each  # the latest wins
        records = {
            r.asset_id: r
            for r in await session.scalars(
                select(CatalogueRecord).where(CatalogueRecord.asset_id.in_(asset_ids))
            )
        }
        fields_by_record = await self._head_fields(session, list(records.values()))
        previews = await self._previews(session, asset_ids)
        reviews = await self._reviews(session, [r.id for r in records.values()])

        counts: dict[str, int] = defaultdict(int)
        rows: list[schemas.BatchAsset] = []
        for asset in assets:
            run = runs.get(asset.id)
            record = records.get(asset.id)
            fields = fields_by_record.get(record.id, []) if record else []
            label = status_label(fields)
            finished = bool(run and run.status in FINISHED)
            emitted = [
                f.field_key
                for f in fields
                if f.field_key in RANKED_FIELDS and f.decision is not FieldDecisionKind.ABSTAIN
            ]
            qc = qc_status(
                run_finished=finished,
                reviews=reviews.get(record.id, []) if record else [],
                emitted_fields=emitted,
            )
            gone = asset.deleted_at is not None
            if not gone:
                counts["total"] += 1
            if not gone:
                if asset.status not in {AssetStatus.QUEUED, AssetStatus.UPLOADING}:
                    counts["uploaded"] += 1
                if run is not None:
                    if run.status is RunStatus.QUEUED:
                        counts["queued"] += 1
                    elif run.status is RunStatus.RUNNING:
                        counts["running"] += 1
                    elif run.status is RunStatus.FAILED:
                        counts["failed"] += 1
                    elif finished:
                        counts["done"] += 1
                if label == "übernahmefähig":
                    counts["accepted"] += 1
                elif label == "Prüfbedarf":
                    counts["review"] += 1
                elif label == "unbestimmt":
                    counts["undetermined"] += 1
            rows.append(
                schemas.BatchAsset(
                    asset_id=str(asset.id),
                    external_ref=asset.external_ref,
                    priority=asset.priority,
                    status=str(asset.status),
                    stage=run.current_stage if run else None,
                    run_id=run.public_id if run else None,
                    run_status=str(run.status) if run else None,
                    error=(run.error or {}).get("detail") if run and run.error else None,
                    outcome_confidence=_f(run.outcome_confidence) if run else None,
                    record_id=str(record.id) if record else None,
                    status_label=label,
                    qc_status=qc,
                    fields={
                        f.field_key: schemas.FieldSummary(
                            value=f.value_text,
                            decision=str(f.decision),
                            confidence=_f(f.confidence),
                        )
                        for f in fields
                        if f.field_key in RANKED_FIELDS
                    },
                    preview_url=previews.get(asset.id),
                    captured_at=asset.captured_at,
                    deleted_at=asset.deleted_at,
                    deletion_reason=asset.deletion_reason,
                    deleted_by_name=withdrawers.get(asset.deleted_by) if asset.deleted_by else None,
                    queued_at=run.created_at if run else None,
                    started_at=run.started_at if run else None,
                    finished_at=run.finished_at if run else None,
                    duration_ms=(
                        duration_ms(run.started_at, run.finished_at) if run and finished else None
                    ),
                    wait_ms=duration_ms(run.created_at, run.started_at) if run else None,
                )
            )
        if (
            batch.status is BatchStatus.RUNNING
            and counts["total"]
            and (counts["done"] + counts["failed"] == counts["total"])
        ):
            batch.status = BatchStatus.DONE
            batch.finished_at = datetime.now(UTC)
        return schemas.BatchOut(
            id=str(batch.id),
            label=batch.label,
            status=str(batch.status),
            created_at=batch.created_at,
            mirrored_from=str(batch.mirrored_from_id) if batch.mirrored_from_id else None,
            mirrored_at=batch.mirrored_at,
            deleted_at=batch.deleted_at,
            timing=schemas.BatchTiming(
                **summarise(
                    (
                        (
                            r.started_at,
                            r.finished_at
                            if r.status not in {RunStatus.QUEUED, RunStatus.RUNNING}
                            else None,
                            r.status in FINISHED,
                        )
                        for a, r in ((a, runs.get(a.id)) for a in assets)
                        if r is not None and a.deleted_at is None
                    ),
                    now=datetime.now(UTC),
                )
            ),
            counts=schemas.BatchCounts(
                total=counts["total"],
                uploaded=counts["uploaded"],
                queued=counts["queued"],
                running=counts["running"],
                done=counts["done"],
                failed=counts["failed"],
                accepted=counts["accepted"],
                review=counts["review"],
                undetermined=counts["undetermined"],
                deleted=withdrawn,
            ),
            assets=rows,
        )

    # --- the case file ----------------------------------------------------------

    async def case_file(self, session: AsyncSession, asset_id: uuid.UUID) -> schemas.CaseFile:
        asset = await session.get(Asset, asset_id)
        if asset is None:
            raise errors.NotFoundError("No such photograph.")
        run = await self._latest_run(session, asset.id)
        record = await session.scalar(
            select(CatalogueRecord).where(CatalogueRecord.asset_id == asset.id)
        )
        fields = (await self._head_fields(session, [record])).get(record.id, []) if record else []
        version = await self._head_version(session, record) if record else None
        evidence_run = version.run_id if version and version.run_id else (run.id if run else None)

        evidence = (
            list(
                await session.scalars(
                    select(EvidenceItem)
                    .where(EvidenceItem.run_id == evidence_run)
                    .order_by(EvidenceItem.local_id)
                )
            )
            if evidence_run
            else []
        )
        by_id = {e.id: e for e in evidence}
        # Human evidence from reviews lives in the record's run too; include all cited.
        cited: dict[uuid.UUID, list[str]] = defaultdict(list)
        if fields:
            for link in await session.scalars(
                select(RecordFieldEvidence).where(
                    RecordFieldEvidence.record_field_id.in_([f.id for f in fields])
                )
            ):
                item = by_id.get(link.evidence_id) or await session.get(
                    EvidenceItem, link.evidence_id
                )
                if item is not None:
                    by_id[item.id] = item
                    cited[link.record_field_id].append(item.local_id)

        hypotheses = (
            list(
                await session.scalars(
                    select(Hypothesis)
                    .where(Hypothesis.run_id == evidence_run)
                    .order_by(Hypothesis.local_id)
                )
            )
            if evidence_run
            else []
        )
        links: dict[uuid.UUID, dict[str, list[str]]] = defaultdict(
            lambda: {"supports": [], "refutes": []}
        )
        local_of = {e.id: e.local_id for e in by_id.values()}
        if hypotheses:
            for hyp_link in await session.scalars(
                select(EvidenceLink).where(
                    EvidenceLink.hypothesis_id.in_([h.id for h in hypotheses])
                )
            ):
                key = "supports" if hyp_link.relation is EvidenceRelation.SUPPORTS else "refutes"
                links[hyp_link.hypothesis_id][key].append(local_of.get(hyp_link.evidence_id, "?"))
        hyp_local = {h.id: h.local_id for h in hypotheses}
        objections = (
            list(
                await session.scalars(
                    select(Objection)
                    .where(Objection.run_id == evidence_run)
                    .order_by(Objection.created_at)
                )
            )
            if evidence_run
            else []
        )
        events = (
            list(
                await session.scalars(
                    select(RunEvent).where(RunEvent.run_id == run.id).order_by(RunEvent.seq)
                )
            )
            if run
            else []
        )
        invocations = (
            list(
                await session.scalars(
                    select(AgentInvocation)
                    .where(AgentInvocation.run_id == run.id)
                    .order_by(AgentInvocation.started_at)
                )
            )
            if run
            else []
        )
        models = sorted({i.model_id for i in invocations if i.model_id})
        definitions = {d.key: d for d in await session.scalars(select(FieldDefinition))}
        reviewers = {
            u.id: u.full_name
            for u in await session.scalars(
                select(User).where(User.id.in_([f.reviewed_by for f in fields if f.reviewed_by]))
            )
        }
        reviews = (await self._reviews(session, [record.id])).get(record.id, []) if record else []
        emitted = [
            f.field_key
            for f in fields
            if f.field_key in RANKED_FIELDS and f.decision is not FieldDecisionKind.ABSTAIN
        ]
        emitted_conf = [
            float(f.confidence)
            for f in fields
            if f.field_key in RANKED_FIELDS
            and f.confidence is not None
            and f.decision is not FieldDecisionKind.ABSTAIN
        ]
        ordered = sorted(fields, key=lambda f: definitions[f.field_key].priority_rank or 99)
        return schemas.CaseFile(
            deleted_at=asset.deleted_at,
            deletion_reason=asset.deletion_reason,
            record_id=str(record.id) if record else None,
            version=record.current_version if record else None,
            asset_id=str(asset.id),
            external_ref=asset.external_ref,
            priority=asset.priority,
            captured_at=asset.captured_at,
            camera=" ".join(p for p in (asset.exif_make, asset.exif_model) if p) or None,
            preview_url=(await self._previews(session, [asset.id])).get(asset.id),
            batch_id=str(asset.batch_id) if asset.batch_id else None,
            status_label=status_label(fields),
            qc_status=qc_status(
                run_finished=bool(run and run.status in FINISHED),
                reviews=reviews,
                emitted_fields=emitted,
            ),
            row_confidence=min(emitted_conf) if emitted_conf else None,
            run=(
                schemas.CaseRun(
                    id=run.public_id,
                    status=str(run.status),
                    stage=run.current_stage,
                    started_at=run.started_at,
                    finished_at=run.finished_at,
                    cost_usd=float(run.cost_usd),
                    models=models,
                    error=(run.error or {}).get("detail") if run.error else None,
                    queued_at=run.created_at,
                    duration_ms=(
                        duration_ms(run.started_at, run.finished_at)
                        if run.status in FINISHED
                        else None
                    ),
                    wait_ms=duration_ms(run.created_at, run.started_at),
                    stages=[
                        schemas.StageTiming(
                            stage=i.stage,
                            agent=str(i.agent_id),
                            acting_as=list(i.acting_as),
                            status=str(i.status),
                            started_at=i.started_at,
                            ended_at=i.ended_at,
                            duration_ms=duration_ms(i.started_at, i.ended_at),
                            model=i.model_id,
                            input_tokens=i.input_tokens,
                            output_tokens=i.output_tokens,
                            cost_usd=float(i.cost_usd),
                        )
                        for i in invocations
                    ],
                )
                if run
                else None
            ),
            fields=[
                schemas.CaseField(
                    key=f.field_key,
                    label=definitions[f.field_key].label_de,
                    rank=definitions[f.field_key].priority_rank,
                    decision=str(f.decision),
                    value=f.value_text,
                    typed_value=f.value,
                    confidence=_f(f.confidence),
                    raw_confidence=_f(f.raw_confidence),
                    explanation=f.explanation,
                    rationale=f.rationale,
                    abstain_reason=str(f.abstain_reason) if f.abstain_reason else None,
                    source_classes=list(f.source_classes),
                    evidence=sorted(cited.get(f.id, [])),
                    origin=str(f.origin),
                    review_action=str(f.review_action) if f.review_action else None,
                    reviewed_by=reviewers.get(f.reviewed_by) if f.reviewed_by else None,
                    reviewed_at=f.reviewed_at,
                )
                for f in ordered
            ],
            evidence=[
                schemas.EvidenceOut(
                    id=e.local_id,
                    kind=str(e.kind),
                    source_class=str(e.source_class),
                    source_class_label=SOURCE_CLASS_DE[e.source_class],
                    agent=str(e.agent_id) if e.agent_id else None,
                    model=e.model_id,
                    observation=e.observation,
                    source=e.source,
                    source_uri=e.source_uri,
                    strength=float(e.strength),
                    field=(e.implies or {}).get("field"),
                    value=(e.implies or {}).get("value"),
                )
                for e in sorted(by_id.values(), key=lambda e: e.local_id)
            ],
            hypotheses=[
                schemas.HypothesisOutSchema(
                    id=h.local_id,
                    field=h.field_key,
                    value=h.statement,
                    prior=float(h.prior),
                    posterior=_f(h.posterior),
                    status=str(h.status),
                    supporting=sorted(links[h.id]["supports"]),
                    refuting=sorted(links[h.id]["refutes"]),
                )
                for h in hypotheses
            ],
            objections=[
                schemas.ObjectionOutSchema(
                    hypothesis=hyp_local.get(o.hypothesis_id, "?"),
                    claim=o.claim,
                    severity=float(o.severity),
                    resolution=str(o.resolution),
                    model=o.model_id,
                )
                for o in objections
            ],
            events=[
                schemas.RunEventOut(
                    seq=ev.seq,
                    t_ms=ev.t_ms,
                    agent=str(ev.agent_id),
                    kind=str(ev.kind),
                    summary=ev.summary,
                    evidence=ev.evidence_local_id,
                )
                for ev in events
            ],
        )

    async def review_field(
        self,
        session: AsyncSession,
        *,
        user: User,
        record_id: uuid.UUID,
        field_key: str,
        data: schemas.FieldReviewRequest,
        if_match: int | None,
    ) -> schemas.CaseFile:
        if field_key not in RANKED_FIELDS:
            raise errors.NotFoundError("Only the five ranked fields are reviewed here.")
        record = await session.get(CatalogueRecord, record_id)
        if record is None:
            raise errors.NotFoundError("No such record.")
        owner = await session.get(Asset, record.asset_id)
        if owner is not None and owner.deleted_at is not None:
            raise errors.ConflictError("This photograph has been withdrawn; restore it first.")
        if if_match is not None and if_match != record.current_version:
            raise errors.ConflictError(
                "The record changed since you opened it. Reload and review again.",
                code="version_conflict",
            )
        if data.action == "correct" and not data.value:
            raise errors.ValidationError("A correction needs the correct value.")
        head = await self._head_version(session, record)
        assert head is not None
        fields = (await self._head_fields(session, [record])).get(record.id, [])
        target = next((f for f in fields if f.field_key == field_key), None)
        if target is None:
            raise errors.NotFoundError("This field has no machine decision yet.")
        old_links = {
            f.id: list(
                await session.scalars(
                    select(RecordFieldEvidence).where(RecordFieldEvidence.record_field_id == f.id)
                )
            )
            for f in fields
        }

        now = datetime.now(UTC)
        version = RecordVersion(
            id=uuid.uuid4(),
            org_id=record.org_id,
            record_id=record.id,
            version=record.current_version + 1,
            run_id=head.run_id,
            parent_version=record.current_version,
            actor_kind=ActorKind.HUMAN,
            actor_user_id=user.id,
            change_kind={
                "accept": VersionChange.APPROVED_SNAPSHOT,
                "correct": VersionChange.EDITED,
                "reject": VersionChange.REJECTED,
            }[data.action],
            formula_weights=head.formula_weights,
            summary=(
                f"{FIELD_LABELS[field_key]}: {data.action} durch {user.full_name or user.email}"
            ),
        )
        session.add(version)
        await session.flush()

        human_evidence: EvidenceItem | None = None
        if data.action == "correct" and head.run_id is not None:
            existing = await session.scalar(
                select(func.count())
                .select_from(EvidenceItem)
                .where(EvidenceItem.run_id == head.run_id)
            )
            human_evidence = EvidenceItem(
                id=uuid.uuid4(),
                org_id=record.org_id,
                run_id=head.run_id,
                local_id=f"ev_h{(existing or 0) + 1:02d}"[:8],
                kind=EvidenceKind.HUMAN,
                source_class=SourceClass.HUMAN,
                agent_id=None,
                created_by=user.id,
                observation=f"Erfasst von {user.full_name or user.email}: «{data.value}»"
                + (f" — {data.reason}" if data.reason else ""),
                source="Archivprüfung",
                strength=Decimal("1.0"),
                implies={"field": field_key, "value": data.value},
            )
            session.add(human_evidence)
            await session.flush()

        for field in fields:
            copy = RecordField(
                id=uuid.uuid4(),
                org_id=record.org_id,
                record_version_id=version.id,
                field_key=field.field_key,
                decision=field.decision,
                abstain_reason=field.abstain_reason,
                value_text=field.value_text,
                value=field.value,
                value_uri=field.value_uri,
                confidence=field.confidence,
                raw_confidence=field.raw_confidence,
                source_classes=list(field.source_classes),
                corroborating_count=field.corroborating_count,
                objection_count=field.objection_count,
                explanation=field.explanation,
                rationale=field.rationale,
                generated_by=field.generated_by,
                agent_id=field.agent_id,
                models=list(field.models),
                method=field.method,
                origin=FieldOrigin.CARRIED,
                reviewed_by=field.reviewed_by,
                review_action=field.review_action,
                reviewed_at=field.reviewed_at,
                overrode_confidence=field.overrode_confidence,
            )
            links = old_links[field.id]
            if field.id == target.id:
                copy.reviewed_by = user.id
                copy.reviewed_at = now
                if data.action == "accept":
                    copy.review_action = ReviewAction.ACCEPTED_UNCHANGED
                elif data.action == "correct":
                    scored = score([Support(SourceClass.HUMAN, HUMAN_STRENGTH)])
                    copy.review_action = (
                        ReviewAction.FILLED
                        if field.decision is FieldDecisionKind.ABSTAIN
                        else ReviewAction.EDITED
                    )
                    copy.origin = FieldOrigin.HUMAN
                    copy.decision = scored.decision
                    copy.abstain_reason = None
                    copy.value_text = data.value
                    copy.value = {"name": data.value}
                    copy.confidence = Decimal(str(scored.raw))
                    copy.raw_confidence = Decimal(str(scored.raw))
                    copy.source_classes = [SourceClass.HUMAN.value]
                    copy.corroborating_count = 1
                    copy.objection_count = 0
                    copy.explanation = f"Von {user.full_name or 'Archiv'} erfasst · " + (
                        scored.explanation
                    )
                    copy.overrode_confidence = field.confidence
                    links = []
                else:  # reject
                    copy.review_action = ReviewAction.REJECTED
                    copy.origin = FieldOrigin.HUMAN
                    copy.decision = FieldDecisionKind.ABSTAIN
                    copy.abstain_reason = AbstainReason.CONFLICTING_EVIDENCE
                    copy.value_text = None
                    copy.value = None
                    copy.confidence = None
                    copy.explanation = "Vom Archiv verworfen · bewusst leer gelassen"
                    copy.overrode_confidence = field.confidence
                    links = []
            session.add(copy)
            await session.flush()
            for link in links:
                session.add(
                    RecordFieldEvidence(
                        record_field_id=copy.id,
                        evidence_id=link.evidence_id,
                        org_id=record.org_id,
                        role=link.role,
                    )
                )
            if field.id == target.id and human_evidence is not None:
                session.add(
                    RecordFieldEvidence(
                        record_field_id=copy.id,
                        evidence_id=human_evidence.id,
                        org_id=record.org_id,
                    )
                )

        session.add(
            FieldReview(
                org_id=record.org_id,
                record_id=record.id,
                from_version=record.current_version,
                to_version=version.version,
                field_key=field_key,
                action={
                    "accept": ReviewAction.ACCEPTED_UNCHANGED,
                    "correct": (
                        ReviewAction.FILLED
                        if target.decision is FieldDecisionKind.ABSTAIN
                        else ReviewAction.EDITED
                    ),
                    "reject": ReviewAction.REJECTED,
                }[data.action],
                from_value_text=target.value_text,
                to_value_text=data.value
                if data.action == "correct"
                else (target.value_text if data.action == "accept" else None),
                overrode_confidence=target.confidence if data.action != "accept" else None,
                reason=data.reason,
                user_id=user.id,
            )
        )
        session.add(
            AuditLog(
                org_id=record.org_id,
                actor_user_id=user.id,
                action=AuditAction.RECORD_FIELD_REVIEWED,
                target_type="catalogue_record",
                target_id=str(record.id),
                details={"field": field_key, "action": data.action, "version": version.version},
            )
        )
        record.current_version = version.version
        await session.flush()
        return await self.case_file(session, record.asset_id)

    # --- batch management (batch-management note) ---------------------------------

    async def bulk(
        self,
        session: AsyncSession,
        *,
        user: User,
        action: str,
        asset_ids: list[uuid.UUID],
        reason: str | None = None,
    ) -> schemas.BulkResult:
        """Apply one action to many photographs; each succeeds or says why not."""
        handler = {
            "delete": self._withdraw_one,
            "restore": self._restore_one,
            "rerun": self._rerun_one,
            "accept": self._accept_one,
        }[action]
        results: list[schemas.BulkItem] = []
        for asset_id in dict.fromkeys(asset_ids):  # de-duplicated, order kept
            asset = await session.get(Asset, asset_id)
            if asset is None:
                results.append(
                    schemas.BulkItem(asset_id=str(asset_id), ok=False, detail="not_found")
                )
                continue
            detail = await handler(session, user=user, asset=asset, reason=reason)
            results.append(
                schemas.BulkItem(asset_id=str(asset_id), ok=detail is None, detail=detail)
            )
        await session.flush()
        if action in {"delete", "restore"}:
            session.add(
                AuditLog(
                    org_id=user.org_id,
                    actor_user_id=user.id,
                    action=(
                        AuditAction.ASSET_WITHDRAWN
                        if action == "delete"
                        else AuditAction.ASSET_RESTORED
                    ),
                    target_type="asset",
                    details={
                        "assets": [r.asset_id for r in results if r.ok],
                        "reason": reason,
                    },
                )
            )
        elif action == "accept":
            session.add(
                AuditLog(
                    org_id=user.org_id,
                    actor_user_id=user.id,
                    action=AuditAction.RECORD_BULK_ACCEPTED,
                    target_type="asset",
                    details={"assets": [r.asset_id for r in results if r.ok]},
                )
            )
        await session.flush()
        return schemas.BulkResult(
            action=action,  # type: ignore[arg-type]
            requested=len(results),
            succeeded=sum(1 for r in results if r.ok),
            results=results,
        )

    async def _withdraw_one(
        self,
        session: AsyncSession,
        *,
        user: User,
        asset: Asset,
        reason: str | None,
        at: datetime | None = None,
    ) -> str | None:
        if asset.deleted_at is not None:
            return "already_withdrawn"
        # `at`: a batch withdrawal stamps its photos with its own time, which is
        # how restoring the batch knows which photos it took with it.
        asset.deleted_at = at or datetime.now(UTC)
        asset.deleted_by = user.id
        asset.deletion_reason = reason
        latest = await self._latest_run(session, asset.id)
        if latest is not None and latest.status in {RunStatus.QUEUED, RunStatus.RUNNING}:
            # The worker checks this at every stage boundary and stops.
            latest.status = RunStatus.CANCELLED
            latest.finished_at = datetime.now(UTC)
            latest.error = {"stage": latest.current_stage, "detail": "withdrawn"}
        return None

    async def _restore_one(
        self, session: AsyncSession, *, user: User, asset: Asset, reason: str | None
    ) -> str | None:
        if asset.deleted_at is None:
            return "not_withdrawn"
        asset.deleted_at = None
        asset.deleted_by = None
        asset.deletion_reason = None
        latest = await self._latest_run(session, asset.id)
        if latest is not None and latest.status is RunStatus.CANCELLED:
            session.add(
                Run(
                    id=uuid.uuid4(),
                    org_id=asset.org_id,
                    public_id=new_public_id("run"),
                    asset_id=asset.id,
                    batch_id=asset.batch_id,
                    kind="rerun",
                    parent_run_id=latest.id,
                    triggered_by=user.id,
                )
            )
        return None

    async def _rerun_one(
        self, session: AsyncSession, *, user: User, asset: Asset, reason: str | None
    ) -> str | None:
        if asset.deleted_at is not None:
            return "withdrawn"
        latest = await self._latest_run(session, asset.id)
        if latest is not None and latest.status in {RunStatus.QUEUED, RunStatus.RUNNING}:
            return "running"
        if asset.status in {AssetStatus.QUEUED, AssetStatus.UPLOADING}:
            return "not_uploaded"
        await self.rerun(session, user=user, asset_id=asset.id)
        return None

    async def _accept_one(
        self, session: AsyncSession, *, user: User, asset: Asset, reason: str | None
    ) -> str | None:
        """Accept every emitted ranked field no human has reviewed yet, in one version."""
        if asset.deleted_at is not None:
            return "withdrawn"
        record = await session.scalar(
            select(CatalogueRecord).where(CatalogueRecord.asset_id == asset.id)
        )
        if record is None:
            return "no_record"
        head = await self._head_version(session, record)
        fields = (await self._head_fields(session, [record])).get(record.id, [])
        targets = {
            f.id
            for f in fields
            if f.field_key in RANKED_FIELDS
            and f.decision is not FieldDecisionKind.ABSTAIN
            and f.reviewed_by is None
        }
        if head is None or not targets:
            return "nothing_to_accept"
        now = datetime.now(UTC)
        version = RecordVersion(
            id=uuid.uuid4(),
            org_id=record.org_id,
            record_id=record.id,
            version=record.current_version + 1,
            run_id=head.run_id,
            parent_version=record.current_version,
            actor_kind=ActorKind.HUMAN,
            actor_user_id=user.id,
            change_kind=VersionChange.APPROVED_SNAPSHOT,
            formula_weights=head.formula_weights,
            summary=f"{len(targets)} Felder übernommen durch {user.full_name or user.email}",
        )
        session.add(version)
        await session.flush()
        for field in fields:
            links = list(
                await session.scalars(
                    select(RecordFieldEvidence).where(
                        RecordFieldEvidence.record_field_id == field.id
                    )
                )
            )
            copy = _carry(field, version.id)
            if field.id in targets:
                copy.reviewed_by = user.id
                copy.reviewed_at = now
                copy.review_action = ReviewAction.ACCEPTED_UNCHANGED
                session.add(
                    FieldReview(
                        org_id=record.org_id,
                        record_id=record.id,
                        from_version=record.current_version,
                        to_version=version.version,
                        field_key=field.field_key,
                        action=ReviewAction.ACCEPTED_UNCHANGED,
                        from_value_text=field.value_text,
                        to_value_text=field.value_text,
                        user_id=user.id,
                    )
                )
            session.add(copy)
            await session.flush()
            for link in links:
                session.add(
                    RecordFieldEvidence(
                        record_field_id=copy.id,
                        evidence_id=link.evidence_id,
                        org_id=record.org_id,
                        role=link.role,
                    )
                )
        record.current_version = version.version
        return None

    async def withdraw_batch(
        self, session: AsyncSession, *, user: User, batch_id: uuid.UUID, reason: str | None
    ) -> schemas.BatchWithdrawResult:
        batch = await self._batch(session, batch_id)
        assets = list(
            await session.scalars(
                select(Asset).where(Asset.batch_id == batch.id, Asset.deleted_at.is_(None))
            )
        )
        when = datetime.now(UTC)
        for asset in assets:
            await self._withdraw_one(session, user=user, asset=asset, reason=reason, at=when)
        batch.deleted_at = when
        batch.deleted_by = user.id
        session.add(
            AuditLog(
                org_id=user.org_id,
                actor_user_id=user.id,
                action=AuditAction.BATCH_WITHDRAWN,
                target_type="upload_batch",
                target_id=str(batch.id),
                details={"assets": len(assets), "reason": reason},
            )
        )
        await session.flush()
        return schemas.BatchWithdrawResult(
            batch_id=str(batch.id), deleted_at=batch.deleted_at, assets=len(assets)
        )

    async def restore_batch(
        self, session: AsyncSession, *, user: User, batch_id: uuid.UUID
    ) -> schemas.BatchWithdrawResult:
        batch = await self._batch(session, batch_id)
        if batch.deleted_at is None:
            raise errors.ConflictError("This batch is not withdrawn.")
        withdrawn_at = batch.deleted_at
        # Only the photos the batch withdrawal took with it; a photo withdrawn
        # on its own before stays withdrawn.
        assets = list(
            await session.scalars(
                select(Asset).where(Asset.batch_id == batch.id, Asset.deleted_at >= withdrawn_at)
            )
        )
        for asset in assets:
            await self._restore_one(session, user=user, asset=asset, reason=None)
        batch.deleted_at = None
        batch.deleted_by = None
        session.add(
            AuditLog(
                org_id=user.org_id,
                actor_user_id=user.id,
                action=AuditAction.BATCH_RESTORED,
                target_type="upload_batch",
                target_id=str(batch.id),
                details={"assets": len(assets)},
            )
        )
        await session.flush()
        return schemas.BatchWithdrawResult(batch_id=str(batch.id), assets=len(assets))

    async def purge_failed_runs(
        self, session: AsyncSession, *, user: User, batch_id: uuid.UUID | None
    ) -> schemas.PurgeResult:
        """Remove this archive's failed runs for good (migration 0006).

        Only runs whose status is `failed` and that no record version cites; their
        partial ledger goes with them. On Postgres the database function decides
        what qualifies, so no code path can widen it. On SQLite (the unit suite)
        the same selection runs through the ORM.
        """
        if batch_id is not None:
            await self._batch(session, batch_id)
        connection = await session.connection()
        if connection.dialect.name == "postgresql":
            removed = list(
                (
                    await session.execute(
                        text("SELECT purge_failed_runs(CAST(:batch AS uuid))"),
                        {"batch": str(batch_id) if batch_id else None},
                    )
                ).scalars()
            )
        else:
            cited = select(RecordVersion.run_id).where(RecordVersion.run_id.is_not(None))
            query = select(Run).where(Run.status == RunStatus.FAILED, Run.id.not_in(cited))
            if batch_id is not None:
                query = query.where(Run.batch_id == batch_id)
            runs = list(await session.scalars(query))
            removed = [run.id for run in runs]
            for run in runs:
                await session.delete(run)
        session.add(
            AuditLog(
                org_id=user.org_id,
                actor_user_id=user.id,
                action=AuditAction.RUNS_PURGED,
                target_type="upload_batch" if batch_id else "organization",
                target_id=str(batch_id or user.org_id),
                details={"runs": len(removed), "run_ids": [str(r) for r in removed[:500]]},
            )
        )
        await session.flush()
        return schemas.PurgeResult(
            purged=len(removed), batch_id=str(batch_id) if batch_id else None
        )

    # --- archive views (History, Collections, Public assist) ------------------------

    async def history(
        self, session: AsyncSession, *, limit: int = 200
    ) -> list[schemas.HistoryEntry]:
        """Who investigated, reviewed or corrected which photo, and when.

        Archive work only: sign-ins, addresses and IPs stay in the audit log and are
        never shown here. Machine investigations come from `runs`; human actions from
        `audit_log`. Newest first.
        """
        audits = list(
            await session.scalars(
                select(AuditLog)
                .where(AuditLog.action.in_([a.value for a in WORK_ACTIONS]))
                .order_by(AuditLog.created_at.desc())
                .limit(limit)
            )
        )
        runs = list(
            await session.scalars(
                select(Run)
                .where(Run.finished_at.is_not(None))
                .order_by(Run.finished_at.desc())
                .limit(limit)
            )
        )
        record_ids = {
            uuid.UUID(a.target_id)
            for a in audits
            if a.target_type == "catalogue_record" and a.target_id and _is_uuid(a.target_id)
        }
        record_asset = (
            {
                r.id: r.asset_id
                for r in await session.scalars(
                    select(CatalogueRecord).where(CatalogueRecord.id.in_(record_ids))
                )
            }
            if record_ids
            else {}
        )
        asset_ids = (
            {r.asset_id for r in runs}
            | set(record_asset.values())
            | {
                uuid.UUID(a.target_id)
                for a in audits
                if a.target_type == "asset" and a.target_id and _is_uuid(a.target_id)
            }
        )
        assets = (
            {a.id: a for a in await session.scalars(select(Asset).where(Asset.id.in_(asset_ids)))}
            if asset_ids
            else {}
        )
        batch_ids = {a.batch_id for a in assets.values() if a.batch_id} | {
            uuid.UUID(a.target_id)
            for a in audits
            if a.target_type == "upload_batch" and a.target_id and _is_uuid(a.target_id)
        }
        batches = (
            {
                b.id: b
                for b in await session.scalars(
                    select(UploadBatch).where(UploadBatch.id.in_(batch_ids))
                )
            }
            if batch_ids
            else {}
        )
        actors = {a.actor_user_id for a in audits if a.actor_user_id}
        names = (
            {
                u.id: (u.full_name or "").strip() or None
                for u in await session.scalars(select(User).where(User.id.in_(actors)))
            }
            if actors
            else {}
        )

        def place(asset_id: uuid.UUID | None) -> dict[str, Any]:
            asset = assets.get(asset_id) if asset_id else None
            batch = batches.get(asset.batch_id) if asset and asset.batch_id else None
            return {
                "asset_id": str(asset.id) if asset else None,
                "photo": asset.external_ref if asset else None,
                "batch_id": str(batch.id) if batch else None,
                "batch": (batch.label or None) if batch else None,
            }

        entries: list[schemas.HistoryEntry] = []
        for run in runs:
            assert run.finished_at is not None
            entries.append(
                schemas.HistoryEntry(
                    at=run.finished_at,
                    actor="ZEITZEUGE",
                    actor_kind="machine",
                    action="run.finished",
                    detail=run.status.value,
                    **place(run.asset_id),
                )
            )
        for audit in audits:
            details = audit.details or {}
            target_asset: uuid.UUID | None = None
            if audit.target_type == "asset" and audit.target_id and _is_uuid(audit.target_id):
                target_asset = uuid.UUID(audit.target_id)
            elif (
                audit.target_type == "catalogue_record"
                and audit.target_id
                and _is_uuid(audit.target_id)
            ):
                target_asset = record_asset.get(uuid.UUID(audit.target_id))
            located = place(target_asset)
            if (
                audit.target_type == "upload_batch"
                and audit.target_id
                and _is_uuid(audit.target_id)
            ):
                batch = batches.get(uuid.UUID(audit.target_id))
                located.update(
                    batch_id=audit.target_id, batch=(batch.label or None) if batch else None
                )
            many = details.get("assets") if isinstance(details.get("assets"), list) else None
            entries.append(
                schemas.HistoryEntry(
                    at=audit.created_at,
                    actor=names.get(audit.actor_user_id) or "—" if audit.actor_user_id else "—",
                    actor_kind="human",
                    action=audit.action,
                    field=details.get("field"),
                    detail=details.get("action") or details.get("reason"),
                    count=len(many) if many is not None else details.get("runs"),
                    **located,
                )
            )
        entries.sort(key=lambda e: e.at, reverse=True)
        return entries[:limit]

    async def collections(self, session: AsyncSession) -> list[schemas.CollectionOut]:
        """Each fonds with how far it has been described, from the records themselves."""
        live = Asset.deleted_at.is_(None)
        out: list[schemas.CollectionOut] = []
        for fonds in await session.scalars(select(Fonds).order_by(Fonds.reference_code)):
            in_fonds = (Asset.fonds_id == fonds.id) & live
            photos = await session.scalar(select(func.count()).select_from(Asset).where(in_fonds))
            batches = await session.scalar(
                select(func.count(func.distinct(Asset.batch_id))).where(in_fonds)
            )
            investigated = await session.scalar(
                select(func.count(func.distinct(CatalogueRecord.asset_id)))
                .join(Asset, Asset.id == CatalogueRecord.asset_id)
                .where(in_fonds)
            )
            described = await session.scalar(
                select(func.count(func.distinct(CatalogueRecord.id)))
                .join(Asset, Asset.id == CatalogueRecord.asset_id)
                .join(
                    RecordVersion,
                    (RecordVersion.record_id == CatalogueRecord.id)
                    & (RecordVersion.version == CatalogueRecord.current_version),
                )
                .join(RecordField, RecordField.record_version_id == RecordVersion.id)
                .where(
                    in_fonds,
                    RecordField.field_key.in_(RANKED_FIELD_KEYS),
                    RecordField.decision != FieldDecisionKind.ABSTAIN,
                )
            )
            reviewed = await session.scalar(
                select(func.count(func.distinct(FieldReview.record_id)))
                .join(CatalogueRecord, CatalogueRecord.id == FieldReview.record_id)
                .join(Asset, Asset.id == CatalogueRecord.asset_id)
                .where(in_fonds)
            )
            out.append(
                schemas.CollectionOut(
                    id=str(fonds.id),
                    reference_code=fonds.reference_code,
                    title=fonds.title,
                    scope_note=fonds.scope_note,
                    photos=photos or 0,
                    batches=batches or 0,
                    investigated=investigated or 0,
                    described=described or 0,
                    reviewed=reviewed or 0,
                )
            )
        return out

    async def open_questions(
        self, session: AsyncSession, *, limit: int = 120
    ) -> list[schemas.OpenQuestion]:
        """Photos the system could not fully place: where knowledgeable people can help.

        A photo is listed when its record is flagged `public_assist`, or its current
        version leaves Ortschaft, Gemeinde or Gebäude open. Most open first.
        """
        core = ("locality", "municipality", "building")
        rows = (
            await session.execute(
                select(CatalogueRecord, Asset, RecordField)
                .join(Asset, Asset.id == CatalogueRecord.asset_id)
                .join(
                    RecordVersion,
                    (RecordVersion.record_id == CatalogueRecord.id)
                    & (RecordVersion.version == CatalogueRecord.current_version),
                )
                .join(RecordField, RecordField.record_version_id == RecordVersion.id)
                .where(Asset.deleted_at.is_(None), RecordField.field_key.in_(RANKED_FIELD_KEYS))
            )
        ).all()
        by_asset: dict[uuid.UUID, dict[str, Any]] = {}
        for record, asset, field in rows:
            slot = by_asset.setdefault(
                asset.id, {"record": record, "asset": asset, "open": [], "known": {}}
            )
            if field.decision == FieldDecisionKind.ABSTAIN:
                slot["open"].append(field.field_key)
            elif field.value_text:
                slot["known"][field.field_key] = field.value_text
        wanted = [
            s
            for s in by_asset.values()
            if s["record"].public_assist or any(k in s["open"] for k in core)
        ]
        wanted.sort(key=lambda s: (-len(s["open"]), s["asset"].external_ref))
        wanted = wanted[:limit]
        previews = await self._previews(session, [s["asset"].id for s in wanted])
        batch_ids = {s["asset"].batch_id for s in wanted if s["asset"].batch_id}
        batches = (
            {
                b.id: b
                for b in await session.scalars(
                    select(UploadBatch).where(UploadBatch.id.in_(batch_ids))
                )
            }
            if batch_ids
            else {}
        )
        order = {key: i for i, key in enumerate(RANKED_FIELD_KEYS)}
        return [
            schemas.OpenQuestion(
                asset_id=str(s["asset"].id),
                photo=s["asset"].external_ref,
                batch_id=str(s["asset"].batch_id) if s["asset"].batch_id else None,
                batch=(batches[s["asset"].batch_id].label or None)
                if s["asset"].batch_id in batches
                else None,
                preview_url=previews.get(s["asset"].id),
                captured_at=s["asset"].captured_at,
                open_fields=sorted(s["open"], key=lambda k: order.get(k, 9)),
                known=s["known"],
            )
            for s in wanted
        ]

    # --- export and QC ------------------------------------------------------------

    async def export_xlsx(
        self,
        session: AsyncSession,
        *,
        user: User,
        batch_id: uuid.UUID,
        asset_ids: list[uuid.UUID] | None = None,
    ) -> tuple[bytes, str]:
        batch = await self._batch(session, batch_id)
        generated_at = datetime.now(UTC)
        workbook = await build_workbook(
            session, batch.id, generated_at=generated_at, asset_ids=asset_ids
        )
        digest = hashlib.sha256(workbook).hexdigest()
        export = Export(
            id=uuid.uuid4(),
            org_id=batch.org_id,
            format=ExportFormat.XLSX,
            scope=ExportScope.BATCH,
            batch_id=batch.id,
            includes_unapproved=True,
            sha256=digest,
            created_by=user.id,
        )
        session.add(export)
        await session.flush()
        records = list(
            await session.scalars(
                select(CatalogueRecord)
                .join(Asset, Asset.id == CatalogueRecord.asset_id)
                .where(Asset.batch_id == batch.id)
            )
        )
        for record in records:
            session.add(
                ExportItem(
                    export_id=export.id,
                    record_id=record.id,
                    org_id=batch.org_id,
                    version=record.current_version,
                )
            )
        export.record_count = len(records)
        session.add(
            AuditLog(
                org_id=batch.org_id,
                actor_user_id=user.id,
                action=AuditAction.BATCH_EXPORTED,
                target_type="upload_batch",
                target_id=str(batch.id),
                details={"export_id": str(export.id), "sha256": digest},
            )
        )
        await session.flush()
        label = batch.label or "batch"
        return workbook, f"ZEITZEUGE_{label}_{generated_at:%Y-%m-%d_%H%M}.xlsx"

    async def qc(self, session: AsyncSession, batch_id: uuid.UUID) -> dict[str, Any]:
        batch = await self._batch(session, batch_id)
        return await qc_summary(session, batch.id)

    # --- helpers ------------------------------------------------------------------

    async def _fonds(self, session: AsyncSession, org_id: uuid.UUID, slug: str) -> Fonds:
        fonds = await session.scalar(select(Fonds).where(Fonds.slug == slug))
        if fonds is not None:
            return fonds
        if slug != "foto21":
            raise errors.NotFoundError(f"No fonds «{slug}» in this archive.")
        organization = await session.get(Organization, org_id)
        prefix = (organization.slug if organization else "org").upper()
        fonds = Fonds(
            id=uuid.uuid4(),
            org_id=org_id,
            slug="foto21",
            reference_code=f"{prefix} Foto/21Jh",
            title="Fotobestand 21. Jh. (unerschlossen)",
            level=DescriptionLevel.FONDS,
            extent=600,
            extent_unit=ExtentUnit.PHOTOGRAPHS,
            finding_aid_from=2000,
            finding_aid_to=2026,
            digitised=True,
        )
        session.add(fonds)
        await session.flush()
        return fonds

    async def _demo_guard(
        self, session: AsyncSession, org_id: uuid.UUID, *, new_photos: int = 0, new_runs: int = 0
    ) -> None:
        """What a visitor may spend in a demo archive («Start demo», one per visitor).

        Own uploads (not the mirrored Prio-1 copy) are capped at `DEMO_UPLOAD_CAP`,
        and at most `DEMO_ACTIVE_RUNS` investigations may be queued or running at
        once, which bounds re-runs of the mirrored photos too. Real archives are
        never limited here.
        """
        org = await session.get(Organization, org_id)
        if org is None or not (org.settings or {}).get("sandbox"):
            return
        if new_photos:
            own = await session.scalar(
                select(func.count())
                .select_from(Asset)
                .join(UploadBatch, UploadBatch.id == Asset.batch_id)
                .where(
                    # Withdrawn photos count too: deleting must not buy more runs.
                    Asset.org_id == org_id,
                    UploadBatch.mirrored_from_id.is_(None),
                )
            )
            if (own or 0) + new_photos > DEMO_UPLOAD_CAP:
                raise errors.DemoLimitError(
                    f"A demo archive takes up to {DEMO_UPLOAD_CAP} photos of your own.",
                    extra={"limit": DEMO_UPLOAD_CAP, "kind": "photos"},
                )
        if new_runs:
            active = await session.scalar(
                select(func.count())
                .select_from(Run)
                .where(Run.org_id == org_id, Run.status.in_([RunStatus.QUEUED, RunStatus.RUNNING]))
            )
            if (active or 0) + new_runs > DEMO_ACTIVE_RUNS:
                raise errors.DemoLimitError(
                    f"A demo archive runs up to {DEMO_ACTIVE_RUNS} investigations at once; "
                    "wait for one to finish.",
                    extra={"limit": DEMO_ACTIVE_RUNS, "kind": "runs"},
                )

    async def _batch(self, session: AsyncSession, batch_id: uuid.UUID) -> UploadBatch:
        batch = await session.get(UploadBatch, batch_id)
        if batch is None:
            raise errors.NotFoundError("No such batch.")
        return batch

    async def _master(self, session: AsyncSession, asset_id: uuid.UUID) -> AssetFile:
        master = await session.scalar(
            select(AssetFile).where(
                AssetFile.asset_id == asset_id,
                AssetFile.side == AssetSide.RECTO,
                AssetFile.role == FileRole.MASTER,
            )
        )
        if master is None:
            raise errors.NotFoundError("This photograph has no master file.")
        return master

    async def _latest_run(self, session: AsyncSession, asset_id: uuid.UUID) -> Run | None:
        return await session.scalar(
            select(Run).where(Run.asset_id == asset_id).order_by(Run.created_at.desc()).limit(1)
        )

    async def _head_version(
        self, session: AsyncSession, record: CatalogueRecord | None
    ) -> RecordVersion | None:
        if record is None:
            return None
        return await session.scalar(
            select(RecordVersion).where(
                RecordVersion.record_id == record.id,
                RecordVersion.version == record.current_version,
            )
        )

    async def _head_fields(
        self, session: AsyncSession, records: list[CatalogueRecord | None]
    ) -> dict[uuid.UUID, list[RecordField]]:
        present = [r for r in records if r is not None]
        if not present:
            return {}
        heads = {
            v.id: v.record_id
            for v in await session.scalars(
                select(RecordVersion).where(
                    RecordVersion.record_id.in_([r.id for r in present]),
                )
            )
            if v.version == next(r.current_version for r in present if r.id == v.record_id)
        }
        out: dict[uuid.UUID, list[RecordField]] = defaultdict(list)
        if heads:
            for field in await session.scalars(
                select(RecordField).where(RecordField.record_version_id.in_(list(heads)))
            ):
                out[heads[field.record_version_id]].append(field)
        return out

    async def _previews(
        self, session: AsyncSession, asset_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        """Signed GETs on the access copies (never the masters, data-model §13.1)."""
        out: dict[uuid.UUID, str] = {}
        if not asset_ids:
            return out
        for row in await session.scalars(
            select(AssetFile).where(
                AssetFile.asset_id.in_(asset_ids),
                AssetFile.side == AssetSide.RECTO,
                AssetFile.role == FileRole.ACCESS,
            )
        ):
            url = self._originals.view_url(row.s3_key, bucket=row.bucket)
            if url:
                out[row.asset_id] = url
        return out

    async def _reviews(
        self, session: AsyncSession, record_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[FieldReview]]:
        out: dict[uuid.UUID, list[FieldReview]] = defaultdict(list)
        if record_ids:
            for review in await session.scalars(
                select(FieldReview)
                .where(FieldReview.record_id.in_(record_ids))
                .order_by(FieldReview.created_at)
            ):
                out[review.record_id].append(review)
        return out


DEMO_UPLOAD_CAP = 10
"""Photos of their own a visitor may add to a demo archive."""
DEMO_ACTIVE_RUNS = 5
"""Investigations queued or running at once in a demo archive."""

WORK_ACTIONS = frozenset(
    {
        AuditAction.BATCH_CREATED,
        AuditAction.ASSET_UPLOADED,
        AuditAction.RECORD_FIELD_REVIEWED,
        AuditAction.RECORD_BULK_ACCEPTED,
        AuditAction.ASSET_WITHDRAWN,
        AuditAction.ASSET_RESTORED,
        AuditAction.BATCH_WITHDRAWN,
        AuditAction.BATCH_RESTORED,
        AuditAction.BATCH_EXPORTED,
        AuditAction.BATCH_MIRRORED,
        AuditAction.RUNS_PURGED,
    }
)
"""Archive work shown on the History page; identity events (sign-ins) are not."""


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def _carry(field: RecordField, version_id: uuid.UUID) -> RecordField:
    """The same field in a new version, unchanged (`origin = carried`)."""
    return RecordField(
        id=uuid.uuid4(),
        org_id=field.org_id,
        record_version_id=version_id,
        field_key=field.field_key,
        decision=field.decision,
        abstain_reason=field.abstain_reason,
        value_text=field.value_text,
        value=field.value,
        value_uri=field.value_uri,
        confidence=field.confidence,
        raw_confidence=field.raw_confidence,
        source_classes=list(field.source_classes),
        corroborating_count=field.corroborating_count,
        objection_count=field.objection_count,
        explanation=field.explanation,
        rationale=field.rationale,
        generated_by=field.generated_by,
        agent_id=field.agent_id,
        models=list(field.models),
        method=field.method,
        origin=FieldOrigin.CARRIED,
        reviewed_by=field.reviewed_by,
        review_action=field.review_action,
        reviewed_at=field.reviewed_at,
        overrode_confidence=field.overrode_confidence,
    )


def _f(value: Decimal | float | None) -> float | None:
    return None if value is None else float(value)


__all__ = ["AgentId", "InvestigationService", "natural_key", "status_label"]
