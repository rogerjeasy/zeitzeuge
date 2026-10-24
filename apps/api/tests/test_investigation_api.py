"""The investigation surface end to end, without a model: upload → run → review → Excel.

The pipeline's model stages are replaced by a hand-built ledger, so this test
exercises everything after the models have spoken: the presigned upload and
its verification, the run queued on commit, the ledger writer and the
cartographer's record, the case file, a review that writes a new version, and
the workbook that comes out of it.
"""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime

import boto3
import pytest
from openpyxl import load_workbook
from sqlalchemy import select
from tests.conftest import BUCKET, REGION

from zeitzeuge_api.db.models import Asset, FieldDefinition, Run
from zeitzeuge_api.db.models.enums import AgentId, EvidenceKind, SourceClass
from zeitzeuge_api.db.session import TenantContext
from zeitzeuge_api.integrations.aws.originals import OriginalsStorage
from zeitzeuge_api.investigation.context import Asset as RunAsset
from zeitzeuge_api.investigation.context import RunContext
from zeitzeuge_api.investigation.contracts import RANKED_FIELDS
from zeitzeuge_api.investigation.ledger import LedgerWriter
from zeitzeuge_api.investigation.stages import adjudicate, hypothesise
from zeitzeuge_api.services.investigation_service import InvestigationService

DEFINITIONS = [
    ("locality", "Ortschaft", 1, "Ortschaft"),
    ("municipality", "Politische Gemeinde", 2, "Gemeinde"),
    ("building", "Gebäude", 3, "Gebaeude"),
    ("landscape_feature", "See / Fluss / Berg", 4, "See_Fluss_Berg"),
    ("street", "Strasse", 5, "Strasse"),
    ("subject_point", "Motiv (Koordinate)", None, "Motiv_LV95"),
]


@pytest.fixture
async def investigation(app):
    app.state.investigation_service = InvestigationService(
        OriginalsStorage(app.state.clients, bucket=BUCKET, derivatives_bucket=BUCKET)
    )
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        for key, label, rank, column in DEFINITIONS:
            session.add(
                FieldDefinition(
                    key=key,
                    label_de=label,
                    priority_rank=rank,
                    excel_column=column,
                    value_type="text",
                )
            )
    return app


async def _machine_run(app, run_public_id: str) -> None:
    """What the pipeline would have written for SG.CIV.17.3, minus the models."""
    db = app.state.database
    async with db.session(TenantContext(role="worker")) as session:
        run = await session.scalar(select(Run).where(Run.public_id == run_public_id))
        assert run is not None
        org_id, asset_id, batch_id, run_id = run.org_id, run.asset_id, run.batch_id, run.id
    ctx = RunContext(
        run_id=run_id,
        org_id=org_id,
        asset=RunAsset(id=asset_id, external_ref="SG.CIV.17.3.jpg", image=b"", prepared=b""),
        models=None,  # type: ignore[arg-type]
        tools=None,  # type: ignore[arg-type]
    )
    record = ctx.begin("grounding", AgentId.GEO)
    for field, value, cls, strength in [
        ("locality", "Schwyz", SourceClass.GEODATA_LAYER, 1.0),
        ("locality", "Schwyz", SourceClass.REFERENCE_IMAGE, 0.8),
        ("locality", "Schwyz", SourceClass.TEXT_IN_IMAGE, 0.8),
        ("municipality", "Schwyz", SourceClass.GEODATA_LAYER, 0.9),
        ("landscape_feature", "Grosser Mythen", SourceClass.VISUAL, 0.75),
    ]:
        ctx.ledger.add(
            kind=EvidenceKind.EXTERNAL,
            source_class=cls,
            agent_id=AgentId.GEO,
            observation=f"{value}",
            strength=strength,
            field=field,
            value=value,
            source="swisstopo",
            source_uri="https://map.geo.admin.ch/",
        )
    record.ended_at = datetime.now(UTC)
    await hypothesise.run(ctx)
    decisions, scores = {}, {}
    for field in RANKED_FIELDS:
        hyp = next((h for h in ctx.ledger.hypotheses if h.field == field), None)
        decisions[field], scores[field] = adjudicate.decide(
            ctx, field, hyp.local_id if hyp else None, list(hyp.supporting) if hyp else [], [], "t"
        )
    writer = LedgerWriter(ctx, batch_id=batch_id)
    async with db.session(TenantContext(org_id=org_id, role="pipeline")) as session:
        for stage_record in ctx.records:
            await writer.stage_done(session, stage_record)
    async with db.session(TenantContext(org_id=org_id, role="pipeline")) as session:
        asset = await session.get(Asset, asset_id)
        assert asset is not None
        fonds_id = asset.fonds_id
        await writer.produce(session, decisions, scores, subject_point=None, fonds_id=fonds_id)


async def test_upload_run_review_export(investigation, client, as_user) -> None:
    created = await client.post("/api/v1/batches", json={"label": "prio1", "priority": 1})
    assert created.status_code == 201, created.text
    batch_id = created.json()["id"]

    registered = await client.post(
        f"/api/v1/batches/{batch_id}/assets",
        json={
            "files": [
                {
                    "filename": "SG.CIV.17.3.jpg",
                    "content_type": "image/jpeg",
                    "content_length": 1234,
                }
            ]
        },
    )
    assert registered.status_code == 200, registered.text
    [file] = registered.json()["files"]
    assert file["upload"]["fields"]["key"].endswith("/recto/master.jpg")

    # The browser's POST to S3, done here directly against moto.
    boto3.client("s3", region_name=REGION).put_object(
        Bucket=BUCKET,
        Key=file["upload"]["fields"]["key"],
        Body=b"x" * 1234,
        ContentType="image/jpeg",
    )
    committed = await client.put(f"/api/v1/assets/{file['asset_id']}/commit")
    assert committed.status_code == 200, committed.text
    run_public_id = committed.json()["run_id"]
    assert run_public_id.startswith("run_")

    batch = (await client.get(f"/api/v1/batches/{batch_id}")).json()
    assert batch["counts"]["queued"] == 1
    assert batch["assets"][0]["qc_status"] == "offen"

    await _machine_run(investigation, run_public_id)

    case = (await client.get(f"/api/v1/assets/{file['asset_id']}/case")).json()
    fields = {f["key"]: f for f in case["fields"]}
    assert fields["locality"]["value"] == "Schwyz"
    assert fields["locality"]["decision"] == "emit"
    assert fields["locality"]["explanation"].startswith("3 Quellenarten bestätigen")
    assert fields["building"]["decision"] == "abstain"
    assert fields["landscape_feature"]["decision"] == "abstain"  # one model alone: 0.225
    assert case["status_label"] == "Prüfbedarf"

    reviewed = await client.patch(
        f"/api/v1/records/{case['record_id']}/fields/building",
        json={"action": "correct", "value": "Alterszentrum Acherhof"},
        headers={"If-Match": str(case["version"])},
    )
    assert reviewed.status_code == 200, reviewed.text
    after = {f["key"]: f for f in reviewed.json()["fields"]}
    assert after["building"]["value"] == "Alterszentrum Acherhof"
    assert after["building"]["origin"] == "human"
    assert after["building"]["confidence"] == pytest.approx(0.95)
    assert reviewed.json()["qc_status"] == "korrigiert"
    assert reviewed.json()["version"] == case["version"] + 1

    stale = await client.patch(
        f"/api/v1/records/{case['record_id']}/fields/street",
        json={"action": "accept"},
        headers={"If-Match": str(case["version"])},
    )
    assert stale.status_code == 409

    exported = await client.get(f"/api/v1/batches/{batch_id}/export?fmt=xlsx")
    assert exported.status_code == 200
    sheet = load_workbook(io.BytesIO(exported.content))["Ergebnisse"]
    header = [c.value for c in sheet[1]]
    row = dict(zip(header, [c.value for c in sheet[2]], strict=False))
    assert row["Dateiname"] == "SG.CIV.17.3.jpg"
    assert row["Ortschaft"] == "Schwyz"
    assert row["Gebaeude"] == "Alterszentrum Acherhof"
    assert row["QC_Status"] == "korrigiert"
    assert row["Strasse"] in (None, "")


async def test_a_reader_cannot_open_a_batch(investigation, client, as_user, app) -> None:
    from zeitzeuge_api.db.models import User
    from zeitzeuge_api.db.models.enums import UserRole

    async with app.state.database.session(TenantContext.bootstrap()) as session:
        user = await session.scalar(select(User).where(User.email == as_user["email"]))
        user.role = UserRole.GUEST
    denied = await client.post("/api/v1/batches", json={"label": "prio1"})
    assert denied.status_code == 403


async def test_another_archives_batch_is_not_found(investigation, client, as_user) -> None:
    missing = await client.get(f"/api/v1/batches/{uuid.uuid4()}")
    assert missing.status_code == 404
