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
from zeitzeuge_api.db.session import build_dsn

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    settings = get_settings()
    if settings.database_secret_ref:
        # Resolving a secret needs the event loop and a boto3 client; running
        # migrations that way is a deployment-time job, so support it
        # explicitly rather than by accident.
        from zeitzeuge_api.integrations.aws.clients import AwsClients
        from zeitzeuge_api.integrations.aws.secrets import SecretsResolver

        clients = AwsClients(settings)
        resolver = SecretsResolver(clients)
        credentials = asyncio.run(resolver.resolve_json(settings.database_secret_ref))
        return build_dsn(settings, credentials)
    return build_dsn(settings)


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


def _do_run(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_url(), pool_pre_ping=True)
    async with engine.connect() as connection:
        await connection.run_sync(_do_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
