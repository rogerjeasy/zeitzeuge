"""LV95 ⇄ WGS84 with swisstopo's published approximate formulas.

Every Swiss register (GeoAdmin, the address directory, swissNAMES3D) speaks
LV95 / EPSG:2056; OSM, Commons and Wikipedia speak WGS84. The approximation in
swisstopo's «Näherungslösungen für die direkte Transformation CH1903+ ⇄ WGS84»
is good to about a metre inside Switzerland, which is far below the size of
anything a photograph lets us place, and needs no PROJ dependency.
"""

from __future__ import annotations

import math

LV95 = tuple[float, float]


def wgs84_to_lv95(lat: float, lon: float) -> LV95:
    """(lat, lon) in degrees → (E, N) in metres."""
    phi = (lat * 3600 - 169028.66) / 10000
    lam = (lon * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * lam - 10938.51 * lam * phi - 0.36 * lam * phi**2 - 44.54 * lam**3
    n = (
        1200147.07
        + 308807.95 * phi
        + 3745.25 * lam**2
        + 76.63 * phi**2
        - 194.56 * lam**2 * phi
        + 119.79 * phi**3
    )
    return e, n


def lv95_to_wgs84(e: float, n: float) -> tuple[float, float]:
    """(E, N) in metres → (lat, lon) in degrees."""
    y = (e - 2600000) / 1_000_000
    x = (n - 1200000) / 1_000_000
    lam = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x**2 - 0.0436 * y**3
    phi = (
        16.9023892
        + 3.238272 * x
        - 0.270978 * y**2
        - 0.002528 * x**2
        - 0.0447 * y**2 * x
        - 0.0140 * x**3
    )
    return phi * 100 / 36, lam * 100 / 36


def distance_m(a: LV95, b: LV95) -> float:
    """Planar distance in LV95. Exact enough: the projection's scale error is < 0.02 %."""
    return math.hypot(a[0] - b[0], a[1] - b[1])


def envelope(e: float, n: float, radius_m: float) -> str:
    """`xmin,ymin,xmax,ymax` around a point, as GeoAdmin's identify wants it."""
    return f"{e - radius_m:.1f},{n - radius_m:.1f},{e + radius_m:.1f},{n + radius_m:.1f}"
