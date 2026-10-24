"""LV95 ⇄ WGS84 against published reference pairs (no network)."""

from __future__ import annotations

import pytest

from zeitzeuge_api.investigation.tools.geo import (
    distance_m,
    envelope,
    lv95_to_wgs84,
    wgs84_to_lv95,
)


def dms(d: int, m: int, s: float) -> float:
    return d + m / 60 + s / 3600


def test_swisstopo_worked_example() -> None:
    # swisstopo, «Näherungslösungen für die direkte Transformation CH1903+ ⇄ WGS84»:
    # 46° 2' 38.87" N, 8° 43' 49.79" E  →  E 2 699 999.76, N 1 099 999.97.
    e, n = wgs84_to_lv95(dms(46, 2, 38.87), dms(8, 43, 49.79))
    assert e == pytest.approx(2699999.76, abs=0.05)
    assert n == pytest.approx(1099999.97, abs=0.05)


def test_geoadmin_acherhof_pair() -> None:
    # SearchServer returns both systems for the Acherhof name point (lat/lon as float32).
    e, n = wgs84_to_lv95(47.01866912841797, 8.657115936279297)
    assert distance_m((e, n), (2692637.75, 1208232.25)) < 1.0


def test_schwyz_hauptplatz() -> None:
    # GeoAdmin SearchServer, address «Hauptplatz 1, 6430 Schwyz» (recorded 2026-10-24):
    # lat 47.02083969, lon 8.65386772  ⇄  E 2 692 387.25, N 1 208 469.875.
    e, n = wgs84_to_lv95(47.02083969116211, 8.653867721557617)
    assert distance_m((e, n), (2692387.25, 1208469.875)) < 20
    lat, lon = lv95_to_wgs84(2692387.25, 1208469.875)
    assert lat == pytest.approx(47.0208397, abs=2e-5)
    assert lon == pytest.approx(8.6538677, abs=2e-5)
    # The brief's round 2 692 000 / 1 208 000 is the right square kilometre, not 20 m.
    assert 2692000 < e < 2693000 and 1208000 < n < 1209000


@pytest.mark.parametrize(
    ("e", "n"),
    [(2692637.75, 1208232.25), (2600000.0, 1200000.0), (2700000.0, 1100000.0)],
)
def test_round_trip_is_metre_accurate(e: float, n: float) -> None:
    lat, lon = lv95_to_wgs84(e, n)
    back = wgs84_to_lv95(lat, lon)
    assert distance_m(back, (e, n)) < 1.5


def test_lv95_to_wgs84_worked_example_reversed() -> None:
    # Same published pair the other way round; 1e-5 degrees is about a metre.
    lat, lon = lv95_to_wgs84(2700000, 1100000)
    assert lat == pytest.approx(dms(46, 2, 38.87), abs=1e-5)
    assert lon == pytest.approx(dms(8, 43, 49.79), abs=1e-5)


def test_distance_and_envelope() -> None:
    assert distance_m((0, 0), (3, 4)) == 5
    assert envelope(2692637.75, 1208232.25, 60) == "2692577.8,1208172.2,2692697.8,1208292.2"
