"""«Start demo»: one private archive per visitor, no form, bounded spend.

The visitor is a real Cognito user (moto) with the archivist role in an
archive of their own, so everything an archivist may do works — and only
inside that archive. Row-level isolation itself is proven against Postgres in
`test_rls*.py`; here the account, the flags and the caps are checked.
"""

# ruff: noqa: F811  (pytest fixture imported from test_investigation_api)
from __future__ import annotations

import uuid

from sqlalchemy import select
from tests.test_investigation_api import investigation  # noqa: F401  (fixture)

from zeitzeuge_api.db.models import AuditLog, Organization, User
from zeitzeuge_api.db.models.enums import AuditAction, OrganizationKind, UserRole, UserStatus
from zeitzeuge_api.db.session import TenantContext
from zeitzeuge_api.services.auth_service import DEMO_EMAIL_DOMAIN


async def test_start_demo_opens_a_private_archive_with_an_archivist(app, client) -> None:
    response = await client.post("/api/v1/auth/demo")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tokens"]["access_token"] and body["tokens"]["session_id"]

    async with app.state.database.session(TenantContext.bootstrap()) as session:
        org = await session.get(Organization, uuid.UUID(body["organization_id"]))
        assert org is not None
        assert org.kind is OrganizationKind.DEMO
        assert org.settings.get("sandbox") is True
        assert org.is_demo is False  # not the shared guest archive
        users = list(await session.scalars(select(User).where(User.org_id == org.id)))
    assert len(users) == 1
    user = users[0]
    assert user.role is UserRole.ARCHIVIST
    assert user.status is UserStatus.ACTIVE
    assert user.email.endswith("@" + DEMO_EMAIL_DOMAIN)

    async with app.state.database.session(TenantContext(org_id=org.id, role="test")) as session:
        actions = set(await session.scalars(select(AuditLog.action)))
    assert {AuditAction.DEMO_SESSION_STARTED, AuditAction.USER_LOGIN} <= {
        AuditAction(a) for a in actions
    }


async def test_every_visitor_gets_an_archive_of_their_own(client) -> None:
    first = (await client.post("/api/v1/auth/demo")).json()
    second = (await client.post("/api/v1/auth/demo")).json()
    assert first["organization_id"] != second["organization_id"]


async def test_demo_archives_are_rate_limited_per_address(client) -> None:
    codes = [(await client.post("/api/v1/auth/demo")).status_code for _ in range(6)]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


async def _make_sandbox(app, email: str) -> None:
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        user = await session.scalar(select(User).where(User.email == email))
        assert user is not None
        org = await session.get(Organization, user.org_id)
        assert org is not None
        org.settings = {**(org.settings or {}), "sandbox": True}


def _files(n: int, start: int = 0) -> dict:
    return {
        "files": [
            {"filename": f"demo-{i}.jpg", "content_type": "image/jpeg", "content_length": 10}
            for i in range(start, start + n)
        ]
    }


async def test_a_sandbox_takes_ten_photos_of_its_own(app, investigation, client, as_user) -> None:
    await _make_sandbox(app, as_user["email"])
    batch = (await client.post("/api/v1/batches", json={"label": "mine"})).json()["id"]
    ok = await client.post(f"/api/v1/batches/{batch}/assets", json=_files(10))
    assert ok.status_code in (200, 201), ok.text
    over = await client.post(f"/api/v1/batches/{batch}/assets", json=_files(1, start=10))
    assert over.status_code == 409
    assert over.json()["code"] == "demo_limit"


async def test_an_ordinary_archive_has_no_demo_cap(investigation, client, as_user) -> None:
    batch = (await client.post("/api/v1/batches", json={"label": "real"})).json()["id"]
    ok = await client.post(f"/api/v1/batches/{batch}/assets", json=_files(11))
    assert ok.status_code in (200, 201), ok.text


def test_the_demo_address_passes_profile_validation() -> None:
    # `.invalid` once made every profile response of a demo account a 500.
    from pydantic import EmailStr, TypeAdapter

    TypeAdapter(EmailStr).validate_python(f"demo-0a1b2c3d4e@{DEMO_EMAIL_DOMAIN}")
