"""Replay fixtures for the lookup clients.

Every response these tests parse was recorded once from the live service
(`ToolCache(directory=FIXTURES)`), then replayed with `replay=True`. The HTTP
client underneath refuses every request, so a test that would reach the network
fails loudly instead of quietly depending on swisstopo being up.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from zeitzeuge_api.investigation.tools.base import ToolCache

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "tools"

ACHERHOF = (2692637.75, 1208232.25)
"""swissNAMES3D «Acherhof» (Flurname) in LV95: the SG.CIV.17.3 subject point."""


def _refuse(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"test tried to reach the network: {request.method} {request.url}")


@pytest.fixture
def replay() -> ToolCache:
    return ToolCache(directory=FIXTURES, replay=True)


@pytest.fixture
async def offline_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(transport=httpx.MockTransport(_refuse)) as client:
        yield client
