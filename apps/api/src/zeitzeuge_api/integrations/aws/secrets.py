"""Secret *references*, resolved at startup.

Configuration carries `secretsmanager://<arn>#<json-key>` or `ssm://<name>`;
this resolves them once, caches the plaintext in memory for the process, and
never writes it anywhere else. The consequence is the one §10.5 promises: a
task definition, a Terraform plan and a CI log can all be read by anyone
without exposing a credential.

A bare value is passed through unchanged, which is what makes local development
with a `.env` file work without a second code path.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

from botocore.exceptions import BotoCoreError, ClientError

from zeitzeuge_api.core.errors import ConfigurationError
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.integrations.aws.clients import AwsClients, call

log = get_logger(__name__)

SECRETS_SCHEME = "secretsmanager://"
SSM_SCHEME = "ssm://"


@dataclass(slots=True)
class _Cached:
    value: str
    fetched_at: float


class SecretsResolver:
    def __init__(self, clients: AwsClients, *, ttl_seconds: int = 900) -> None:
        self._clients = clients
        self._ttl = ttl_seconds
        self._cache: dict[str, _Cached] = {}

    async def resolve(self, reference: str) -> str:
        """Return the plaintext behind a reference (or the literal itself)."""
        if not reference:
            return ""
        if not reference.startswith((SECRETS_SCHEME, SSM_SCHEME)):
            return reference

        cached = self._cache.get(reference)
        if cached and (time.monotonic() - cached.fetched_at) < self._ttl:
            return cached.value

        value = await self._fetch(reference)
        self._cache[reference] = _Cached(value=value, fetched_at=time.monotonic())
        return value

    async def resolve_json(self, reference: str) -> dict[str, str]:
        """Resolve a reference whose payload is a JSON object (Aurora secrets)."""
        raw = await self.resolve(reference)
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ConfigurationError(
                "A secret that must contain JSON did not.",
            ) from exc
        if not isinstance(parsed, dict):
            raise ConfigurationError("A secret that must contain a JSON object did not.")
        return {str(k): str(v) for k, v in parsed.items()}

    async def _fetch(self, reference: str) -> str:
        try:
            if reference.startswith(SECRETS_SCHEME):
                locator, _, json_key = reference[len(SECRETS_SCHEME) :].partition("#")
                response = await call(
                    self._clients.secretsmanager.get_secret_value, SecretId=locator
                )
                payload = response.get("SecretString", "")
                if json_key:
                    return str(json.loads(payload)[json_key])
                return str(payload)

            name = reference[len(SSM_SCHEME) :]
            response = await call(self._clients.ssm.get_parameter, Name=name, WithDecryption=True)
            return str(response["Parameter"]["Value"])
        except (ClientError, BotoCoreError, KeyError, json.JSONDecodeError) as exc:
            # The reference is safe to log; the value never is.
            log.error("secrets.resolve_failed", reference=reference, error=str(exc))
            raise ConfigurationError(
                "A required secret could not be read.",
            ) from exc
