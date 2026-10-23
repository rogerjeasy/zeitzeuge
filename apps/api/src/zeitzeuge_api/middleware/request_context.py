"""Per-request plumbing: an id, a bound logger, a timing, and the headers
that tell us who is calling.

The request id is echoed back on every response and written into every audit
row, so a screenshot of an error in Schwyz and a CloudWatch Logs Insights query
in Zurich meet at the same string.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.core.logging import get_logger

log = get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-Id"
SESSION_HEADER = "X-ZZ-Session"

# Paths whose volume would drown the log without saying anything.
_QUIET_PATHS = frozenset({"/healthz", "/readyz", "/metrics"})


def client_ip(request: Request) -> str | None:
    """The viewer's address, read at the position the proxy chain puts it.

    Behind CloudFront and an ALB, `X-Forwarded-For` is a list that the client
    can prepend to. The left-most entry is therefore attacker-controlled; the
    right-most entries are added by infrastructure we trust. We take the first
    entry only because the ALB is configured to rewrite the header — and if
    that assumption ever changes, this is the one function to fix.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def viewer_location(request: Request) -> str | None:
    """CloudFront's own geography headers. No third-party geo-IP lookup."""
    city = request.headers.get("cloudfront-viewer-city")
    country = request.headers.get("cloudfront-viewer-country")
    parts = [part for part in (city, country) if part]
    return ", ".join(parts)[:120] if parts else None


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        context = RequestContext(
            request_id=request_id,
            ip_address=client_ip(request),
            user_agent=request.headers.get("user-agent"),
            location=viewer_location(request),
            session_id=request.headers.get(SESSION_HEADER),
        )
        request.state.context = context

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            # The handler in `main` turns this into a problem document; here we
            # only make sure the failure is timed and attributable.
            log.exception(
                "request.failed", duration_ms=round((time.perf_counter() - started) * 1000, 2)
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id
        if request.url.path not in _QUIET_PATHS:
            log.info("request", status=response.status_code, duration_ms=duration_ms)
        return response


# The API itself serves JSON and nothing else, so its policy forbids
# everything: a response that somehow contained markup could still load no
# script, no style, no image and no font.
API_CSP = "default-src 'none'; frame-ancestors 'none'"

# The two documentation pages are the exception — and they are an exception
# that has to be stated, because `default-src 'none'` silently blocks Swagger
# UI's stylesheet and bundle and leaves a blank page with a 200 next to it in
# the log. This names the one CDN FastAPI's generated HTML points at, and
# nothing else; `unsafe-inline` for scripts covers the initialiser FastAPI
# writes inline into that page.
DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)

DOCS_PATHS = frozenset({"/docs", "/docs/oauth2-redirect", "/redoc"})


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Headers that cost nothing and close whole classes of attack.

    The API serves JSON to a browser application on another origin, so the
    content policy is the restrictive one: nothing may be framed, nothing may
    be sniffed into an executable type, and no referrer leaves the origin. The
    documentation pages get a narrower exception rather than a blanket
    loosening — see `DOCS_CSP`.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
        response.headers.setdefault("Cache-Control", "no-store")

        is_docs = request.url.path.rstrip("/") in DOCS_PATHS
        response.headers.setdefault("Content-Security-Policy", DOCS_CSP if is_docs else API_CSP)
        return response
