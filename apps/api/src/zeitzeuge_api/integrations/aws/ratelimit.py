"""Rate limiting on DynamoDB.

Cognito has its own throttles, but they are per-pool and they protect Cognito,
not us. These limits protect the *account*: they are what stops a credential
stuffer from turning a login form into a Bedrock bill, and they are keyed on
the pair (identifier, IP) so one noisy office NAT cannot lock out a whole
archive.

Mechanism: a fixed window, one atomic `ADD` per attempt, and a DynamoDB TTL to
sweep the row. A fixed window admits a burst of twice the limit across a boundary,
which is an acceptable trade for a single-digit-millisecond, single-round-trip
check with no coordination — the real defence against a determined attacker is
Cognito's own lockout, not this counter.

Without a table configured (local development, tests) it degrades to an
in-process counter, so the behaviour under test is the behaviour in production
minus the durability.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from botocore.exceptions import BotoCoreError, ClientError

from zeitzeuge_api.core.errors import RateLimitedError
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.integrations.aws.clients import AwsClients, call

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Limit:
    """`attempts` permitted per `window_seconds`."""

    attempts: int
    window_seconds: int


# The policy, in one place so it can be read at a glance in review.
LOGIN = Limit(attempts=10, window_seconds=300)
REGISTER = Limit(attempts=5, window_seconds=3600)
PASSWORD_RESET = Limit(attempts=5, window_seconds=3600)
VERIFICATION_RESEND = Limit(attempts=5, window_seconds=3600)
AVATAR_UPLOAD = Limit(attempts=20, window_seconds=3600)
API_KEY_CREATE = Limit(attempts=10, window_seconds=3600)


class RateLimiter:
    def __init__(self, clients: AwsClients | None, *, table_name: str = "") -> None:
        self._clients = clients
        self._table = table_name
        self._local: dict[str, int] = {}

    async def check(self, *, action: str, identifier: str, limit: Limit) -> None:
        """Count one attempt; raise `RateLimitedError` once over the limit."""
        now = int(time.time())
        window_start = now - (now % limit.window_seconds)
        key = f"{action}#{identifier}#{window_start}"
        reset_in = window_start + limit.window_seconds - now

        count = await self._increment(key, expires_at=window_start + limit.window_seconds)
        if count > limit.attempts:
            log.info("ratelimit.blocked", action=action, count=count, limit=limit.attempts)
            raise RateLimitedError(retry_after=max(reset_in, 1))

    async def _increment(self, key: str, *, expires_at: int) -> int:
        if not self._table or self._clients is None:
            self._local[key] = self._local.get(key, 0) + 1
            return self._local[key]

        try:
            response = await call(
                self._clients.dynamodb.update_item,
                TableName=self._table,
                Key={"pk": {"S": key}},
                UpdateExpression=(
                    "ADD attempts :one SET expires_at = if_not_exists(expires_at, :ttl)"
                ),
                ExpressionAttributeValues={
                    ":one": {"N": "1"},
                    ":ttl": {"N": str(expires_at)},
                },
                ReturnValues="UPDATED_NEW",
            )
        except (ClientError, BotoCoreError) as exc:
            # Fail **open**, loudly. A throttle table outage must not become an
            # outage of sign-in for an archive; the alarm on this metric is the
            # control, and Cognito's own lockout still applies underneath.
            log.error("ratelimit.unavailable", error=str(exc), table=self._table)
            return 0

        return int(response["Attributes"]["attempts"]["N"])
