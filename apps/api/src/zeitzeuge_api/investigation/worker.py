"""The in-API investigation worker (design note D1, D2).

A queue in Aurora, not in memory: a run is a `runs` row, and the worker claims
the oldest `queued` one with `FOR UPDATE SKIP LOCKED`, so two API tasks never
take the same photo and a restarted task loses nothing. Claiming happens under
`app.role = 'worker'`, the one policy that sees `runs` across tenants (and
nothing else); the investigation itself then runs under the run's own tenant.

A run whose heartbeat stops (the task was replaced mid-run by a deploy) is
marked failed after `stale_after` and a fresh run is queued for the same photo,
at most `max_attempts` times per photo. The failed run's ledger stays — it is
append-only, and it is a true record of what happened.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text

from zeitzeuge_api.core.ids import new_public_id
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.db.models import Run
from zeitzeuge_api.db.models.enums import RunKind, RunStatus
from zeitzeuge_api.db.session import Database, TenantContext
from zeitzeuge_api.investigation.pipeline import Deps, investigate

log = get_logger(__name__)

WORKER = TenantContext(role="worker")


class InvestigationWorker:
    def __init__(
        self,
        db: Database,
        deps: Deps,
        *,
        concurrency: int = 4,
        poll_seconds: float = 2.0,
        stale_after: timedelta = timedelta(minutes=10),
        max_attempts: int = 2,
    ) -> None:
        self._db = db
        self._deps = deps
        self._slots = asyncio.Semaphore(concurrency)
        self._poll = poll_seconds
        self._stale_after = stale_after
        self._max_attempts = max_attempts
        self._tasks: set[asyncio.Task[None]] = set()
        self._stopping = asyncio.Event()

    async def claim(self) -> tuple[uuid.UUID, uuid.UUID] | None:
        async with self._db.session(WORKER) as session:
            row = (
                await session.execute(
                    text(
                        "SELECT id, org_id FROM runs WHERE status = 'queued' "
                        "ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
                    )
                )
            ).first()
            if row is None:
                return None
            await session.execute(
                text(
                    "UPDATE runs SET status = 'running', attempts = attempts + 1, "
                    "heartbeat_at = now(), started_at = coalesce(started_at, now()) WHERE id = :id"
                ),
                {"id": row.id},
            )
            return uuid.UUID(str(row.id)), uuid.UUID(str(row.org_id))

    async def reap(self) -> int:
        """Fail runs whose worker vanished; queue a fresh attempt for each photo."""
        cutoff = datetime.now(UTC) - self._stale_after
        async with self._db.session(WORKER) as session:
            stale = list(
                await session.scalars(
                    select(Run).where(Run.status == RunStatus.RUNNING, Run.heartbeat_at < cutoff)
                )
            )
            for run in stale:
                run.status = RunStatus.FAILED
                run.error = {"stage": run.current_stage, "detail": "worker lost (heartbeat stale)"}
                run.finished_at = datetime.now(UTC)
            lost = [(r.org_id, r.asset_id, r.batch_id, r.id) for r in stale]

        for org_id, asset_id, batch_id, parent_id in lost:
            async with self._db.session(TenantContext(org_id=org_id, role="pipeline")) as session:
                attempts = await session.scalar(
                    select(func.count()).select_from(Run).where(Run.asset_id == asset_id)
                )
                if (attempts or 0) >= self._max_attempts:
                    continue
                session.add(
                    Run(
                        org_id=org_id,
                        public_id=new_public_id("run"),
                        asset_id=asset_id,
                        batch_id=batch_id,
                        kind=RunKind.RERUN,
                        parent_run_id=parent_id,
                    )
                )
        return len(lost)

    async def _work(self, run_id: uuid.UUID, org_id: uuid.UUID) -> None:
        try:
            await investigate(self._db, run_id, org_id, self._deps)
        except Exception as exc:  # the pipeline has already recorded the failure
            log.error("worker.run_failed", run_id=str(run_id), error=str(exc))
        finally:
            self._slots.release()

    async def run_forever(self) -> None:
        log.info("worker.started")
        last_reap = 0.0
        loop = asyncio.get_running_loop()
        while not self._stopping.is_set():
            try:
                if loop.time() - last_reap > 60:
                    await self.reap()
                    last_reap = loop.time()
                await self._slots.acquire()
                claimed = await self.claim()
                if claimed is None:
                    self._slots.release()
                    await asyncio.wait_for(self._stopping.wait(), timeout=self._poll)
                    continue
                task = asyncio.create_task(self._work(*claimed))
                self._tasks.add(task)
                task.add_done_callback(self._tasks.discard)
            except TimeoutError:
                continue
            except Exception as exc:  # a DB blip must not kill the loop
                log.error("worker.loop_error", error=str(exc))
                await asyncio.sleep(self._poll)

    async def stop(self) -> None:
        self._stopping.set()
        for task in list(self._tasks):
            task.cancel()
