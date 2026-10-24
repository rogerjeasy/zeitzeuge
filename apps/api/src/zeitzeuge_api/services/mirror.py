"""Mirror a Staatsarchiv batch into the demo tenant (design note D9).

The 50 Prio-1 photos are processed and reviewed in the Staatsarchiv's own
tenant; the judges' guest login is read-only and lives in the demo tenant. This
copies one batch across — assets, file rows, the latest run with its whole
ledger, the record with every version, field and citation, and the reviews —
under new ids, and labels the copy with its source and time.

It never bypasses row-level security. It reads in one transaction announced
as the source tenant and writes in another announced as the demo tenant; a
copy is only ever written into an organisation flagged `is_demo`. S3 objects
are referenced, not copied: the file rows point at the same access copy.

Re-running replaces the previous mirror of the same batch, so «Spiegel
aktualisieren» after the QC pass is one click.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import DeclarativeBase

from zeitzeuge_api.core import errors
from zeitzeuge_api.db.models import (
    AgentInvocation,
    Asset,
    AssetFile,
    CatalogueRecord,
    EvidenceItem,
    EvidenceLink,
    Export,
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
)
from zeitzeuge_api.db.session import Database, TenantContext

_SKIP = {"id", "org_id", "created_at", "updated_at"}


def _row(model: type[DeclarativeBase], source: Any, **override: Any) -> Any:
    values = {c.key: getattr(source, c.key) for c in model.__table__.columns if c.key not in _SKIP}
    values.update(override)
    return model(**values)


DEMO_SLUG = "demo-staatsarchiv-schwyz"
"""The seed's demo archive (`scripts/seed_demo.py`), where the guest signs in."""
MIRROR_SOURCES = {"stasz": "CH-000015-0"}
"""Archives allowed to publish into the demo tenant. Anyone can sign up and
administer an archive of their own; only these may put rows in front of the
judges' guest login."""


async def mirror_batch(
    db: Database, *, source_org: uuid.UUID, batch_id: uuid.UUID, target_slug: str = DEMO_SLUG
) -> dict[str, Any]:
    async with db.session(TenantContext.bootstrap()) as session:
        source = await session.get(Organization, source_org)
        # Slug *and* the ISIL the seed set: sign-up cannot produce either.
        if source is None or MIRROR_SOURCES.get(source.slug) != source.isil:
            raise errors.ForbiddenError("This archive may not publish into the demo archive.")
        target = await session.scalar(select(Organization).where(Organization.slug == target_slug))
        if target is None or not target.is_demo:
            raise errors.ForbiddenError("A mirror can only be written into the demo archive.")
        target_org = target.id
    if target_org == source_org:
        raise errors.InvalidRequestError("This batch already lives in the demo archive.")

    # --- read everything under the source tenant ---------------------------------
    async with db.session(TenantContext(org_id=source_org, role="mirror")) as s:
        batch = await s.get(UploadBatch, batch_id)
        if batch is None:
            raise errors.NotFoundError("No such batch.")
        fonds = await s.get(Fonds, batch.fonds_id) if batch.fonds_id else None
        assets = list(await s.scalars(select(Asset).where(Asset.batch_id == batch.id)))
        asset_ids = [a.id for a in assets]
        files = list(await s.scalars(select(AssetFile).where(AssetFile.asset_id.in_(asset_ids))))
        runs_all = list(
            await s.scalars(select(Run).where(Run.asset_id.in_(asset_ids)).order_by(Run.created_at))
        )
        latest = {r.asset_id: r for r in runs_all}
        records = list(
            await s.scalars(select(CatalogueRecord).where(CatalogueRecord.asset_id.in_(asset_ids)))
        )
        record_ids = [r.id for r in records]
        versions = list(
            await s.scalars(select(RecordVersion).where(RecordVersion.record_id.in_(record_ids)))
        )
        run_ids = {v.run_id for v in versions if v.run_id} | {r.id for r in latest.values()}
        runs = [r for r in runs_all if r.id in run_ids]
        invocations = list(
            await s.scalars(select(AgentInvocation).where(AgentInvocation.run_id.in_(run_ids)))
        )
        events = list(await s.scalars(select(RunEvent).where(RunEvent.run_id.in_(run_ids))))
        evidence = list(
            await s.scalars(select(EvidenceItem).where(EvidenceItem.run_id.in_(run_ids)))
        )
        hypotheses = list(await s.scalars(select(Hypothesis).where(Hypothesis.run_id.in_(run_ids))))
        links = list(
            await s.scalars(
                select(EvidenceLink).where(EvidenceLink.evidence_id.in_([e.id for e in evidence]))
            )
        )
        objections = list(await s.scalars(select(Objection).where(Objection.run_id.in_(run_ids))))
        fields = list(
            await s.scalars(
                select(RecordField).where(
                    RecordField.record_version_id.in_([v.id for v in versions])
                )
            )
        )
        citations = list(
            await s.scalars(
                select(RecordFieldEvidence).where(
                    RecordFieldEvidence.record_field_id.in_([f.id for f in fields])
                )
            )
        )
        reviews = list(
            await s.scalars(select(FieldReview).where(FieldReview.record_id.in_(record_ids)))
        )
        source_label = batch.label

    # --- write under the demo tenant ---------------------------------------------
    ids: dict[uuid.UUID, uuid.UUID] = {}

    def new(old: uuid.UUID | None) -> uuid.UUID | None:
        if old is None:
            return None
        return ids.setdefault(old, uuid.uuid4())

    async with db.session(TenantContext(org_id=target_org, role="mirror")) as s:
        previous = list(
            await s.scalars(select(UploadBatch).where(UploadBatch.mirrored_from_id == batch_id))
        )
        for old_batch in previous:
            await s.execute(delete(Export).where(Export.batch_id == old_batch.id))
            await s.execute(delete(Asset).where(Asset.batch_id == old_batch.id))
            await s.delete(old_batch)
        await s.flush()

        target_fonds = await s.scalar(
            select(Fonds).where(Fonds.slug == (fonds.slug if fonds else "foto21"))
        )
        if target_fonds is None and fonds is not None:
            target_fonds = _row(Fonds, fonds, id=uuid.uuid4(), org_id=target_org)
            s.add(target_fonds)
            await s.flush()
        assert target_fonds is not None
        org = {"org_id": target_org}

        s.add(
            _row(
                UploadBatch,
                batch,
                id=new(batch.id),
                fonds_id=target_fonds.id,
                created_by=None,
                mirrored_from_id=batch.id,
                mirrored_at=datetime.now(UTC),
                **org,
            )
        )
        await s.flush()
        for a in assets:
            s.add(
                _row(
                    Asset,
                    a,
                    id=new(a.id),
                    batch_id=new(a.batch_id),
                    fonds_id=target_fonds.id,
                    created_by=None,
                    **org,
                )
            )
        await s.flush()
        for file_row in files:
            s.add(
                _row(
                    AssetFile, file_row, id=new(file_row.id), asset_id=new(file_row.asset_id), **org
                )
            )
        for r in runs:
            s.add(
                _row(
                    Run,
                    r,
                    id=new(r.id),
                    asset_id=new(r.asset_id),
                    batch_id=new(r.batch_id),
                    parent_run_id=None,
                    triggered_by=None,
                    public_id=f"{r.public_id[:29]}_m",
                    **org,
                )
            )
        await s.flush()
        for i in invocations:
            s.add(
                _row(
                    AgentInvocation,
                    i,
                    id=new(i.id),
                    run_id=new(i.run_id),
                    reused_from_id=None,
                    **org,
                )
            )
        await s.flush()
        for ev in events:
            s.add(_row(RunEvent, ev, id=uuid.uuid4(), run_id=new(ev.run_id), **org))
        for item in evidence:
            s.add(
                _row(
                    EvidenceItem,
                    item,
                    id=new(item.id),
                    run_id=new(item.run_id),
                    invocation_id=new(item.invocation_id),
                    reused_from_id=None,
                    **org,
                )
            )
        await s.flush()
        for h in hypotheses:
            s.add(
                _row(
                    Hypothesis,
                    h,
                    id=new(h.id),
                    run_id=new(h.run_id),
                    refuted_by_evidence_id=new(h.refuted_by_evidence_id),
                    **org,
                )
            )
        await s.flush()
        for link in links:
            s.add(
                _row(
                    EvidenceLink,
                    link,
                    evidence_id=new(link.evidence_id),
                    hypothesis_id=new(link.hypothesis_id),
                    **org,
                )
            )
        for o in objections:
            s.add(
                _row(
                    Objection,
                    o,
                    id=new(o.id),
                    run_id=new(o.run_id),
                    hypothesis_id=new(o.hypothesis_id),
                    evidence_id=new(o.evidence_id),
                    **org,
                )
            )
        for rec in records:
            s.add(
                _row(
                    CatalogueRecord,
                    rec,
                    id=new(rec.id),
                    asset_id=new(rec.asset_id),
                    fonds_id=target_fonds.id,
                    **org,
                )
            )
        await s.flush()
        for v in versions:
            s.add(
                _row(
                    RecordVersion,
                    v,
                    id=new(v.id),
                    record_id=new(v.record_id),
                    run_id=new(v.run_id),
                    **org,
                )
            )
        await s.flush()
        for field_row in fields:
            s.add(
                _row(
                    RecordField,
                    field_row,
                    id=new(field_row.id),
                    record_version_id=new(field_row.record_version_id),
                    **org,
                )
            )
        await s.flush()
        for c in citations:
            s.add(
                _row(
                    RecordFieldEvidence,
                    c,
                    record_field_id=new(c.record_field_id),
                    evidence_id=new(c.evidence_id),
                    **org,
                )
            )
        for rv in reviews:
            s.add(_row(FieldReview, rv, id=uuid.uuid4(), record_id=new(rv.record_id), **org))
        await s.flush()

    return {
        "source_batch": str(batch_id),
        "mirror_batch": str(ids[batch_id]),
        "label": source_label,
        "assets": len(assets),
        "records": len(records),
        "evidence": len(evidence),
    }
