"""The throttle that stops a login form becoming a bill."""

from __future__ import annotations

import pytest

from zeitzeuge_api.core.errors import RateLimitedError
from zeitzeuge_api.integrations.aws.clients import AwsClients
from zeitzeuge_api.integrations.aws.ratelimit import Limit, RateLimiter

LIMIT = Limit(attempts=3, window_seconds=300)


async def test_blocks_after_the_limit() -> None:
    limiter = RateLimiter(None)
    for _ in range(3):
        await limiter.check(action="login", identifier="a@sz.ch", limit=LIMIT)

    with pytest.raises(RateLimitedError) as caught:
        await limiter.check(action="login", identifier="a@sz.ch", limit=LIMIT)
    assert caught.value.headers["Retry-After"]


async def test_identifiers_are_counted_separately() -> None:
    limiter = RateLimiter(None)
    for _ in range(3):
        await limiter.check(action="login", identifier="a@sz.ch", limit=LIMIT)
    # One archive's noisy user must not lock out a colleague.
    await limiter.check(action="login", identifier="b@sz.ch", limit=LIMIT)


async def test_dynamodb_backed_counter(settings, aws_resources) -> None:
    """The production path: one atomic ADD per attempt."""
    clients = AwsClients(settings)
    limiter = RateLimiter(clients, table_name=aws_resources["rate_table"])

    for _ in range(3):
        await limiter.check(action="login", identifier="durable@sz.ch", limit=LIMIT)
    with pytest.raises(RateLimitedError):
        await limiter.check(action="login", identifier="durable@sz.ch", limit=LIMIT)


async def test_a_broken_table_fails_open(settings) -> None:
    """A throttle outage must not become a sign-in outage."""
    clients = AwsClients(settings)
    limiter = RateLimiter(clients, table_name="table-that-does-not-exist")
    for _ in range(10):
        await limiter.check(action="login", identifier="x@sz.ch", limit=LIMIT)


async def test_login_is_throttled_end_to_end(client, registered, app) -> None:
    from zeitzeuge_api.integrations.aws import ratelimit

    app.state.limiter._local.clear()
    attempts = ratelimit.LOGIN.attempts
    for _ in range(attempts):
        await client.post(
            "/api/v1/auth/login",
            json={"email": registered["email"], "password": "Falsch-1893!"},
        )
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"email": registered["email"], "password": registered["password"]},
    )
    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"]
