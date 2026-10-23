"""Machine credentials: issued once, never recoverable, never wider than their owner."""

from __future__ import annotations

from sqlalchemy import select

from zeitzeuge_api.db.models import ApiKey
from zeitzeuge_api.db.session import TenantContext
from zeitzeuge_api.services.api_key_service import KEY_PREFIX


async def test_create_shows_the_secret_exactly_once(as_user, client, app) -> None:
    created = await client.post(
        "/api/v1/api-keys", json={"name": "OAI-PMH Harvester", "scope": "read"}
    )
    assert created.status_code == 201, created.text
    body = created.json()
    secret = body["secret"]
    assert secret.startswith(KEY_PREFIX)
    assert body["prefix"] == secret[: len(KEY_PREFIX) + 4]

    listed = (await client.get("/api/v1/api-keys")).json()
    assert len(listed) == 1
    assert "secret" not in listed[0]

    # And the plaintext is nowhere in the database.
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        rows = list(await session.scalars(select(ApiKey)))
    assert rows[0].token_hash != secret
    assert len(rows[0].token_hash) == 64
    assert secret not in rows[0].token_hash


async def test_authenticate_resolves_the_owner(as_user, client, app) -> None:
    secret = (
        await client.post("/api/v1/api-keys", json={"name": "Import", "scope": "write"})
    ).json()["secret"]

    service = app.state.api_key_service
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        user, key = await service.authenticate(session, token=secret)
        assert user.email == as_user["email"]
        assert key.last_used_at is not None


async def test_a_revoked_key_stops_working(as_user, client, app) -> None:
    created = (
        await client.post("/api/v1/api-keys", json={"name": "Temporär", "scope": "read"})
    ).json()

    revoked = await client.delete(f"/api/v1/api-keys/{created['id']}")
    assert revoked.status_code == 204
    assert (await client.get("/api/v1/api-keys")).json() == []

    from zeitzeuge_api.core.errors import UnauthenticatedError

    service = app.state.api_key_service
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        try:
            await service.authenticate(session, token=created["secret"])
        except UnauthenticatedError:
            pass
        else:  # pragma: no cover - the assertion is the point of the test
            raise AssertionError("a revoked key still authenticated")


async def test_revoking_someone_elses_key_is_a_404(as_user, client) -> None:
    response = await client.delete("/api/v1/api-keys/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_a_key_cannot_mint_another_key(as_user, client, app) -> None:
    """One leaked key must not become a permanent foothold."""
    from sqlalchemy import select as sa_select

    from zeitzeuge_api.api.deps import Identity, resolve_identity
    from zeitzeuge_api.core.context import RequestContext
    from zeitzeuge_api.core.security import Principal
    from zeitzeuge_api.db.models import Organization, User

    database = app.state.database

    async def _as_api_key():
        async with database.session(TenantContext.bootstrap()) as session:
            user = await session.scalar(
                sa_select(User).where(User.email == as_user["email"])
            )
            organization = await session.get(Organization, user.org_id)
            yield Identity(
                principal=Principal(
                    subject=user.cognito_sub,
                    username=user.cognito_username,
                    org_id=str(user.org_id),
                    role=str(user.role),
                    token_use="api_key",
                    via_api_key=True,
                    api_key_scope="write",
                ),
                user=user,
                organization=organization,
                session=session,
                context=RequestContext(request_id="test"),
                access_token=None,
            )

    app.dependency_overrides[resolve_identity] = _as_api_key
    try:
        response = await client.post(
            "/api/v1/api-keys", json={"name": "Zweiter Schlüssel", "scope": "write"}
        )
        assert response.status_code == 403
        # And neither can it change the password on the account.
        password = await client.post(
            "/api/v1/auth/password/change",
            json={"current_password": "Gletscher-1893!", "new_password": "Neues-1893!"},
        )
        assert password.status_code == 403
    finally:
        app.dependency_overrides.pop(resolve_identity, None)
