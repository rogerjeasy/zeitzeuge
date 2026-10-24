"""A slow stage keeps its run alive; a run given up for lost stops writing."""


from __future__ import annotations

import asyncio
import io
from datetime import UTC, datetime, timedelta

import boto3
from PIL import Image
from sqlalchemy import select
from tests.conftest import BUCKET, REGION

from zeitzeuge_api.db.models import CatalogueRecord, Run
from zeitzeuge_api.db.models.enums import AgentId, RunStatus
from zeitzeuge_api.db.session import TenantContext
from zeitzeuge_api.investigation import pipeline
from zeitzeuge_api.investigation.contracts import RANKED_FIELDS
from zeitzeuge_api.investigation.stages import adjudicate


class TinyImages:
    async def read(self, bucket: str, key: str) -> bytes:
        out = io.BytesIO()
        Image.new("RGB", (8, 8), "white").save(out, "JPEG")
        return out.getvalue()

    async def write(self, bucket: str, key: str, data: bytes) -> None:
        return None


async def _queued_run(client) -> Run:
    batch_id = (await client.post("/api/v1/batches", json={"label": "liveness"})).json()["id"]
    [file] = (
        await client.post(
            f"/api/v1/batches/{batch_id}/assets",
            json={
                "files": [{"filename": "a.jpg", "content_type": "image/jpeg", "content_length": 5}]
            },
        )
    ).json()["files"]
    boto3.client("s3", region_name=REGION).put_object(
        Bucket=BUCKET, Key=file["upload"]["fields"]["key"], Body=b"x" * 5, ContentType="image/jpeg"
    )
    return (await client.put(f"/api/v1/assets/{file['asset_id']}/commit")).json()["run_id"]


async def _ids(app, public_id: str):
    async with app.state.database.session(TenantContext(role="worker")) as session:
        run = await session.scalar(select(Run).where(Run.public_id == public_id))
        assert run is not None
        return run.id, run.org_id


def _abstaining_stage(delay: float):
    async def stage(ctx) -> None:
        ctx.begin("adjudicate", AgentId.ADJUDICATOR)
        await asyncio.sleep(delay)
        decisions, scores = {}, {}
        for field in RANKED_FIELDS:
            decisions[field], scores[field] = adjudicate.decide(ctx, field, None, [], [], "")
        ctx.facts["decisions"], ctx.facts["scores"] = decisions, scores
        ctx.records[-1].ended_at = datetime.now(UTC)

    return stage


async def test_a_slow_stage_keeps_sending_heartbeats(investigation, client, as_user, monkeypatch):
    run_public = await _queued_run(client)
    run_id, org_id = await _ids(investigation, run_public)
    monkeypatch.setattr(pipeline, "HEARTBEAT_SECONDS", 0.05)
    monkeypatch.setattr(pipeline, "STAGES", (("adjudicate", _abstaining_stage(0.3)),))
    beats: list[datetime] = []

    async def watch() -> None:
        for _ in range(8):
            await asyncio.sleep(0.04)
            async with investigation.state.database.session(TenantContext(role="worker")) as s:
                beat = await s.scalar(select(Run.heartbeat_at).where(Run.id == run_id))
                if beat is not None:
                    beats.append(beat)

    deps = pipeline.Deps(models=None, tools=None, images=TinyImages())  # type: ignore[arg-type]
    await asyncio.gather(
        pipeline.investigate(investigation.state.database, run_id, org_id, deps), watch()
    )
    assert len(set(beats)) >= 3  # refreshed during the stage, not only around it


async def test_a_run_given_up_for_lost_does_not_write_a_result(
    investigation, client, as_user, monkeypatch
):
    run_public = await _queued_run(client)
    run_id, org_id = await _ids(investigation, run_public)

    async def reaped_mid_stage(ctx) -> None:
        await _abstaining_stage(0)(ctx)
        async with investigation.state.database.session(TenantContext(role="worker")) as s:
            run = await s.get(Run, run_id)
            run.status = RunStatus.FAILED  # what the reaper does to a stale run
            run.heartbeat_at = datetime.now(UTC) - timedelta(hours=1)

    monkeypatch.setattr(pipeline, "STAGES", (("adjudicate", reaped_mid_stage),))
    deps = pipeline.Deps(models=None, tools=None, images=TinyImages())  # type: ignore[arg-type]
    await pipeline.investigate(investigation.state.database, run_id, org_id, deps)

    async with investigation.state.database.session(
        TenantContext(org_id=org_id, role="admin")
    ) as s:
        assert await s.scalar(select(CatalogueRecord)) is None  # no second result written
