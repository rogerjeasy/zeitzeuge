"""The migration provisions the application's database role itself.

Terraform hands the migrate task `ZZ_APP_DB_SECRET_REF`. Before this, nothing
read it: on a fresh Aurora the role did not exist, the migration's grants were
skipped by their `IF EXISTS` guard, the migration *succeeded*, and the API then
could not connect. These tests run against a real Postgres as a superuser —
the same standing as Aurora's master user in the migrate task.
"""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from zeitzeuge_api.db.roles import provision_app_role

pytestmark = pytest.mark.integration

ADMIN_DSN = os.environ.get("ZZ_TEST_POSTGRES_ADMIN_DSN", "")
PASSWORD = "A" * 16 + "b1" * 10


@pytest.fixture
async def admin():
    if not ADMIN_DSN:
        pytest.skip("set ZZ_TEST_POSTGRES_ADMIN_DSN (a superuser) to run the role tests")
    engine = create_async_engine(ADMIN_DSN)
    role = f"zz_probe_{uuid.uuid4().hex[:8]}"
    yield engine, role
    async with engine.begin() as connection:
        exists = (
            await connection.execute(
                text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}
            )
        ).scalar()
        if exists:
            database = (await connection.execute(text("SELECT current_database()"))).scalar_one()
            await connection.exec_driver_sql(f'REVOKE ALL ON DATABASE "{database}" FROM {role}')
            await connection.exec_driver_sql(f"REVOKE ALL ON SCHEMA public FROM {role}")
            await connection.exec_driver_sql(f"DROP ROLE {role}")
    await engine.dispose()


async def _attributes(engine, role: str) -> tuple:
    async with engine.connect() as connection:
        row = await connection.execute(
            text(
                "SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole "
                "FROM pg_roles WHERE rolname = :role"
            ),
            {"role": role},
        )
        return tuple(row.one())


async def test_creates_a_login_role_that_cannot_bypass_rls(admin) -> None:
    engine, role = admin
    async with engine.begin() as connection:
        await connection.run_sync(provision_app_role, PASSWORD, role=role)

    # Can log in; is not a superuser; cannot bypass RLS; cannot create
    # databases or roles. A superuser or BYPASSRLS role ignores every policy.
    assert await _attributes(engine, role) == (True, False, False, False, False)

    url = engine.url.set(username=role, password=PASSWORD)
    probe = create_async_engine(url)
    async with probe.connect() as connection:
        assert (await connection.execute(text("SELECT current_user"))).scalar_one() == role
    await probe.dispose()


async def test_is_idempotent_and_rotates_the_password(admin) -> None:
    engine, role = admin
    rotated = "Z" * 16 + "y9" * 10
    async with engine.begin() as connection:
        await connection.run_sync(provision_app_role, PASSWORD, role=role)
    async with engine.begin() as connection:
        await connection.run_sync(provision_app_role, rotated, role=role)

    probe = create_async_engine(engine.url.set(username=role, password=rotated))
    async with probe.connect() as connection:
        assert (await connection.execute(text("SELECT 1"))).scalar_one() == 1
    await probe.dispose()


@pytest.mark.parametrize("password", ["short", "x' SUPERUSER --" + "a" * 32, "a" * 31])
async def test_refuses_a_password_it_would_have_to_quote(admin, password) -> None:
    engine, role = admin
    async with engine.begin() as connection:
        with pytest.raises(ValueError):
            await connection.run_sync(provision_app_role, password, role=role)
