"""The guarded fetch refuses anything but public https (security review of 95f5b77)."""

from __future__ import annotations

import httpx
import pytest

from zeitzeuge_api.investigation.tools import fetch


async def _get(url: str, client: httpx.AsyncClient) -> fetch.Fetched | None:
    return await fetch.guarded_get(
        client, url, max_bytes=1000, types=("text/html",), read_seconds=5, user_agent="t"
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://example.ch/",
        "https://127.0.0.1/",
        "https://169.254.169.254/latest/meta-data/",
        "https://10.0.0.5/",
        "https://[::1]/",
        "file:///etc/passwd",
    ],
)
async def test_non_public_or_non_https_targets_are_refused_before_any_request(url: str) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"no request may be sent, got {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(refuse)) as client:
        assert await _get(url, client) is None


async def test_a_redirect_to_an_internal_address_is_not_followed(monkeypatch) -> None:
    async def public(host: str, port: int) -> str | None:
        return None if host == "169.254.169.254" else "93.184.216.34"

    monkeypatch.setattr(fetch, "_checked_address", public)
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        # The request goes to the checked address; the name travels as Host and SNI.
        assert request.headers["host"] == "example.ch"
        assert request.extensions["sni_hostname"] == "example.ch"
        return httpx.Response(302, headers={"location": "https://169.254.169.254/x"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await _get("https://example.ch/a", client) is None
    assert seen == ["https://93.184.216.34/a"]


async def test_bodies_are_cut_at_the_cap_and_types_are_allow_listed(monkeypatch) -> None:
    async def public(host: str, port: int) -> str | None:
        return "93.184.216.34"

    monkeypatch.setattr(fetch, "_checked_address", public)

    def handler(request: httpx.Request) -> httpx.Response:
        kind = "text/html" if request.url.path == "/page" else "application/octet-stream"
        return httpx.Response(200, headers={"content-type": kind}, content=b"x" * 5000)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        page = await _get("https://example.ch/page", client)
        assert page is not None and len(page.body) == 1000
        assert await _get("https://example.ch/binary", client) is None
