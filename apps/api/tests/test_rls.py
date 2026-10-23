"""Cross-tenant isolation, proved in the database.

§9.4 claims an archive's rows are unreachable from another archive's session
*in PostgreSQL*, not in the application. A claim like that is worth exactly as
much as the test that tries to break it, so this suite:

* creates two archives and a user in each;
* opens a transaction as archive A and tries to read, update and delete
  archive B's rows;
* asserts that every one of those returns nothing or changes nothing;
* asserts that the audit log cannot be amended at all.

It needs a real PostgreSQL and a **non-superuser** role: superusers and roles
with `BYPASSRLS` ignore every policy, which is the most common way a suite like
this passes while production leaks.

    docker compose up -d db
    ZZ_TEST_POSTGRES_DSN=postgresql+asyncpg://zeitzeuge:zeitzeuge@localhost:5432/zeitzeuge \
      poetry run pytest -m integration
"""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, ProgrammingError

from zeitzeuge_api.core.config import Settings
from zeitzeuge_api.db.models import (
    AuditLog,
    Base,
    Organization,
    OrganizationKind,
    User,
    UserRole,
    UserStatus,
)
from zeitzeuge_api.db.session import Database, TenantContext, create_engine

pytestmark = pytest.mark.integration

DSN = os.environ.get("ZZ_TEST_POSTGRES_DSN", "")


@pytest.fixture
async def pg() -> Database:
    if not DSN:
        pytest.skip("set ZZ_TEST_POSTGRES_DSN to run the isolation tests")

    settings = Settings(database_dsn=DSN, env="local")
    database = Database(create_engine(DSN, settings))

    async with database.engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
        # The policies live in the migration; apply that part here so the test
        # exercises the same SQL that ships.
        from tests._policies import apply_policies

        await apply_policies(connection)

    is_super = False
    async with database.engine.connect() as connection:
        result = await connection.execute(text("SELECT current_setting('is_superuser')"))
        is_super = result.scalar_one() == "on"
    if is_super:
        pytest.skip(
            "connect as a non-superuser: a superuser bypasses every RLS policy, "
            "so this test would pass without proving anything"
        )

    yield database
    await database.dispose()


async def _seed(database: Database) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    async with database.session(TenantContext.bootstrap()) as session:
        schwyz = Organization(
            slug="schwyz", name="Staatsarchiv Schwyz", kind=OrganizationKind.ARCHIVE
        )
        zug = Organization(slug="zug", name="Staatsarchiv Zug", kind=OrganizationKind.ARCHIVE)
        session.add_all([schwyz, zug])
        await session.flush()

        session.add_all(
            [
                User(
                    org_id=schwyz.id,
                    cognito_sub="sub-schwyz",
                    cognito_username="a@sz.ch",
                    email="a@sz.ch",
                    full_name="Andrea Betschart",
                    role=UserRole.ARCHIVIST,
                    status=UserStatus.ACTIVE,
                ),
                User(
                    org_id=zug.id,
                    cognito_sub="sub-zug",
                    cognito_username="b@zg.ch",
                    email="b@zg.ch",
                    full_name="Beat Zürcher",
                    role=UserRole.ARCHIVIST,
                    status=UserStatus.ACTIVE,
                ),
            ]
        )
        await session.flush()
        zug_user = await session.scalar(select(User).where(User.email == "b@zg.ch"))
        assert zug_user is not None
        return schwyz.id, zug.id, zug_user.id


async def test_another_archive_is_invisible(pg: Database) -> None:
    schwyz_id, _, _ = await _seed(pg)

    async with pg.session(TenantContext(org_id=schwyz_id, role="archivist")) as session:
        rows = list(await session.scalars(select(User)))

    assert [row.email for row in rows] == ["a@sz.ch"]


async def test_another_archives_row_cannot_be_updated(pg: Database) -> None:
    schwyz_id, _, zug_user_id = await _seed(pg)

    async with pg.session(TenantContext(org_id=schwyz_id, role="admin")) as session:
        result = await session.execute(
            text("UPDATE users SET role = 'admin' WHERE id = :id"), {"id": str(zug_user_id)}
        )
        assert result.rowcount == 0

        deleted = await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(zug_user_id)}
        )
        assert deleted.rowcount == 0


async def test_a_row_cannot_be_inserted_into_another_archive(pg: Database) -> None:
    schwyz_id, zug_id, _ = await _seed(pg)

    with pytest.raises((DBAPIError, ProgrammingError)):
        async with pg.session(TenantContext(org_id=schwyz_id, role="admin")) as session:
            session.add(
                User(
                    org_id=zug_id,
                    cognito_sub="sub-smuggled",
                    cognito_username="c@sz.ch",
                    email="c@sz.ch",
                    full_name="Geschmuggelt",
                    role=UserRole.ADMIN,
                    status=UserStatus.ACTIVE,
                )
            )
            await session.flush()


async def test_an_anonymous_session_sees_nothing(pg: Database) -> None:
    await _seed(pg)
    async with pg.session() as session:
        assert list(await session.scalars(select(User))) == []


async def test_the_audit_log_can_be_appended_to_and_nothing_else(pg: Database) -> None:
    """Two layers refuse the rewrite, and the outer one refuses it first.

    The grant is checked before any policy, so amending the trail raises
    `InsufficientPrivilege` rather than quietly matching zero rows. Both are a
    refusal; this one is the better error to find in a log.
    """
    schwyz_id, _, _ = await _seed(pg)

    async with pg.session(TenantContext(org_id=schwyz_id, role="admin")) as session:
        session.add(AuditLog(org_id=schwyz_id, action="user.login"))
        await session.flush()

    for statement in (
        "UPDATE audit_log SET action = 'nothing.happened'",
        "DELETE FROM audit_log",
    ):
        with pytest.raises((DBAPIError, ProgrammingError)) as caught:
            async with pg.session(TenantContext(org_id=schwyz_id, role="admin")) as session:
                await session.execute(text(statement))
        assert "permission denied" in str(caught.value).lower()

    # And the entry is still there, readable by the archive that made it.
    async with pg.session(TenantContext(org_id=schwyz_id, role="admin")) as session:
        rows = list(await session.scalars(select(AuditLog)))
    assert [row.action for row in rows] == ["user.login"]
