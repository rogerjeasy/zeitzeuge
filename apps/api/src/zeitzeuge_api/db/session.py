"""Engine, sessions, and the tenant context that row-level security reads.

The isolation argument in §9.4 is that an archive's rows are unreachable from
another archive's session **in the database**, not in the application. That
only holds if every transaction announces who it is for. This module is the one
place that happens:

    SELECT set_config('app.org_id',  :org,  true);   -- true = transaction-local
    SELECT set_config('app.user_id', :user, true);
    SELECT set_config('app.role',    :role, true);

and every policy in the initial migration is written against
`current_setting('app.org_id', true)`. Transaction-local is the important part:
the setting dies with the transaction, so a pooled connection handed to the
next request cannot carry the previous tenant's identity with it.

The application connects as a role that is neither superuser nor `BYPASSRLS`.
If it did, every policy below would be silently inert — which is exactly the
failure mode the CI leak test in `.github/workflows` exists to catch.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from urllib.parse import quote

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from zeitzeuge_api.core.config import Settings
from zeitzeuge_api.core.errors import ConfigurationError
from zeitzeuge_api.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class TenantContext:
    """Who the next transaction is for."""

    org_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    role: str = "anonymous"

    @property
    def is_anonymous(self) -> bool:
        return self.org_id is None

    @classmethod
    def bootstrap(cls) -> TenantContext:
        """The pre-authentication context.

        Sign-in, registration and API-key lookup all have to read a row before
        they can know which tenant the request belongs to — that is the whole
        point of authenticating. This context is what the migration's
        `*_bootstrap_read` policies recognise, it is granted SELECT and nothing
        wider on the three identity tables, and it is used by exactly two
        places: the `/auth` router and `resolve_identity` in `api.deps`. Every
        request that carries a token leaves it immediately, by calling
        `Database.set_tenant` with the tenant it just proved.
        """
        return cls(role="bootstrap")


ANONYMOUS = TenantContext()


def build_dsn(settings: Settings, credentials: dict[str, str] | None = None) -> str:
    """Compose the asyncpg DSN from an Aurora secret, or take the literal one.

    Aurora's managed secret is a JSON document (`{"username": …, "password": …,
    "host": …}`) and rotates. Reading it at startup rather than baking a URL
    into the task definition is what makes rotation a non-event.
    """
    if settings.database_dsn:
        return settings.database_dsn

    credentials = credentials or {}
    username = credentials.get("username")
    password = credentials.get("password")
    if not username or not password:
        raise ConfigurationError("No database credentials are available.")

    host = credentials.get("host") or settings.database_host
    port = credentials.get("port") or str(settings.database_port)
    name = credentials.get("dbname") or settings.database_name
    if not host:
        raise ConfigurationError("No database host is configured.")

    return (
        f"postgresql+asyncpg://{quote(username, safe='')}:{quote(password, safe='')}"
        f"@{host}:{port}/{name}"
    )


def create_engine(dsn: str, settings: Settings) -> AsyncEngine:
    is_sqlite = dsn.startswith("sqlite")
    kwargs: dict[str, object] = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
        "future": True,
    }
    if not is_sqlite:
        kwargs.update(
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            # Aurora Serverless v2 scales by dropping and re-adding capacity;
            # a connection older than the scaling event is a latent error.
            pool_recycle=1800,
            connect_args={
                "server_settings": {
                    "application_name": f"{settings.project}-{settings.service_name}",
                    "statement_timeout": str(settings.database_statement_timeout_ms),
                },
                "timeout": 10,
            },
        )
    return create_async_engine(dsn, **kwargs)


class Database:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.sessionmaker = async_sessionmaker(
            engine, expire_on_commit=False, autoflush=False
        )

    @asynccontextmanager
    async def session(self, tenant: TenantContext = ANONYMOUS) -> AsyncIterator[AsyncSession]:
        """One request, one transaction, one tenant identity.

        Commits on a clean exit and rolls back on any exception, so a handler
        that raises can never leave a half-written profile behind.
        """
        async with self.sessionmaker() as session:
            await self.set_tenant(session, tenant)
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def set_tenant(self, session: AsyncSession, tenant: TenantContext) -> None:
        """Announce (or re-announce) who the current transaction is for.

        Calling this a second time inside one transaction narrows the request
        from `bootstrap` to a single tenant, which is exactly what the identity
        dependency does once the caller has been recognised.
        """
        if session.bind is None or session.bind.dialect.name != "postgresql":
            return  # SQLite in unit tests: no RLS to configure.
        await session.execute(
            text(
                "SELECT set_config('app.org_id', :org, true),"
                "       set_config('app.user_id', :user, true),"
                "       set_config('app.role', :role, true)"
            ),
            {
                "org": str(tenant.org_id) if tenant.org_id else "",
                "user": str(tenant.user_id) if tenant.user_id else "",
                "role": tenant.role,
            },
        )

    async def healthcheck(self) -> bool:
        try:
            async with self.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            return True
        except Exception as exc:  # pragma: no cover - transport shaped
            log.error("db.healthcheck_failed", error=str(exc))
            return False

    async def dispose(self) -> None:
        await self.engine.dispose()
