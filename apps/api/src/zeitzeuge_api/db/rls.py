"""Row-level security and grants for the migrations after `0001`.

`0001` wrote its policies inline; every later revision has the same shape — a
list of tenant tables, ENABLE + FORCE, four policies against
`current_setting('app.org_id', true)`, and grants to the application role — so
it lives here once. Postgres only: on SQLite the callers skip it.
"""

from __future__ import annotations

from collections.abc import Iterable

from alembic import op

APP_ROLE = "zeitzeuge_app"
TENANT_MATCH = "org_id::text = current_setting('app.org_id', true)"
IS_WORKER = "current_setting('app.role', true) = 'worker'"


def enable_tenant_rls(tables: Iterable[str], *, append_only: Iterable[str] = ()) -> None:
    """ENABLE + FORCE RLS with tenant policies on each table.

    Tables in `append_only` get SELECT and INSERT policies only: the ledger and
    the version history are never amended by the application, so there is no
    UPDATE or DELETE policy to abuse.
    """
    frozen = set(append_only)
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_tenant_select ON {table} FOR SELECT USING ({TENANT_MATCH})"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_insert ON {table} FOR INSERT WITH CHECK ({TENANT_MATCH})"
        )
        if table in frozen:
            continue
        op.execute(
            f"CREATE POLICY {table}_tenant_update ON {table} FOR UPDATE "
            f"USING ({TENANT_MATCH}) WITH CHECK ({TENANT_MATCH})"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_delete ON {table} FOR DELETE USING ({TENANT_MATCH})"
        )


def grant_app(tables: Iterable[str], privileges: str) -> None:
    """Grant `privileges` on `tables` to the application role, if it exists.

    Same `DO` guard as `0001`: the role is created by the migrate task's
    `db/roles.py` and may be absent on a laptop.
    """
    names = ", ".join(tables)
    # Identifiers come from the migration files, never from input.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                GRANT {privileges} ON {names} TO {APP_ROLE};
            END IF;
        END
        $$;
        """  # noqa: S608
    )


def is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"
