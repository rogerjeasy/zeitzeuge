"""How long an investigation takes: durations and the batch summary.

Nothing here measures anything: `runs` already records when a photograph was
queued, claimed and finished, and every stage its own start and end. These
pure functions turn those timestamps into the figures the batch's «Zeit»
card, the review timeline and the workbook show (batch-management note §6).
"""

from __future__ import annotations

import statistics
from collections.abc import Iterable
from datetime import datetime
from typing import Any


def duration_ms(start: datetime | None, end: datetime | None) -> int | None:
    """Milliseconds between two moments, or None if either is missing or they are reversed."""
    if start is None or end is None:
        return None
    delta = int((end - start).total_seconds() * 1000)
    return delta if delta >= 0 else None


def summarise(
    runs: Iterable[
        tuple[datetime | None, datetime | None] | tuple[datetime | None, datetime | None, bool]
    ],
    *,
    now: datetime,
) -> dict[str, Any]:
    """Batch figures, one entry per photograph's latest run.

    Each entry is (started_at, finished_at) or (started_at, finished_at, measured).
    `finished_at = None` means still running. `measured = False` (a failed or
    cancelled run) ends the run for the wall clock but keeps it out of the
    durations: how long a photo *takes* is a question about the ones that worked.
    """
    entries = [(r[0], r[1], r[2] if len(r) > 2 else True) for r in runs if r[0] is not None]
    pairs = [(s, f) for s, f, _ in entries]
    durations = sorted(
        d for s, f, measured in entries if measured and (d := duration_ms(s, f)) is not None
    )
    first_start = min((s for s, _ in pairs), default=None)
    finishes = [f for _, f in pairs if f is not None]
    last_finish = max(finishes, default=None)
    still_running = any(f is None for _, f in pairs)
    wall_end = now if still_running or last_finish is None else last_finish
    wall = duration_ms(first_start, wall_end)

    def percentile(share: float) -> int | None:
        if not durations:
            return None
        index = min(len(durations) - 1, max(0, round(share * (len(durations) - 1))))
        return durations[index]

    return {
        "finished": len(durations),
        "mean_ms": round(statistics.fmean(durations)) if durations else None,
        "median_ms": round(statistics.median(durations)) if durations else None,
        "p90_ms": percentile(0.9),
        "min_ms": durations[0] if durations else None,
        "max_ms": durations[-1] if durations else None,
        "first_started_at": first_start,
        "last_finished_at": last_finish,
        "wall_ms": wall,
        "per_hour": (
            round(len(durations) / (wall / 3_600_000), 1) if wall and len(durations) >= 2 else None
        ),
    }
