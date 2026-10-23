"""Token verification and the request principal.

Cognito issues the tokens; this module is the only place that decides whether
one is genuine. It verifies the signature against the pool's published JWKS,
then every claim that matters: issuer, `token_use`, audience/client, and
expiry. A token that fails any of those is indistinguishable from no token at
all — there is no degraded "well, the signature was fine" path.

Two details that are easy to get wrong and expensive to get wrong:

* **`token_use`.** An *id* token and an *access* token are both valid RS256
  JWTs from the same issuer. Only the access token is an authorisation to call
  the API; the id token is a statement about who signed in. Accepting the id
  token as a bearer credential is a real and common hole, so the expected use
  is a required argument here, never a default.
* **JWKS rotation.** Keys rotate. The cache refreshes on an unknown `kid`, but
  behind a cooldown, so a flood of forged tokens with random `kid`s cannot turn
  into a flood of outbound requests to Cognito.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import httpx
import jwt
from jwt import PyJWKSet

from zeitzeuge_api.core.errors import TokenExpiredError, UnauthenticatedError, UpstreamError
from zeitzeuge_api.core.logging import get_logger

log = get_logger(__name__)

TokenUse = str  # "access" | "id"


@dataclass(frozen=True, slots=True)
class Principal:
    """Who is making this request, as proven by the token."""

    subject: str
    """Cognito `sub` — the stable user identifier, never the e-mail."""

    username: str
    email: str | None = None
    groups: tuple[str, ...] = ()
    org_id: str | None = None
    role: str | None = None
    token_use: TokenUse = "access"
    client_id: str | None = None
    expires_at: int = 0
    raw_claims: dict[str, Any] = field(default_factory=dict, repr=False)
    via_api_key: bool = False
    api_key_scope: str | None = None

    @property
    def is_guest(self) -> bool:
        return "guest" in self.groups or self.role == "guest"

    def has_any_role(self, *roles: str) -> bool:
        wanted = set(roles)
        return bool(wanted & set(self.groups)) or (self.role in wanted)


class JWKSCache:
    """Signing keys for one user pool, cached with a TTL and a refresh cooldown."""

    def __init__(
        self,
        jwks_url: str,
        *,
        ttl_seconds: int = 3600,
        cooldown_seconds: int = 30,
        headers: dict[str, str] | None = None,
    ):
        self._url = jwks_url
        self._headers = headers or {}
        self._ttl = ttl_seconds
        self._cooldown = cooldown_seconds
        self._keys: PyJWKSet | None = None
        self._fetched_at = 0.0
        self._last_forced = 0.0

    async def get_key(self, kid: str) -> Any:
        keyset = await self._keyset()
        key = self._find(keyset, kid)
        if key is not None:
            return key

        now = time.monotonic()
        if now - self._last_forced >= self._cooldown:
            self._last_forced = now
            keyset = await self._keyset(force=True)
            key = self._find(keyset, kid)
            if key is not None:
                return key

        raise UnauthenticatedError("The token was signed with an unknown key.")

    async def _keyset(self, *, force: bool = False) -> PyJWKSet:
        fresh = self._keys is not None and (time.monotonic() - self._fetched_at) < self._ttl
        if fresh and not force:
            assert self._keys is not None
            return self._keys
        try:
            self._keys = await self._fetch()
        except (httpx.HTTPError, ValueError) as exc:
            # Unreachable, a non-2xx, or a body that is not a key set. The
            # token may be perfectly good; what failed is a dependency.
            log.warning("jwks.fetch_failed", error=type(exc).__name__, url=self._url)
            raise UpstreamError("The identity provider's signing keys are unavailable.") from exc
        self._fetched_at = time.monotonic()
        return self._keys

    async def _fetch(self) -> PyJWKSet:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(self._url, headers=self._headers)
            response.raise_for_status()
            return PyJWKSet.from_dict(response.json())

    @staticmethod
    def _find(keyset: PyJWKSet, kid: str) -> Any:
        for key in keyset.keys:
            if key.key_id == kid:
                return key.key
        return None

    async def warm(self) -> None:
        """Called at startup so the first authenticated request pays no latency."""
        try:
            await self._keyset(force=True)
        except Exception as exc:  # pragma: no cover - network-shaped failure
            log.warning("jwks.warm_failed", error=str(exc), url=self._url)


class TokenVerifier:
    def __init__(
        self,
        *,
        jwks: JWKSCache,
        issuer: str,
        client_id: str,
        leeway_seconds: int = 30,
    ) -> None:
        self._jwks = jwks
        self._issuer = issuer
        self._client_id = client_id
        self._leeway = leeway_seconds

    async def verify(self, token: str, *, expected_use: TokenUse) -> Principal:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise UnauthenticatedError("The token is malformed.") from exc

        kid = header.get("kid")
        if not kid or header.get("alg") != "RS256":
            raise UnauthenticatedError("The token header is not acceptable.")

        key = await self._jwks.get_key(kid)

        # Access tokens carry `client_id`; id tokens carry `aud`. Verify the
        # audience manually below so both can share one code path.
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                key=key,
                algorithms=["RS256"],
                issuer=self._issuer,
                leeway=self._leeway,
                # The claims AWS's own verifier (aws-jwt-verify) insists on.
                # `iat` is validated when present but not required: it adds
                # nothing `exp` does not, and the local emulator omits it.
                options={"require": ["exp", "sub", "token_use"], "verify_aud": False},
            )
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpiredError() from exc
        except jwt.PyJWTError as exc:
            raise UnauthenticatedError("The token is not valid.") from exc

        if claims.get("token_use") != expected_use:
            raise UnauthenticatedError(f"Expected a {expected_use} token.")

        audience = claims.get("client_id") if expected_use == "access" else claims.get("aud")
        if audience != self._client_id:
            raise UnauthenticatedError("The token was issued for a different client.")

        return principal_from_claims(claims)


def principal_from_claims(claims: dict[str, Any]) -> Principal:
    groups = tuple(claims.get("cognito:groups") or ())
    return Principal(
        subject=str(claims["sub"]),
        username=str(claims.get("username") or claims.get("cognito:username") or claims["sub"]),
        email=claims.get("email"),
        groups=groups,
        org_id=claims.get("custom:tenant_id"),
        role=claims.get("custom:role") or (groups[0] if groups else None),
        token_use=str(claims.get("token_use", "access")),
        client_id=claims.get("client_id") or claims.get("aud"),
        expires_at=int(claims.get("exp", 0)),
        raw_claims=claims,
    )
