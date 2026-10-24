"""Isolation and integrity of the investigation tables, proved in Postgres.

The identity suite (`test_rls.py`) proves one archive cannot see another's
people. This one proves the same for photographs, runs and the ledger, and
pins down the three database-level rules the investigation relies on:

* the worker's `app.role = 'worker'` sees `runs` across tenants — and nothing
  else (design note D2);
* the Evidence Ledger is append-only for the application;
* an emitted field that cites no evidence cannot be committed (I-1).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from tests.test_rls import pg  # noqa: F401  (fixture)

from zeitzeuge_api.db.models import (
    Asset,
    CatalogueRecord,
    EvidenceItem,
    FieldDefinition,
    Fonds,
    Organization,
    OrganizationKind,
    RecordField,
    RecordFieldEvidence,
    RecordVersion,
    Run,
)
from zeitzeuge_api.db.models.enums import (
    ActorKind,
    DescriptionLevel,
    EvidenceKind,
    ExtentUnit,
    FieldDecisionKind,
    SourceClass,
    VersionChange,
)
from zeitzeuge_api.db.session import Database, TenantContext

pytestmark = pytest.mark.integration


async def _archive(database: Database, slug: str) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """An archive with one fonds, one asset and one queued run."""
    async with database.session(TenantContext.bootstrap()) as session:
        org = Organization(slug=slug, name=f"Archiv {slug}", kind=OrganizationKind.ARCHIVE)
        session.add(org)
        await session.flush()
        org_id = org.id

    async with database.session(TenantContext(org_id=org_id, role="admin")) as session:
        fonds = Fonds(
            org_id=org_id,
            slug="foto21",
            reference_code=f"{slug}/foto21",
            title="Fotobestand 21. Jh. (unerschlossen)",
            level=DescriptionLevel.FONDS,
            extent_unit=ExtentUnit.PHOTOGRAPHS,
        )
        session.add(fonds)
        await session.flush()
        asset = Asset(org_id=org_id, fonds_id=fonds.id, external_ref="SG.CIV.17.3.jpg", priority=1)
        session.add(asset)
        await session.flush()
        run = Run(org_id=org_id, public_id=f"run_{slug}", asset_id=asset.id)
        session.add(run)
        await session.flush()
        return org_id, asset.id, run.id


async def test_another_archives_photos_and_runs_are_invisible(pg: Database) -> None:  # noqa: F811
    schwyz, _, _ = await _archive(pg, "schwyz")
    await _archive(pg, "zug")

    async with pg.session(TenantContext(org_id=schwyz, role="archivist")) as session:
        assets = list(await session.scalars(select(Asset)))
        runs = list(await session.scalars(select(Run)))

    assert [a.org_id for a in assets] == [schwyz]
    assert [r.public_id for r in runs] == ["run_schwyz"]


async def test_the_worker_sees_every_queued_run_but_no_photograph(pg: Database) -> None:  # noqa: F811
    await _archive(pg, "schwyz")
    await _archive(pg, "zug")

    async with pg.session(TenantContext(role="worker")) as session:
        runs = list(await session.scalars(select(Run).order_by(Run.public_id)))
        assets = list(await session.scalars(select(Asset)))

    assert [r.public_id for r in runs] == ["run_schwyz", "run_zug"]
    assert assets == []


async def test_the_ledger_cannot_be_amended(pg: Database) -> None:  # noqa: F811
    schwyz, _, run_id = await _archive(pg, "schwyz")
    tenant = TenantContext(org_id=schwyz, role="admin")

    async with pg.session(tenant) as session:
        session.add(
            EvidenceItem(
                org_id=schwyz,
                run_id=run_id,
                local_id="ev_001",
                kind=EvidenceKind.EXTERNAL,
                source_class=SourceClass.GEODATA_LAYER,
                observation="swisstopo: Schwyz",
                strength=Decimal("1.0"),
            )
        )

    async with pg.session(tenant) as session:
        updated = await session.execute(text("UPDATE evidence_items SET strength = 0.1"))
        deleted = await session.execute(text("DELETE FROM evidence_items"))
        assert updated.rowcount == 0
        assert deleted.rowcount == 0


async def _version(database: Database, org_id: uuid.UUID, asset_id: uuid.UUID, run_id: uuid.UUID):
    async with database.session(TenantContext(org_id=org_id, role="admin")) as session:
        await session.merge(
            FieldDefinition(
                key="locality", label_de="Ortschaft", priority_rank=1, value_type="place_ref"
            )
        )
        fonds_id = await session.scalar(select(Asset.fonds_id).where(Asset.id == asset_id))
        record = CatalogueRecord(org_id=org_id, asset_id=asset_id, fonds_id=fonds_id)
        session.add(record)
        await session.flush()
        version = RecordVersion(
            org_id=org_id,
            record_id=record.id,
            version=1,
            run_id=run_id,
            actor_kind=ActorKind.MACHINE,
            change_kind=VersionChange.GENERATED,
        )
        session.add(version)
        await session.flush()
        return version.id


async def test_an_emitted_field_without_evidence_is_refused(pg: Database) -> None:  # noqa: F811
    schwyz, asset_id, run_id = await _archive(pg, "schwyz")
    version_id = await _version(pg, schwyz, asset_id, run_id)

    with pytest.raises((DBAPIError, IntegrityError)) as caught:
        async with pg.session(TenantContext(org_id=schwyz, role="admin")) as session:
            session.add(
                RecordField(
                    org_id=schwyz,
                    record_version_id=version_id,
                    field_key="locality",
                    decision=FieldDecisionKind.EMIT,
                    value_text="Schwyz",
                    confidence=Decimal("0.95"),
                    raw_confidence=Decimal("0.95"),
                    source_classes=["geodata_layer"],
                    corroborating_count=1,
                    generated_by="test",
                )
            )
    assert "evidence_missing" in str(caught.value)


async def test_an_emitted_field_with_evidence_is_committed(pg: Database) -> None:  # noqa: F811
    schwyz, asset_id, run_id = await _archive(pg, "schwyz")
    version_id = await _version(pg, schwyz, asset_id, run_id)

    async with pg.session(TenantContext(org_id=schwyz, role="admin")) as session:
        evidence = EvidenceItem(
            org_id=schwyz,
            run_id=run_id,
            local_id="ev_001",
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.GEODATA_LAYER,
            observation="swisstopo: Schwyz",
            strength=Decimal("1.0"),
        )
        field = RecordField(
            org_id=schwyz,
            record_version_id=version_id,
            field_key="locality",
            decision=FieldDecisionKind.EMIT,
            value_text="Schwyz",
            confidence=Decimal("0.7"),
            raw_confidence=Decimal("0.7"),
            source_classes=["geodata_layer"],
            corroborating_count=1,
            generated_by="test",
        )
        session.add_all([evidence, field])
        await session.flush()
        session.add(
            RecordFieldEvidence(org_id=schwyz, record_field_id=field.id, evidence_id=evidence.id)
        )

    async with pg.session(TenantContext(org_id=schwyz, role="admin")) as session:
        assert [f.value_text for f in await session.scalars(select(RecordField))] == ["Schwyz"]
