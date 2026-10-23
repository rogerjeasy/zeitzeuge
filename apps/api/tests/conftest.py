"""Test fixtures.

The suite runs against **moto** — the real `cognito-idp`, `s3` and `dynamodb`
APIs, in process — and SQLite. That combination is a deliberate trade:

* The AWS calls are exercised for real, including parameter shapes, so a typo
  in a `SecretHash` or a presigned-POST condition fails here rather than at
  03:00 on the Saturday.
* The database is SQLite, so the suite is a one-second `pytest` with no Docker.
  Row-level security cannot be tested on SQLite, and those tests are marked
  `integration` and run against Postgres — see `tests/test_rls.py`.

No test reaches the network. The JWKS fetch is replaced with a key generated
here, which is also how the token tests can forge a token and prove it is
rejected.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest

os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-central-2")

REGION = "eu-central-2"
BUCKET = "zeitzeuge-test-assets"
RATE_TABLE = "zeitzeuge-test-rate-limit"


@pytest.fixture(scope="session")
def aws():
    """One moto backend for the whole session."""
    from moto import mock_aws

    with mock_aws():
        yield


@pytest.fixture(scope="session")
def aws_resources(aws) -> dict[str, str]:
    """A user pool, an app client, a bucket and a rate-limit table."""
    import boto3

    cognito = boto3.client("cognito-idp", region_name=REGION)
    pool = cognito.create_user_pool(
        PoolName="zeitzeuge-test",
        UsernameAttributes=["email"],
        AutoVerifiedAttributes=["email"],
        Policies={
            "PasswordPolicy": {
                "MinimumLength": 8,
                "RequireUppercase": True,
                "RequireLowercase": True,
                "RequireNumbers": True,
                "RequireSymbols": True,
            }
        },
        Schema=[
            {"Name": "tenant_id", "AttributeDataType": "String", "Mutable": True},
            {"Name": "role", "AttributeDataType": "String", "Mutable": True},
        ],
    )
    pool_id = pool["UserPool"]["Id"]

    client = cognito.create_user_pool_client(
        UserPoolId=pool_id,
        ClientName="web",
        # No client secret in the test pool: SECRET_HASH is covered by a unit
        # test against the real algorithm instead of relying on moto's view of
        # it. The deployed client does have one.
        GenerateSecret=False,
        ExplicitAuthFlows=[
            "ALLOW_ADMIN_USER_PASSWORD_AUTH",
            "ALLOW_REFRESH_TOKEN_AUTH",
        ],
        PreventUserExistenceErrors="ENABLED",
    )
    for group in ("admin", "archivist", "reviewer", "operator", "reader", "guest"):
        cognito.create_group(GroupName=group, UserPoolId=pool_id)

    s3 = boto3.client("s3", region_name=REGION)
    s3.create_bucket(
        Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION}
    )

    dynamodb = boto3.client("dynamodb", region_name=REGION)
    dynamodb.create_table(
        TableName=RATE_TABLE,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )

    return {
        "user_pool_id": pool_id,
        "client_id": client["UserPoolClient"]["ClientId"],
        "bucket": BUCKET,
        "rate_table": RATE_TABLE,
    }


@pytest.fixture(scope="session")
def settings(aws_resources, tmp_path_factory):
    from zeitzeuge_api.core.config import Settings, get_settings

    database = tmp_path_factory.mktemp("db") / "zeitzeuge.sqlite"
    values = {
        # Pinned explicitly, because a developer's `.env` points these at a
        # local Postgres and a local moto. A test run must not depend on, or be
        # broken by, what happens to be in the working directory.
        "ZZ_AWS_ENDPOINT_URL": "",
        "ZZ_ENV": "local",
        "ZZ_REGION": REGION,
        "ZZ_LOG_LEVEL": "WARNING",
        "ZZ_COGNITO_USER_POOL_ID": aws_resources["user_pool_id"],
        "ZZ_COGNITO_CLIENT_ID": aws_resources["client_id"],
        "ZZ_COGNITO_CLIENT_SECRET_REF": "",
        "ZZ_ASSETS_BUCKET": aws_resources["bucket"],
        "ZZ_ASSETS_KMS_KEY_ID": "",
        "ZZ_RATE_LIMIT_TABLE": "",  # in-memory: see `limiter` below
        "ZZ_DATABASE_DSN": f"sqlite+aiosqlite:///{database}",
        "ZZ_GUEST_USERNAME": "demo@zeitzeuge.ch",
    }
    for key, value in values.items():
        os.environ[key] = value

    get_settings.cache_clear()
    # `_env_file=None`: the suite reads its configuration from the environment
    # it just set, never from a `.env` on disk.
    yield Settings(_env_file=None)
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def no_network(monkeypatch, rsa_keys):
    """Replace the JWKS fetch with the key this suite signs with."""
    from jwt import PyJWKSet

    from zeitzeuge_api.core.security import JWKSCache

    async def _fetch(self) -> PyJWKSet:  # type: ignore[no-untyped-def]
        return PyJWKSet.from_dict({"keys": [rsa_keys["jwk"]]})

    monkeypatch.setattr(JWKSCache, "_fetch", _fetch)


@pytest.fixture(scope="session")
def rsa_keys() -> dict:
    """A signing key for forging and verifying tokens in tests."""
    import json

    from cryptography.hazmat.primitives.asymmetric import rsa
    from jwt.algorithms import RSAAlgorithm

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": "test-key", "use": "sig", "alg": "RS256"})
    return {"private": private_key, "jwk": jwk, "kid": "test-key"}


@pytest.fixture
async def app(settings):
    """The real application, with its real lifespan, on the test settings."""
    from zeitzeuge_api.db.models import Base
    from zeitzeuge_api.main import create_app

    application = create_app(settings)
    async with application.router.lifespan_context(application):
        engine = application.state.database.engine
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        yield application
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client(app) -> AsyncIterator:
    import httpx

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="https://api.test",
        # A plausible browser, so session rows carry a device label a human
        # would recognise in `/settings/security`.
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Firefox/130.0"},
    ) as http_client:
        yield http_client


@pytest.fixture(autouse=True)
def reset_rate_limits(app):
    """Each test starts with an empty limiter, or the fifth one gets a 429."""
    app.state.limiter._local.clear()
    yield
    app.state.limiter._local.clear()


# --- helpers ---------------------------------------------------------------


@pytest.fixture
def cognito_client():
    import boto3

    return boto3.client("cognito-idp", region_name=REGION)


@pytest.fixture
def unique_email() -> str:
    return f"a.betschart+{uuid.uuid4().hex[:8]}@sz.ch"


PASSWORD = "Gletscher-1893!"


@pytest.fixture
async def registered(client, cognito_client, settings, unique_email) -> dict:
    """A registered, confirmed archivist, with the founder's admin role."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": PASSWORD,
            "password_confirmation": PASSWORD,
            "full_name": "Andrea Betschart",
            "organization_name": "Staatsarchiv Schwyz",
            "canton": "SZ",
            "job_title": "Archivarin",
            "locale": "de",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201, response.text

    cognito_client.admin_confirm_sign_up(
        UserPoolId=settings.cognito_user_pool_id, Username=unique_email
    )
    return {"email": unique_email, "password": PASSWORD, **response.json()}


@pytest.fixture
async def signed_in(client, registered) -> dict:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": registered["email"], "password": registered["password"]},
    )
    assert response.status_code == 200, response.text
    tokens = response.json()["tokens"]
    return {**registered, "tokens": tokens}


@pytest.fixture
async def as_user(app, client, signed_in):
    """Authenticate subsequent requests as the signed-in archivist.

    The identity dependency is overridden rather than the token verified,
    because moto's tokens are not signed by the key this suite controls.
    Verification itself is covered directly in `test_security.py`.
    """
    from sqlalchemy import select

    from zeitzeuge_api.api.deps import Identity, resolve_identity
    from zeitzeuge_api.core.context import RequestContext
    from zeitzeuge_api.core.security import Principal
    from zeitzeuge_api.db.models import Organization, User
    from zeitzeuge_api.db.session import TenantContext

    database = app.state.database

    async def _override():
        async with database.session(TenantContext.bootstrap()) as session:
            user = await session.scalar(
                select(User).where(User.email == signed_in["email"])
            )
            assert user is not None
            organization = await session.get(Organization, user.org_id)
            assert organization is not None
            yield Identity(
                principal=Principal(
                    subject=user.cognito_sub,
                    username=user.cognito_username,
                    email=user.email,
                    org_id=str(user.org_id),
                    role=str(user.role),
                ),
                user=user,
                organization=organization,
                session=session,
                context=RequestContext(
                    request_id="test",
                    ip_address="198.51.100.7",
                    user_agent="Mozilla/5.0 (Windows NT 10.0) Firefox/130.0",
                    session_id=signed_in["tokens"]["session_id"],
                ),
                access_token=signed_in["tokens"]["access_token"],
            )

    app.dependency_overrides[resolve_identity] = _override
    client.headers["Authorization"] = "Bearer test-token"
    yield signed_in
    app.dependency_overrides.pop(resolve_identity, None)
