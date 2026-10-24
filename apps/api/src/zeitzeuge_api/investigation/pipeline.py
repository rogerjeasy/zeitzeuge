"""One investigation, end to end: the stages of the deployed state machine, in code.

    Intake → Perception → Grounding → Reference → Resolve → Hypothesise
           → Check → Adjudicate → Produce

The order is the state machine's (`orchestration/statemachines/
investigation.asl.json`, design note D1). Each stage is a function of the
run context; between stages the ledger delta is committed in its own
transaction, so a crash loses at most one stage and the live view advances
stage by stage. A failed stage fails the run with its name and the reason; the
worker never retries a half-written ledger in place (the ledger is
append-only), it enqueues a fresh run instead.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import anyio
from sqlalchemy import select

from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.db.models import Asset, AssetFile, Run
from zeitzeuge_api.db.models.enums import AssetSide, AssetStatus, FileRole, RunStatus
from zeitzeuge_api.db.session import Database, TenantContext
from zeitzeuge_api.integrations.aws.originals import access_key
from zeitzeuge_api.investigation.context import Asset as RunAsset
from zeitzeuge_api.investigation.context import RunContext, Tools
from zeitzeuge_api.investigation.ledger import LedgerWriter
from zeitzeuge_api.investigation.models import ModelClient, prepare_image
from zeitzeuge_api.investigation.stages import (
    adjudicate,
    check,
    grounding,
    hypothesise,
    intake,
    perception,
    reference,
    resolve,
)

log = get_logger(__name__)

Stage = Callable[[RunContext], Awaitable[None]]
STAGES: tuple[tuple[str, Stage], ...] = (
    (intake.STAGE, intake.run),
    (perception.STAGE, perception.run),
    (grounding.STAGE, grounding.run),
    (reference.STAGE, reference.run),
    (resolve.STAGE, resolve.run),
    (hypothesise.STAGE, hypothesise.run),
    (check.STAGE, check.run),
    (adjudicate.STAGE, adjudicate.run),
)


class ImageStore(Protocol):
    async def read(self, bucket: str, key: str) -> bytes: ...

    async def write(self, bucket: str, key: str, data: bytes) -> None: ...


class S3ImageStore:
    def __init__(self, s3: Any) -> None:
        self._s3 = s3

    async def read(self, bucket: str, key: str) -> bytes:
        def _get() -> bytes:
            return bytes(self._s3.get_object(Bucket=bucket, Key=key)["Body"].read())

        return await anyio.to_thread.run_sync(_get)

    async def write(self, bucket: str, key: str, data: bytes) -> None:
        def _put() -> None:
            self._s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType="image/jpeg")

        await anyio.to_thread.run_sync(_put)


class LocalImageStore:
    """For the CLI and tests: bucket `local`, key = a path under `root`."""

    BUCKET = "local"

    def __init__(self, root: Path) -> None:
        self._root = root

    async def read(self, bucket: str, key: str) -> bytes:
        return await anyio.Path(self._root / key).read_bytes()

    async def write(self, bucket: str, key: str, data: bytes) -> None:
        return None  # the CLI serves no preview


@dataclass(slots=True)
class Deps:
    models: ModelClient
    tools: Tools
    images: ImageStore
    code_version: str = "dev"
    access_bucket: str = ""
    """Where the access copy goes (`derivatives`); empty = none is written."""


async def investigate(db: Database, run_id: uuid.UUID, org_id: uuid.UUID, deps: Deps) -> None:
    tenant = TenantContext(org_id=org_id, role="pipeline")
    async with db.session(tenant) as session:
        run = await session.get(Run, run_id)
        if run is None:
            raise LookupError(f"run {run_id} not visible to tenant {org_id}")
        asset = await session.get(Asset, run.asset_id)
        master = await session.scalar(
            select(AssetFile).where(
                AssetFile.asset_id == run.asset_id,
                AssetFile.side == AssetSide.RECTO,
                AssetFile.role == FileRole.MASTER,
            )
        )
        assert asset is not None
        if master is None:
            raise LookupError(f"asset {asset.id} has no recto master")
        run.status = RunStatus.RUNNING
        run.started_at = run.started_at or datetime.now(UTC)
        run.code_version = deps.code_version
        run.agents_total = 13
        asset.status = AssetStatus.ANALYSING
        bucket, key, fonds_id, batch_id = master.bucket, master.s3_key, asset.fonds_id, run.batch_id
        external_ref, asset_id = asset.external_ref, asset.id

    raw = await deps.images.read(bucket, key)
    ctx = RunContext(
        run_id=run_id,
        org_id=org_id,
        asset=RunAsset(
            id=asset_id,
            external_ref=external_ref,
            image=raw,
            prepared=await anyio.to_thread.run_sync(prepare_image, raw),
        ),
        models=deps.models,
        tools=deps.tools,
    )
    writer = LedgerWriter(ctx, batch_id=batch_id)
    access: tuple[str, str] | None = None
    if deps.access_bucket:
        try:
            key = access_key(org_id, asset_id)
            await deps.images.write(deps.access_bucket, key, ctx.asset.prepared)
            access = (deps.access_bucket, key)
        except Exception as exc:  # a missing preview must not stop the investigation
            log.warning("investigation.access_copy_failed", error=str(exc))
    async with db.session(tenant) as session:
        await _record_fixity(session, asset_id, raw)
        if access is not None:
            await _record_access_copy(session, org_id, asset_id, access, len(ctx.asset.prepared))

    for name, stage in STAGES:
        async with db.session(tenant) as session:
            if await _cancelled(session, run_id):
                log.info("investigation.cancelled", run_id=str(run_id), before=name)
                return
            await writer.stage_started(session, name)
        try:
            await stage(ctx)
        except Exception as exc:
            log.error("investigation.stage_failed", run_id=str(run_id), stage=name, error=str(exc))
            if ctx.records and ctx.records[-1].stage == name:
                ctx.records[-1].error = f"{type(exc).__name__}: {exc}"
                async with db.session(tenant) as session:
                    await writer.stage_done(session, ctx.records[-1])
            async with db.session(tenant) as session:
                await writer.failed(session, name, f"{type(exc).__name__}: {exc}")
            raise
        async with db.session(tenant) as session:
            await writer.stage_done(session, ctx.records[-1])
            if name == intake.STAGE:
                await _record_exif(session, asset_id, ctx.facts["exif"])

    async with db.session(tenant) as session:
        if await _cancelled(session, run_id):
            log.info("investigation.cancelled", run_id=str(run_id), before="produce")
            return
        await writer.produce(
            session,
            ctx.facts["decisions"],
            ctx.facts["scores"],
            subject_point=ctx.facts.get("subject_point"),
            fonds_id=fonds_id,
        )
    log.info("investigation.done", run_id=str(run_id), asset=external_ref)


async def _cancelled(session: Any, run_id: uuid.UUID) -> bool:
    """A withdrawal cancels the run; the pipeline stops at the next stage boundary."""
    status = await session.scalar(select(Run.status).where(Run.id == run_id))
    return status is RunStatus.CANCELLED


async def _record_fixity(session: Any, asset_id: uuid.UUID, raw: bytes) -> None:
    """The master's SHA-256, computed from the bytes actually stored (`Datei_SHA256`)."""
    master = await session.scalar(
        select(AssetFile).where(
            AssetFile.asset_id == asset_id,
            AssetFile.side == AssetSide.RECTO,
            AssetFile.role == FileRole.MASTER,
        )
    )
    if master is not None and not master.sha256:
        master.sha256 = hashlib.sha256(raw).hexdigest()


async def _record_access_copy(
    session: Any, org_id: uuid.UUID, asset_id: uuid.UUID, where: tuple[str, str], size: int
) -> None:
    """The access copy as a file row, so a mirror can point at the same object."""
    existing = await session.scalar(
        select(AssetFile).where(
            AssetFile.asset_id == asset_id,
            AssetFile.side == AssetSide.RECTO,
            AssetFile.role == FileRole.ACCESS,
        )
    )
    if existing is None:
        session.add(
            AssetFile(
                org_id=org_id,
                asset_id=asset_id,
                side=AssetSide.RECTO,
                role=FileRole.ACCESS,
                bucket=where[0],
                s3_key=where[1],
                mime_type="image/jpeg",
                bytes=size,
                uploaded_at=datetime.now(UTC),
            )
        )


async def _record_exif(session: Any, asset_id: uuid.UUID, exif: dict[str, Any]) -> None:
    asset = await session.get(Asset, asset_id)
    if asset is None:
        return
    asset.captured_at = exif.get("captured_at")
    asset.exif_make = exif.get("make")
    asset.exif_model = exif.get("model")
    asset.exif_focal_mm = exif.get("focal_mm")
    asset.exif_hfov_deg = exif.get("hfov_deg")
    asset.exif_lat = exif.get("lat")
    asset.exif_lon = exif.get("lon")
    asset.forensics = {
        "gps_block": exif.get("gps_block"),
        "focal_35mm": exif.get("focal_35mm"),
        "width_px": exif.get("width_px"),
        "height_px": exif.get("height_px"),
        "born_digital": True,
    }
