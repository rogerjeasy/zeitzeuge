"""Whose address the rate limits and the audit trail see.

`X-Forwarded-For` is a list the client may prepend to, and the ALB appends to
it rather than rewriting it, so its first entry is whatever the caller typed.
Trusting it let anyone rotate fake addresses past every per-IP limit.
CloudFront's `CloudFront-Viewer-Address` is written by CloudFront from the TCP
connection; it is the only client address accepted outside local development.
"""

from __future__ import annotations

import pytest
from starlette.requests import Request

from zeitzeuge_api.middleware.request_context import client_ip


def _request(headers: dict[str, str], peer: str = "10.0.3.7") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (peer, 51234),
        }
    )


@pytest.mark.parametrize(
    ("viewer", "expected"),
    [
        ("198.51.100.10:46532", "198.51.100.10"),
        ("2001:db8::1:46532", "2001:db8::1"),
        ("[2001:db8::1]:46532", "2001:db8::1"),
    ],
)
def test_cloudfronts_viewer_address_wins(viewer: str, expected: str) -> None:
    request = _request({"CloudFront-Viewer-Address": viewer, "X-Forwarded-For": "6.6.6.6"})
    assert client_ip(request, trust_forwarded_for=False) == expected


def test_a_forged_forwarded_for_is_ignored_in_aws() -> None:
    request = _request({"X-Forwarded-For": "6.6.6.6, 198.51.100.10, 10.0.1.4"})
    # No CloudFront header: the only honest answer is the hop that connected.
    assert client_ip(request, trust_forwarded_for=False) == "10.0.3.7"


def test_forwarded_for_is_trusted_only_locally() -> None:
    request = _request({"X-Forwarded-For": "::1, 127.0.0.1"})
    assert client_ip(request, trust_forwarded_for=True) == "::1"


def test_a_malformed_viewer_address_is_not_an_address() -> None:
    request = _request({"CloudFront-Viewer-Address": "not-an-ip:1"})
    assert client_ip(request, trust_forwarded_for=False) == "10.0.3.7"
