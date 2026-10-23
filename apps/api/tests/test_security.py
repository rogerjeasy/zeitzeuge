"""Token verification: what must be accepted, and everything that must not."""

from __future__ import annotations

import time

import jwt
import pytest

from zeitzeuge_api.core.errors import TokenExpiredError, UnauthenticatedError
from zeitzeuge_api.core.security import JWKSCache, TokenVerifier

ISSUER = "https://cognito-idp.eu-central-2.amazonaws.com/eu-central-2_TEST"
CLIENT_ID = "test-client-id"


def make_token(rsa_keys, **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "11111111-2222-3333-4444-555555555555",
        "iss": ISSUER,
        "client_id": CLIENT_ID,
        "token_use": "access",
        "username": "a.betschart@sz.ch",
        "cognito:groups": ["archivist"],
        "custom:tenant_id": "99999999-8888-7777-6666-555555555555",
        "custom:role": "archivist",
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode(
        claims, rsa_keys["private"], algorithm="RS256", headers={"kid": rsa_keys["kid"]}
    )


@pytest.fixture
def verifier() -> TokenVerifier:
    return TokenVerifier(
        jwks=JWKSCache(f"{ISSUER}/.well-known/jwks.json"),
        issuer=ISSUER,
        client_id=CLIENT_ID,
    )


async def test_valid_access_token(verifier, rsa_keys) -> None:
    principal = await verifier.verify(make_token(rsa_keys), expected_use="access")
    assert principal.subject.endswith("555555555555")
    assert principal.role == "archivist"
    assert principal.org_id == "99999999-8888-7777-6666-555555555555"
    assert principal.has_any_role("archivist", "admin")


async def test_a_token_without_iat_is_accepted(verifier, rsa_keys) -> None:
    """The claims aws-jwt-verify checks, no more: the local emulator omits `iat`."""
    token = make_token(rsa_keys)
    claims = jwt.decode(token, options={"verify_signature": False})
    claims.pop("iat")
    token = jwt.encode(
        claims, rsa_keys["private"], algorithm="RS256", headers={"kid": rsa_keys["kid"]}
    )
    principal = await verifier.verify(token, expected_use="access")
    assert principal.role == "archivist"


@pytest.mark.parametrize("claim", ["exp", "sub", "token_use"])
async def test_a_token_missing_a_required_claim_is_refused(verifier, rsa_keys, claim) -> None:
    claims = jwt.decode(make_token(rsa_keys), options={"verify_signature": False})
    claims.pop(claim)
    token = jwt.encode(
        claims, rsa_keys["private"], algorithm="RS256", headers={"kid": rsa_keys["kid"]}
    )
    with pytest.raises(UnauthenticatedError):
        await verifier.verify(token, expected_use="access")


async def test_id_token_is_not_an_authorisation(verifier, rsa_keys) -> None:
    """The single most common hole in a Cognito integration."""
    token = make_token(rsa_keys, token_use="id", aud=CLIENT_ID)
    with pytest.raises(UnauthenticatedError):
        await verifier.verify(token, expected_use="access")


async def test_expired_token(verifier, rsa_keys) -> None:
    past = int(time.time()) - 7200
    with pytest.raises(TokenExpiredError):
        await verifier.verify(
            make_token(rsa_keys, iat=past, exp=past + 60), expected_use="access"
        )


async def test_another_pools_token(verifier, rsa_keys) -> None:
    other = "https://cognito-idp.eu-central-2.amazonaws.com/eu-central-2_OTHER"
    with pytest.raises(UnauthenticatedError):
        await verifier.verify(make_token(rsa_keys, iss=other), expected_use="access")


async def test_another_clients_token(verifier, rsa_keys) -> None:
    with pytest.raises(UnauthenticatedError):
        await verifier.verify(
            make_token(rsa_keys, client_id="someone-else"), expected_use="access"
        )


async def test_unsigned_token_is_refused(verifier, rsa_keys) -> None:
    """`alg: none` is the oldest trick there is."""
    claims = jwt.decode(
        make_token(rsa_keys), options={"verify_signature": False}
    )
    forged = jwt.encode(claims, key="", algorithm="none")
    with pytest.raises(UnauthenticatedError):
        await verifier.verify(forged, expected_use="access")


async def test_unknown_key(verifier, rsa_keys) -> None:
    token = jwt.encode(
        {"sub": "x", "iss": ISSUER, "token_use": "access", "exp": int(time.time()) + 60},
        rsa_keys["private"],
        algorithm="RS256",
        headers={"kid": "a-key-that-was-never-published"},
    )
    with pytest.raises(UnauthenticatedError):
        await verifier.verify(token, expected_use="access")


@pytest.mark.parametrize(
    "header", ["", "Basic YTpi", "Bearer", "Bearer    ", "token abc.def"]
)
async def test_only_a_bearer_credential_is_accepted(client, header) -> None:
    """Anything that is not `Authorization: Bearer <token>` is unauthenticated."""
    response = await client.get("/api/v1/users/me", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_the_openapi_document_declares_the_scheme(client) -> None:
    """Without this, /docs has no Authorize button and cannot be driven by hand."""
    document = (await client.get("/openapi.json")).json()
    schemes = document["components"]["securitySchemes"]
    assert schemes["bearerAuth"]["type"] == "http"
    assert schemes["bearerAuth"]["scheme"] == "bearer"
    assert "security" in document["paths"]["/api/v1/users/me"]["get"]


async def test_an_unreachable_key_set_is_an_upstream_failure(monkeypatch) -> None:
    """The caller can retry a 502; an unhandled 500 tells them nothing."""
    import httpx

    from zeitzeuge_api.core.errors import UpstreamError

    async def _unreachable(self) -> None:  # type: ignore[no-untyped-def]
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(JWKSCache, "_fetch", _unreachable)
    with pytest.raises(UpstreamError):
        await JWKSCache("https://example.invalid/jwks.json").get_key("any")
