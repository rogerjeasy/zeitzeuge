"""Registration and sign-in, end to end against a real Cognito API (moto)."""

from __future__ import annotations

from sqlalchemy import select

from zeitzeuge_api.db.models import AuditLog, Organization, User, UserRole, UserSession, UserStatus
from zeitzeuge_api.db.session import TenantContext

PASSWORD = "Gletscher-1893!"


async def _rows(app, statement):
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        return list(await session.scalars(statement))


async def test_register_creates_tenant_and_pending_user(client, app, unique_email) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": PASSWORD,
            "full_name": "Andrea Betschart",
            "organization_name": "Staatsarchiv Schwyz",
            "canton": "SZ",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201, response.text

    users = await _rows(app, select(User).where(User.email == unique_email))
    assert len(users) == 1
    user = users[0]
    # The founder administers the tenant they created; nobody else does yet.
    assert user.role is UserRole.ADMIN
    assert user.status is UserStatus.PENDING
    assert user.email_verified is False

    organizations = await _rows(app, select(Organization).where(Organization.id == user.org_id))
    assert organizations[0].name == "Staatsarchiv Schwyz"
    assert organizations[0].canton == "SZ"

    actions = [row.action for row in await _rows(app, select(AuditLog))]
    assert "user.registered" in actions


async def test_register_rejects_a_weak_password(client, unique_email) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": "passwort",
            "full_name": "Andrea Betschart",
            "accept_terms": True,
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_failed"
    # The submitted value must never be echoed back — it is a password.
    assert "passwort" not in response.text


async def test_register_requires_accepting_the_terms(client, unique_email) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": PASSWORD,
            "full_name": "Andrea Betschart",
            "accept_terms": False,
        },
    )
    assert response.status_code == 422


async def test_registering_twice_reports_the_conflict(client, registered) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": registered["email"],
            "password": PASSWORD,
            "full_name": "Andrea Betschart",
            "accept_terms": True,
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "email_in_use"


async def test_colleague_joins_by_verified_domain(client, app, registered) -> None:
    """The second person at `@sz.ch` lands in the same archive, as a reviewer."""
    colleague = "m.reichmuth@sz.ch"
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": colleague,
            "password": PASSWORD,
            "full_name": "Marco Reichmuth",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201, response.text

    users = await _rows(app, select(User).where(User.email.in_([registered["email"], colleague])))
    by_email = {user.email: user for user in users}
    assert by_email[colleague].org_id == by_email[registered["email"]].org_id
    # Least privilege: joining a tenant does not make you its administrator.
    assert by_email[colleague].role is UserRole.REVIEWER


async def test_public_mailbox_never_joins_an_existing_tenant(client, app, registered) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "someone@gmail.com",
            "password": PASSWORD,
            "full_name": "Jemand Anders",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201

    users = await _rows(app, select(User).where(User.email == "someone@gmail.com"))
    others = await _rows(app, select(User).where(User.email == registered["email"]))
    assert users[0].org_id != others[0].org_id


async def test_login_issues_tokens_and_opens_a_session(client, app, registered) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": registered["email"], "password": registered["password"]},
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0) Firefox/130.0"},
    )
    assert response.status_code == 200, response.text
    tokens = response.json()["tokens"]
    assert tokens["access_token"] and tokens["id_token"] and tokens["session_id"]

    sessions = await _rows(app, select(UserSession))
    assert len(sessions) == 1
    assert sessions[0].device_label == "Firefox · Windows"
    assert sessions[0].revoked_at is None

    actions = [row.action for row in await _rows(app, select(AuditLog))]
    assert "user.login" in actions


async def test_login_with_the_wrong_password(client, app, registered) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": registered["email"], "password": "Falsch-1893!"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"

    actions = [row.action for row in await _rows(app, select(AuditLog))]
    assert "user.login_failed" in actions


async def test_unknown_address_is_indistinguishable(client, app, registered) -> None:
    """An attacker must not be able to enumerate the archive's staff list."""
    known = await client.post(
        "/api/v1/auth/login",
        json={"email": registered["email"], "password": "Falsch-1893!"},
    )
    unknown = await client.post(
        "/api/v1/auth/login",
        json={"email": "niemand@sz.ch", "password": "Falsch-1893!"},
    )
    assert known.status_code == unknown.status_code == 401
    assert known.json()["code"] == unknown.json()["code"]
    assert known.json()["detail"] == unknown.json()["detail"]


async def test_forgot_password_never_confirms_an_address(client) -> None:
    for email in ("a.betschart@sz.ch", "niemand-hier@sz.ch"):
        response = await client.post("/api/v1/auth/password/forgot", json={"email": email})
        assert response.status_code == 202
        assert response.json()["status"] == "accepted"


async def test_refresh_requires_a_known_session(client, signed_in) -> None:
    response = await client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": signed_in["tokens"].get("refresh_token") or "whatever",
            "session_id": "00000000-0000-0000-0000-000000000000",
        },
    )
    assert response.status_code == 401


async def test_every_error_is_a_problem_document(client) -> None:
    response = await client.post(
        "/api/v1/auth/login", json={"email": "not-an-address", "password": "x"}
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert {"type", "title", "status", "detail", "code", "request_id"} <= body.keys()
    assert response.headers["X-Request-Id"] == body["request_id"]


async def test_security_headers_are_present(client) -> None:
    response = await client.get("/healthz")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cache-Control"] == "no-store"


async def test_a_database_outage_is_a_503_not_a_500(client, app, monkeypatch) -> None:
    """The client should be told to retry, not that something went wrong."""

    def _refuse(*args, **kwargs):
        raise ConnectionRefusedError("connection refused")

    monkeypatch.setattr(app.state.database, "session", _refuse)

    response = await client.post(
        "/api/v1/auth/login", json={"email": "a.betschart@sz.ch", "password": "Gletscher-1893!"}
    )
    assert response.status_code == 503
    assert response.json()["code"] == "database_unavailable"
    assert response.headers["Retry-After"]


async def test_the_docs_page_may_load_swagger_ui(client) -> None:
    """A `default-src 'none'` policy renders /docs blank, with a 200 beside it.

    The failure has no error anywhere on the server, so it is pinned here: the
    documentation page must permit the CDN its own generated HTML references.
    """
    response = await client.get("/docs")
    assert response.status_code == 200
    csp = response.headers["Content-Security-Policy"]
    assert "https://cdn.jsdelivr.net" in csp
    assert "frame-ancestors 'none'" in csp
    assert "cdn.jsdelivr.net" in response.text  # FastAPI still points there


async def test_api_responses_keep_the_strict_policy(client) -> None:
    response = await client.get("/healthz")
    expected = "default-src 'none'; frame-ancestors 'none'"
    assert response.headers["Content-Security-Policy"] == expected
