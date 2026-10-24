"""The application's database role, provisioned by the migration.

The API connects as `zeitzeuge_app`: a login role that is *not* a superuser
and does *not* have BYPASSRLS — either would make every row-level-security
policy decorative. The migrate task runs as Aurora's master user and receives
the role's credential by reference (`ZZ_APP_DB_SECRET_REF`); this creates the
role, or re-syncs its password after a rotation, before the schema migrations
grant it anything.

Roles cannot take bind parameters, so the password is quoted by Postgres
itself (`quote_literal`) and additionally restricted to the alphabet Secrets
Manager generates for it — a value that needs quoting is refused, not quoted.
"""

from __future__ import annotations

import re

from sqlalchemy import Connection, text

APP_ROLE = "zeitzeuge_app"

_PASSWORD = re.compile(r"[A-Za-z0-9]{32,128}")
_IDENTIFIER = re.compile(r"[a-z_][a-z0-9_]{0,62}")

_CREATE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT"
# Aurora's master user is `rds_superuser`, not a superuser: it may create a role
# with these attributes but may not *alter* SUPERUSER or BYPASSRLS afterwards.
# A re-sync therefore changes only what it may, and then verifies the rest.
_ALTER_ATTRIBUTES = "LOGIN"


class RoleProvisioningError(RuntimeError):
    """Raised without the failing statement: that statement carries the password."""


def provision_app_role(connection: Connection, password: str, *, role: str = APP_ROLE) -> None:
    """Create or re-sync `role`. Idempotent; runs inside the caller's transaction."""
    if not _PASSWORD.fullmatch(password):
        raise ValueError("the application role's password must be 32-128 alphanumerics")
    if not _IDENTIFIER.fullmatch(role):
        raise ValueError("not a plain role name")

    exists = connection.execute(
        text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}
    ).scalar()
    literal = connection.execute(text("SELECT quote_literal(:p)"), {"p": password}).scalar_one()
    verb, attributes = ("ALTER", _ALTER_ATTRIBUTES) if exists else ("CREATE", _CREATE_ATTRIBUTES)
    try:
        connection.exec_driver_sql(f"{verb} ROLE {role} WITH {attributes} PASSWORD {literal}")
    except Exception as exc:
        # `from None`: the driver's message quotes the SQL, password included,
        # and this lands in CloudWatch. The SQLSTATE is enough to act on.
        state = getattr(getattr(exc, "orig", None), "sqlstate", None) or type(exc).__name__
        raise RoleProvisioningError(f"{verb} ROLE {role} failed ({state})") from None

    unsafe = connection.execute(
        text(
            "SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb "
            "FROM pg_roles WHERE rolname = :role"
        ),
        {"role": role},
    ).scalar_one()
    if unsafe:
        # Every RLS policy is decorative for such a role; refuse to deploy on it.
        raise RoleProvisioningError(f"{role} holds SUPERUSER, BYPASSRLS, CREATEROLE or CREATEDB")

    database = connection.execute(text("SELECT quote_ident(current_database())")).scalar_one()
    connection.exec_driver_sql(f"GRANT CONNECT ON DATABASE {database} TO {role}")
    # USAGE only: the application never creates objects. Table privileges are
    # granted by the migrations, table by table.
    connection.exec_driver_sql(f"GRANT USAGE ON SCHEMA public TO {role}")
