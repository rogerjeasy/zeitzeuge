"""Fan-out of `pg_notify('zz_runs', …)` to the open event streams (design note D8).

One LISTEN connection per API task, not one per viewer: Aurora connections are
the scarce resource, an idle stream is not. Every committed ledger stage sends
a notification carrying only ids (`run_id`, `batch_id`, `org_id`, stage,
state); this class hands each one to the queues subscribed to that batch. The
stream endpoint then tells the browser *that* something changed, and the
browser re-reads the batch through the normal, RLS-checked endpoint, so no
tenant data ever travels on the notification path.

Notifications sent by the worker in *another* API task arrive here too —
that is the point of using Postgres for the fan-out rather than memory.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

import asyncpg

from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.investigation.ledger import CHANNEL

log = get_logger(__name__)


class RunNotifier:
    def __init__(self, dsn: str) -> None:
        # SQLAlchemy's DSN names the driver; asyncpg wants plain postgresql://.
        self._dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)
        self._connection: asyncpg.Connection | None = None
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)

    async def start(self) -> None:
        try:
            self._connection = await asyncpg.connect(self._dsn, timeout=10)
            await self._connection.add_listener(CHANNEL, self._on_notify)
            log.info("notifier.listening", channel=CHANNEL)
        except Exception as exc:  # the stream degrades to polling; the API stays up
            log.error("notifier.unavailable", error=str(exc))
            self._connection = None

    async def stop(self) -> None:
        if self._connection is not None:
            await self._connection.close()
            self._connection = None

    @property
    def live(self) -> bool:
        return self._connection is not None and not self._connection.is_closed()

    def subscribe(self, batch_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        self._subscribers[batch_id].add(queue)
        return queue

    def unsubscribe(self, batch_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers[batch_id].discard(queue)
        if not self._subscribers[batch_id]:
            self._subscribers.pop(batch_id, None)

    def _on_notify(self, _connection: Any, _pid: int, _channel: str, payload: str) -> None:
        try:
            event = json.loads(payload)
        except ValueError:
            return
        for queue in list(self._subscribers.get(str(event.get("batch_id")), ())):
            if queue.full():
                continue  # a slow viewer misses a tick, then re-reads the whole batch anyway
            queue.put_nowait(event)
