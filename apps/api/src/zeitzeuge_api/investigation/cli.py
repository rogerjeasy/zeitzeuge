"""Run investigations in-process, without the API: the regression test and the fallback.

    python -m zeitzeuge_api.investigation.cli run FILE... [--org stasz] [--label prio1]
    python -m zeitzeuge_api.investigation.cli export BATCH_ID out.xlsx [--org stasz]

`run` registers the files as assets of a batch (stored by path, bucket
`local`), runs the same pipeline the worker runs, and prints the five fields
with their confidence and reason. `export` writes the same workbook the API
serves. With `--cache DIR` every external lookup is recorded under DIR and
replayed on the next run, so a repeat run costs only model calls.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import sys
import uuid
from pathlib import Path

from sqlalchemy import select

from zeitzeuge_api.core.config import get_settings
from zeitzeuge_api.core.ids import new_public_id
from zeitzeuge_api.db.models import (
    Asset,
    AssetFile,
    Organization,
    RecordField,
    RecordVersion,
    Run,
    UploadBatch,
)
from zeitzeuge_api.db.models.catalogue import CatalogueRecord
from zeitzeuge_api.db.models.enums import (
    AssetSide,
    AssetStatus,
    BatchSource,
    BatchStatus,
    FileRole,
    OrganizationKind,
)
from zeitzeuge_api.db.session import Database, TenantContext, create_engine
from zeitzeuge_api.investigation.contracts import RANKED_FIELDS
from zeitzeuge_api.investigation.models import ModelClient
from zeitzeuge_api.investigation.pipeline import Deps, LocalImageStore, investigate
from zeitzeuge_api.investigation.toolbox import Toolbox
from zeitzeuge_api.investigation.tools.keys import ExternalKeys
from zeitzeuge_api.services.exporters.xlsx import build_workbook
from zeitzeuge_api.services.investigation_service import InvestigationService

_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".tif": "image/tiff"}


async def _org(db: Database, slug: str) -> uuid.UUID:
    async with db.session(TenantContext.bootstrap()) as session:
        org = await session.scalar(select(Organization).where(Organization.slug == slug))
        if org is None:
            org = Organization(
                slug=slug,
                name="Staatsarchiv Schwyz" if slug == "stasz" else slug,
                kind=OrganizationKind.ARCHIVE,
                canton="SZ",
            )
            session.add(org)
            await session.flush()
        return org.id


async def run(
    files: list[Path], *, org_slug: str, label: str, cache: Path | None, concurrency: int = 1
) -> None:
    settings = get_settings()
    db = Database(create_engine(settings.database_dsn, settings))
    org_id = await _org(db, org_slug)
    tenant = TenantContext(org_id=org_id, role="admin")
    service = InvestigationService(originals=None)  # type: ignore[arg-type]

    async with db.session(tenant) as session:
        fonds = await service._fonds(session, org_id, "foto21")
        batch = await session.scalar(select(UploadBatch).where(UploadBatch.label == label))
        if batch is None:
            batch = UploadBatch(
                org_id=org_id,
                source=BatchSource.S3_PREFIX,
                source_ref="local",
                label=label,
                fonds_id=fonds.id,
                status=BatchStatus.RUNNING,
                issues=[],
            )
            session.add(batch)
            await session.flush()
        runs: list[uuid.UUID] = []
        for path in files:
            raw = path.read_bytes()
            asset = await session.scalar(
                select(Asset).where(Asset.batch_id == batch.id, Asset.external_ref == path.name)
            )
            if asset is None:
                asset = Asset(
                    org_id=org_id,
                    fonds_id=fonds.id,
                    batch_id=batch.id,
                    external_ref=path.name,
                    priority=1,
                    status=AssetStatus.UPLOADED,
                )
                session.add(asset)
                await session.flush()
                session.add(
                    AssetFile(
                        org_id=org_id,
                        asset_id=asset.id,
                        side=AssetSide.RECTO,
                        role=FileRole.MASTER,
                        bucket=LocalImageStore.BUCKET,
                        s3_key=str(path.resolve()),
                        original_filename=path.name,
                        mime_type=_MIME.get(path.suffix.lower(), "image/jpeg"),
                        bytes=len(raw),
                        sha256=hashlib.sha256(raw).hexdigest(),
                    )
                )
            run_row = Run(
                org_id=org_id, public_id=new_public_id("run"), asset_id=asset.id, batch_id=batch.id
            )
            session.add(run_row)
            await session.flush()
            runs.append(run_row.id)
        batch.asset_count = len(files)
        batch_id = batch.id

    keys = ExternalKeys(
        openai=settings.openai_api_key,
        gemini=settings.gemini_api_key,
        serpapi=settings.serpapi_api_key,
        google=settings.google_api_key,
    )
    tools = Toolbox(
        cache_dir=cache,
        keys=keys,
        research_models=(settings.research_openai_model, settings.research_gemini_model),
        research_effort=settings.research_effort,
    )
    deps = Deps(
        models=ModelClient(region=settings.region, openai_key=keys.openai),
        tools=tools,
        images=LocalImageStore(Path("/")),
        code_version="cli",
    )
    slots = asyncio.Semaphore(concurrency)

    async def one(run_id: uuid.UUID) -> None:
        async with slots:
            try:
                await investigate(db, run_id, org_id, deps)
            except Exception as exc:
                print(f"!! run {run_id} failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            await _print(db, tenant, run_id)

    await asyncio.gather(*(one(run_id) for run_id in runs))
    await tools.close()
    print(f"\nbatch {batch_id}")
    await db.dispose()


async def _print(db: Database, tenant: TenantContext, run_id: uuid.UUID) -> None:
    async with db.session(tenant) as session:
        run_row = await session.get(Run, run_id)
        assert run_row is not None
        asset = await session.get(Asset, run_row.asset_id)
        record = await session.scalar(
            select(CatalogueRecord).where(CatalogueRecord.asset_id == run_row.asset_id)
        )
        print(
            f"\n== {asset.external_ref if asset else '?'} · {run_row.status} · "
            f"${float(run_row.cost_usd):.3f} · Gesamt {run_row.outcome_confidence}"
        )
        if record is None:
            print(f"   {run_row.error}")
            return
        version = await session.scalar(
            select(RecordVersion).where(
                RecordVersion.record_id == record.id,
                RecordVersion.version == record.current_version,
            )
        )
        fields = {
            f.field_key: f
            for f in await session.scalars(
                select(RecordField).where(
                    RecordField.record_version_id == (version.id if version else None)
                )
            )
        }
        for key in RANKED_FIELDS:
            f = fields.get(key)
            if f is None:
                continue
            print(
                f"   {key:18} {f.value_text or '—':32} {f.confidence or ''!s:6} "
                f"{f.decision!s:17} {f.explanation}"
            )


async def export(batch_id: uuid.UUID, out: Path, *, org_slug: str) -> None:
    settings = get_settings()
    db = Database(create_engine(settings.database_dsn, settings))
    org_id = await _org(db, org_slug)
    async with db.session(TenantContext(org_id=org_id, role="admin")) as session:
        content = await build_workbook(session, batch_id)
    await asyncio.to_thread(out.write_bytes, content)
    print(f"wrote {out}")
    await db.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(prog="zeitzeuge-investigate")
    sub = parser.add_subparsers(dest="command", required=True)
    run_p = sub.add_parser("run")
    run_p.add_argument("files", nargs="+", type=Path)
    run_p.add_argument("--org", default="stasz")
    run_p.add_argument("--label", default="prio1")
    run_p.add_argument("--cache", type=Path, default=None)
    run_p.add_argument("--concurrency", type=int, default=1)
    exp = sub.add_parser("export")
    exp.add_argument("batch_id", type=uuid.UUID)
    exp.add_argument("out", type=Path)
    exp.add_argument("--org", default="stasz")
    args = parser.parse_args()
    if args.command == "run":
        asyncio.run(
            run(
                args.files,
                org_slug=args.org,
                label=args.label,
                cache=args.cache,
                concurrency=args.concurrency,
            )
        )
    else:
        asyncio.run(export(args.batch_id, args.out, org_slug=args.org))


if __name__ == "__main__":
    main()
