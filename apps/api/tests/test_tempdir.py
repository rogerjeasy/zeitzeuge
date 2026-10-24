"""Startup finds a temp directory it can write to (the prod export failure)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from zeitzeuge_api.core import tempdir


@pytest.fixture(autouse=True)
def restore_tempdir(monkeypatch):
    monkeypatch.delenv("TMPDIR", raising=False)
    before = tempfile.tempdir
    yield
    tempfile.tempdir = before


def test_an_unwritable_first_candidate_falls_through(tmp_path: Path) -> None:
    locked = tmp_path / "locked"
    locked.mkdir()
    os.chmod(locked, 0o500)  # like /tmp on the Fargate volume: present, not writable
    open_dir = tmp_path / "shm"
    open_dir.mkdir()
    try:
        chosen = tempdir.choose([str(locked), str(tmp_path / "missing"), str(open_dir)])
    finally:
        os.chmod(locked, 0o700)
    assert chosen == str(open_dir)
    assert tempfile.gettempdir() == str(open_dir)


def test_nothing_writable_is_reported_not_raised(tmp_path: Path) -> None:
    assert tempdir.choose([str(tmp_path / "missing")]) is None
