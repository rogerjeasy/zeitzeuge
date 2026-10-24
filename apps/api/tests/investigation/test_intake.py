"""EXIF intake on the real Prio-1 files (the documentation folder ships them)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from zeitzeuge_api.investigation.stages.intake import hfov_from_35mm, read_exif

PRIO1 = Path(__file__).resolve().parents[5] / "documentation" / "Bilder Prio 1"


@pytest.fixture
def ground_truth() -> bytes:
    path = PRIO1 / "SG.CIV.17.3.jpg"
    if not path.exists():
        pytest.skip("Prio-1 photos not present in this checkout")
    return path.read_bytes()


def test_the_capture_date_and_camera_are_read(ground_truth: bytes) -> None:
    facts = read_exif(ground_truth)
    assert facts["captured_at"] == datetime(2005, 2, 24, 10, 39, 27)
    assert facts["make"] == "NIKON CORPORATION"
    assert facts["model"] == "NIKON D1X"


def test_an_empty_gps_block_is_not_a_position(ground_truth: bytes) -> None:
    facts = read_exif(ground_truth)
    assert facts["gps_block"] is True
    assert facts["lat"] is None and facts["lon"] is None


def test_no_prio1_photo_has_coordinates() -> None:
    files = sorted(PRIO1.glob("*.jpg"))
    if not files:
        pytest.skip("Prio-1 photos not present in this checkout")
    facts = [read_exif(f.read_bytes()) for f in files]
    assert len(facts) == 50
    assert all(f["captured_at"] is not None for f in facts)
    assert [f for f in facts if f["lat"] is not None] == []


def test_field_of_view_from_a_35mm_equivalent() -> None:
    assert hfov_from_35mm(24) == pytest.approx(73.74, abs=0.01)
    assert hfov_from_35mm(50) == pytest.approx(39.6, abs=0.1)
