"""Timing figures for a batch: what the «Zeit» card and the Excel print."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from zeitzeuge_api.investigation.timing import duration_ms, summarise

T0 = datetime(2026, 10, 24, 3, 0, tzinfo=UTC)


def at(seconds: float) -> datetime:
    return T0 + timedelta(seconds=seconds)


def test_a_duration_needs_both_ends() -> None:
    assert duration_ms(at(0), at(90.5)) == 90_500
    assert duration_ms(at(0), None) is None
    assert duration_ms(None, at(5)) is None
    assert duration_ms(at(10), at(5)) is None  # clock skew never yields a negative time


def test_the_summary_of_a_finished_batch() -> None:
    runs = [(at(0), at(60)), (at(10), at(130)), (at(20), at(110)), (at(30), at(330))]
    summary = summarise(runs, now=at(400))
    assert summary["finished"] == 4
    assert summary["min_ms"] == 60_000 and summary["max_ms"] == 300_000
    assert summary["median_ms"] == 105_000  # (90 s + 120 s) / 2
    assert summary["mean_ms"] == 142_500
    assert summary["first_started_at"] == at(0) and summary["last_finished_at"] == at(330)
    assert summary["wall_ms"] == 330_000
    assert summary["per_hour"] == round(4 / (330 / 3600), 1)


def test_a_running_batch_measures_wall_time_to_now() -> None:
    runs = [(at(0), at(60)), (at(5), at(80)), (at(10), None)]
    summary = summarise(runs, now=at(200))
    assert summary["finished"] == 2
    assert summary["wall_ms"] == 200_000


def test_nothing_finished_yet() -> None:
    summary = summarise([(at(0), None)], now=at(30))
    assert summary["finished"] == 0
    assert summary["mean_ms"] is None and summary["per_hour"] is None
    assert summary["wall_ms"] == 30_000
    assert summarise([], now=at(30))["wall_ms"] is None


def test_a_failed_run_ends_the_clock_but_is_not_a_duration() -> None:
    runs = [(at(0), at(60), True), (at(5), at(500), False)]
    summary = summarise(runs, now=at(9_000))
    assert summary["finished"] == 1 and summary["max_ms"] == 60_000
    assert summary["wall_ms"] == 500_000  # not «until now»: nothing is running any more
