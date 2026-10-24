"""The worker's queue, proved against real Postgres under FORCE RLS (design note D2).

Two archives each queue a run. The worker — a transaction announcing only
`app.role = 'worker'` — must find both, claim each exactly once, and never see
anything but `runs`. A run whose heartbeat went stale is failed and re-queued.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from tests.test_rls import pg  # noqa: F401  (fixture)
from tests.test_rls_investigation import _archive

from zeitzeuge_api.db.models import Run
from zeitzeuge_api.db.models.enums import RunStatus
from zeitzeuge_api.db.session import Database, TenantContext
from zeitzeuge_api.investigation.worker import InvestigationWorker

pytestmark = pytest.mark.integration


def _worker(db: Database) -> InvestigationWorker:
    return InvestigationWorker(db, deps=None, stale_after=timedelta(minutes=10))  # type: ignore[arg-type]


async def test_the_worker_claims_each_archives_run_once(pg: Database) -> None:  # noqa: F811
    schwyz, _, schwyz_run = await _archive(pg, "schwyz")
    zug, _, zug_run = await _archive(pg, "zug")
    worker = _worker(pg)

    first = await worker.claim()
    second = await worker.claim()
    third = await worker.claim()

    assert {first, second} == {(schwyz_run, schwyz), (zug_run, zug)}
    assert third is None
    async with pg.session(TenantContext(org_id=schwyz, role="admin")) as session:
        run = await session.get(Run, schwyz_run)
        assert run is not None and run.status is RunStatus.RUNNING and run.attempts == 1


async def test_a_lost_run_is_failed_and_queued_again(pg: Database) -> None:  # noqa: F811
    schwyz, asset_id, run_id = await _archive(pg, "schwyz")
    worker = _worker(pg)
    assert await worker.claim() == (run_id, schwyz)
    async with pg.session(TenantContext(role="worker")) as session:
        await session.execute(
            text("UPDATE runs SET heartbeat_at = :t WHERE id = :id"),
            {"t": datetime.now(UTC) - timedelta(hours=1), "id": run_id},
        )

    assert await worker.reap() == 1

    async with pg.session(TenantContext(org_id=schwyz, role="admin")) as session:
        runs = list(await session.scalars(select(Run).where(Run.asset_id == asset_id)))
    statuses = sorted(str(r.status) for r in runs)
    assert statuses == ["failed", "queued"]
    assert next(r for r in runs if r.status is RunStatus.QUEUED).parent_run_id == run_id
