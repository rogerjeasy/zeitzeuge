"""boto3 client factory.

boto3 is synchronous and its clients are *not* coroutine-friendly, so every
call is pushed to a worker thread (`call`). That is deliberate rather than
reaching for aioboto3: the thread-pool hop costs microseconds against a network
call measured in tens of milliseconds, and it keeps us on the SDK AWS actually
supports, including its adaptive retry mode and credential refresh.

Clients are created once and reused. Creating a boto3 client per request is a
classic latency bug — it parses the service JSON model every time.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import lru_cache
from typing import Any

import anyio
import boto3
from botocore.client import BaseClient
from botocore.config import Config

from zeitzeuge_api import __version__
from zeitzeuge_api.core.config import Settings

_RETRY_CONFIG = Config(
    retries={"max_attempts": 4, "mode": "adaptive"},
    connect_timeout=3,
    read_timeout=10,
    user_agent_extra=f"zeitzeuge-api/{__version__}",
)


class AwsClients:
    """Lazily-built, long-lived clients for one region."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._session = boto3.session.Session(region_name=settings.region)
        self._cache: dict[str, BaseClient] = {}

    def client(self, service: str) -> BaseClient:
        if service not in self._cache:
            kwargs: dict[str, Any] = {"config": _RETRY_CONFIG}
            # Only local development redirects the SDK — at moto or LocalStack.
            if self._settings.aws_endpoint_url:
                kwargs["endpoint_url"] = self._settings.aws_endpoint_url
            elif service == "s3":
                # Zurich is an opt-in region: S3's global endpoint does not serve
                # its buckets, so a presigned POST or GET built on it fails in the
                # browser before CORS even applies. Sign for the regional host.
                region = self._settings.region
                kwargs["endpoint_url"] = f"https://s3.{region}.amazonaws.com"
                kwargs["config"] = _RETRY_CONFIG.merge(
                    Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
                )
            self._cache[service] = self._session.client(service, **kwargs)
        return self._cache[service]

    @property
    def cognito(self) -> BaseClient:
        return self.client("cognito-idp")

    @property
    def s3(self) -> BaseClient:
        return self.client("s3")

    @property
    def dynamodb(self) -> BaseClient:
        return self.client("dynamodb")

    @property
    def secretsmanager(self) -> BaseClient:
        return self.client("secretsmanager")

    @property
    def ssm(self) -> BaseClient:
        return self.client("ssm")


async def call[T](func: Callable[..., T], /, **kwargs: Any) -> T:
    """Run a blocking boto3 call on a worker thread."""

    def _invoke() -> T:
        return func(**kwargs)

    return await anyio.to_thread.run_sync(_invoke)


@lru_cache(maxsize=1)
def get_clients_for(settings: Settings) -> AwsClients:  # pragma: no cover - trivial
    return AwsClients(settings)
