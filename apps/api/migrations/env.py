"""Alembic environment.

Builds the URL from `Settings` — including resolving the Aurora secret — so a
migration cannot be run against a database the application does not use. The
engine is created synchronously (psycopg-style URL) because Alembic's own
machinery is synchronous; the application's asyncpg URL is rewritten here.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from zeitzeuge_api.core.config import get_settings
from zeitzeuge_api.db.models import Base  # noqa: F401  (registers every table)
from zeitzeuge_api.db.roles import provision_app_role
from zeitzeuge_api.db.session import build_dsn

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _resolve_json(reference: str) -> dict[str, str]:
    # Resolving a secret needs the event loop and a boto3 client; running
    # migrations that way is a deployment-time job, so support it explicitly
    # rather than by accident.
    from zeitzeuge_api.integrations.aws.clients import AwsClients
    from zeitzeuge_api.integrations.aws.secrets import SecretsResolver

    resolver = SecretsResolver(AwsClients(get_settings()))
    return asyncio.run(resolver.resolve_json(reference))


def _url() -> str:
    settings = get_settings()
    if settings.database_secret_ref:
        return build_dsn(settings, _resolve_json(settings.database_secret_ref))
    return build_dsn(settings)


def _app_role_password() -> str | None:
    """Set only in the migrate task (infra/modules/compute-api)."""
    reference = get_settings().app_db_secret_ref
    return _resolve_json(reference)["password"] if reference else None


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run(connection, app_role_password: str | None) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        # First, in the same transaction: the migrations' grants are guarded by
        # `IF EXISTS`, so without the role they would be skipped silently, the
        # migration would succeed, and the API would then fail to connect.
        if app_role_password is not None:
            provision_app_role(connection, app_role_password)
        context.run_migrations()


async def run_migrations_online(url: str, app_role_password: str | None) -> None:
    engine = create_async_engine(url, pool_pre_ping=True)
    async with engine.connect() as connection:
        await connection.run_sync(_do_run, app_role_password)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    # Secrets are resolved *before* the event loop starts: `_resolve_json`
    # calls `asyncio.run` itself, which raises inside a running loop. (It was
    # once called from within `run_migrations_online` — fine locally, where
    # the DSN is a literal, and fatal on the first migration in AWS.)
    asyncio.run(run_migrations_online(_url(), _app_role_password()))
