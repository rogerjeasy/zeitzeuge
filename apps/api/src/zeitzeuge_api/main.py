"""Application factory and lifespan.

Everything expensive is built once, at startup, and hung on `app.state`:
the boto3 clients, the resolved secrets, the database engine, the JWKS cache.
A Fargate task that does this per request spends its life re-parsing service
models and re-reading Secrets Manager.

Startup deliberately *does not* fail when Cognito or the database are
unreachable. A task that refuses to start cannot serve `/healthz`, so ECS kills
it, restarts it, and the deploy rolls backwards — during a 24-hour hackathon,
on a Saturday, while Terraform is still creating the very resources it is
waiting for. Instead the failure surfaces at `/readyz` and on the first request
that needs the dependency, where it can be read.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from zeitzeuge_api import __version__
from zeitzeuge_api.api.deps import get_context
from zeitzeuge_api.api.router import api_router
from zeitzeuge_api.api.v1 import health
from zeitzeuge_api.core import errors, tempdir
from zeitzeuge_api.core.config import Settings, get_settings
from zeitzeuge_api.core.logging import configure_logging, get_logger
from zeitzeuge_api.core.security import JWKSCache, TokenVerifier
from zeitzeuge_api.db.session import Database, build_dsn, create_engine
from zeitzeuge_api.integrations.aws.clients import AwsClients
from zeitzeuge_api.integrations.aws.cognito import CognitoIdentityProvider
from zeitzeuge_api.integrations.aws.originals import OriginalsStorage
from zeitzeuge_api.integrations.aws.ratelimit import RateLimiter
from zeitzeuge_api.integrations.aws.s3 import AvatarStorage
from zeitzeuge_api.integrations.aws.secrets import SecretsResolver
from zeitzeuge_api.investigation.models import ModelClient
from zeitzeuge_api.investigation.notifier import RunNotifier
from zeitzeuge_api.investigation.pipeline import Deps, S3ImageStore
from zeitzeuge_api.investigation.toolbox import Toolbox
from zeitzeuge_api.investigation.worker import InvestigationWorker
from zeitzeuge_api.middleware.request_context import (
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from zeitzeuge_api.services.api_key_service import ApiKeyService
from zeitzeuge_api.services.auth_service import AuthService
from zeitzeuge_api.services.investigation_service import InvestigationService
from zeitzeuge_api.services.user_service import UserService

log = get_logger(__name__)

DESCRIPTION = """
**Agentic provenance intelligence for historical photograph archives.**

ZEITZEUGE takes an undescribed photograph and returns a catalogue record in
which every field carries its evidence, its confidence and the reasoning that
produced it — or says nothing at all, deliberately.

### The investigation

A run is an **AWS Step Functions** execution across **18 specialist agents** on
**Amazon Bedrock**, in five tiers: forensics → perception → grounding →
hypothesis, falsification and adjudication → production. A *Terrain Falsifier*
re-renders the Alpine skyline from elevation data to **refute** a proposed
location; a *Red-Team Verifier* from a different model family argues against
every claim that survives. Human approval is a durable state in the machine,
not a polling loop.

What the archive keeps is the **Evidence Ledger** — append-only, versioned, and
attributable to a named archivist — exportable as ISAD(G), EAD, Dublin Core,
RiC-O, IIIF and XMP, and harvestable over OAI-PMH.

### Three rules the architecture enforces

- **No claim without evidence.** Every assertion resolves to a source, a region
  of pixels, or a measurement.
- **Falsification before assertion.** A hypothesis must survive an attempt to
  destroy it.
- **Calibrated silence.** "Insufficient evidence" is a valid, and sometimes
  correct, answer.

### Platform

FastAPI on ECS Fargate · Aurora PostgreSQL Serverless v2 with pgvector and
row-level security · S3 · OpenSearch · DynamoDB · Amazon Cognito · Terraform —
all in **`eu-central-2` (Zurich)**, with EU-resident inference. Swiss scans stay
in Switzerland. Credentials live in Cognito: this service stores no password and
holds no long-lived AWS key, and tenant isolation is enforced by the database
rather than by the application.

### In this build

Identity, profiles, sessions and API keys are live. The investigation surface
(`/assets`, `/runs`, `/records`, `/eval`) is built on this foundation.
"""


async def build_state(app: FastAPI, settings: Settings) -> None:
    clients = AwsClients(settings)
    secrets = SecretsResolver(clients)

    client_secret = await secrets.resolve(settings.cognito_client_secret_ref)
    guest_password = await secrets.resolve(settings.guest_password_ref)
    db_credentials = (
        await secrets.resolve_json(settings.database_secret_ref)
        if settings.database_secret_ref
        else {}
    )

    dsn = build_dsn(settings, db_credentials)
    database = Database(create_engine(dsn, settings))

    cognito = CognitoIdentityProvider(
        clients,
        user_pool_id=settings.cognito_user_pool_id,
        client_id=settings.cognito_client_id,
        client_secret=client_secret,
    )
    jwks = JWKSCache(
        settings.cognito_jwks_url,
        ttl_seconds=settings.jwks_cache_seconds,
        headers=settings.cognito_jwks_headers,
    )
    verifier = TokenVerifier(
        jwks=jwks,
        issuer=settings.cognito_issuer,
        client_id=settings.cognito_client_id,
        leeway_seconds=settings.jwt_leeway_seconds,
    )
    avatars = AvatarStorage(
        clients,
        bucket=settings.assets_bucket,
        prefix=settings.avatar_prefix,
        kms_key_id=settings.assets_kms_key_id,
        max_bytes=settings.avatar_max_bytes,
        allowed_types=tuple(settings.avatar_allowed_types),
        upload_ttl=settings.avatar_upload_ttl_seconds,
        view_ttl=settings.avatar_view_ttl_seconds,
        cdn_domain=settings.cdn_domain,
    )
    limiter = RateLimiter(clients, table_name=settings.rate_limit_table)
    originals = OriginalsStorage(
        clients,
        bucket=settings.originals_bucket,
        derivatives_bucket=settings.derivatives_bucket,
        kms_key_id=settings.assets_kms_key_id,
        max_bytes=settings.original_max_bytes,
        upload_ttl=settings.original_upload_ttl_seconds,
    )

    app.state.settings = settings
    app.state.clients = clients
    app.state.secrets = secrets
    app.state.database = database
    app.state.cognito = cognito
    app.state.jwks = jwks
    app.state.verifier = verifier
    app.state.avatars = avatars
    app.state.limiter = limiter
    app.state.auth_service = AuthService(
        cognito=cognito,
        limiter=limiter,
        database=database,
        guest_username=settings.guest_username,
        guest_password=guest_password,
        session_idle_days=settings.session_idle_days,
    )
    app.state.user_service = UserService(cognito=cognito, avatars=avatars, limiter=limiter)
    app.state.api_key_service = ApiKeyService(limiter=limiter)
    app.state.investigation_service = InvestigationService(originals)

    # Live progress (design note D8) and the in-API worker (D1). Both need
    # Postgres; on SQLite (the unit suite) neither starts.
    if dsn.startswith("postgresql"):
        app.state.notifier = RunNotifier(dsn)
        await app.state.notifier.start()
        if settings.worker_enabled:
            try:
                toolbox = Toolbox(
                    cache_dir=Path(settings.tool_cache_dir) if settings.tool_cache_dir else None
                )
                app.state.toolbox = toolbox
                worker = InvestigationWorker(
                    database,
                    Deps(
                        models=ModelClient(
                            region=settings.region, openai_key=await _openai_key(secrets, settings)
                        ),
                        tools=toolbox,
                        images=S3ImageStore(clients.s3),
                        code_version=__version__,
                        access_bucket=settings.derivatives_bucket,
                    ),
                    concurrency=settings.worker_concurrency,
                )
                app.state.worker = worker
                app.state.worker_task = asyncio.create_task(worker.run_forever())
            except Exception as exc:  # the API serves reviews and exports without it
                log.error(
                    "startup.worker_unavailable", error=str(exc), error_type=type(exc).__name__
                )

    await jwks.warm()


async def _openai_key(secrets: SecretsResolver, settings: Settings) -> str:
    """The red team's OpenAI key; empty (labelled same-family fallback) if unavailable."""
    if settings.openai_api_key:
        return settings.openai_api_key
    reference = settings.openai_key_ref or (
        f"secretsmanager://{settings.project}/{settings.env}/external/api-keys#openai"
    )
    try:
        return await secrets.resolve(reference)
    except Exception as exc:  # a missing key must not take the API down
        log.warning("startup.openai_key_unavailable", error=type(exc).__name__)
        return ""


_FILESYSTEM_ERRORS = (
    FileNotFoundError,
    PermissionError,
    IsADirectoryError,
    NotADirectoryError,
    FileExistsError,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # The settings `create_app` was given, not a fresh read. Calling
    # `get_settings()` here would silently ignore an explicitly configured
    # application — which is exactly what a test suite passes, and what made a
    # developer's local `.env` leak into it.
    settings: Settings = getattr(app.state, "settings", None) or get_settings()
    configure_logging(level=settings.log_level, json_output=not settings.is_local)
    log.info(
        "startup",
        version=__version__,
        env=settings.env,
        region=settings.region,
        pool=bool(settings.cognito_user_pool_id),
    )
    tempdir.choose()  # before anything spills to disk (openpyxl, the lookup cache)
    try:
        await build_state(app, settings)
    except Exception as exc:
        # Serve `/healthz` and report the truth at `/readyz` rather than
        # crash-looping while Terraform is still applying. Any route that needs
        # the missing dependency answers 500 `misconfigured`, with the reason
        # in the log — which is a far better 03:00 than a task that never
        # starts and an ECS event list that only says "stopped".
        log.error("startup.degraded", error=str(exc), error_type=type(exc).__name__)
    try:
        yield
    finally:
        worker = getattr(app.state, "worker", None)
        if worker is not None:
            await worker.stop()
            app.state.worker_task.cancel()
        notifier = getattr(app.state, "notifier", None)
        if notifier is not None:
            await notifier.stop()
        toolbox = getattr(app.state, "toolbox", None)
        if toolbox is not None:
            await toolbox.close()
        database = getattr(app.state, "database", None)
        if database is not None:
            await database.dispose()
        log.info("shutdown")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title="ZEITZEUGE API",
        description=DESCRIPTION,
        version=__version__,
        lifespan=lifespan,
        root_path=settings.root_path,
        docs_url="/docs" if settings.env != "prod" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.env != "prod" else None,
    )

    # Set before the lifespan runs, so it is the configuration the lifespan uses.
    app.state.settings = settings
    app.state.database = None

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id", "X-ZZ-Session"],
        expose_headers=["X-Request-Id"],
        max_age=600,
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    # Again under the prefix: behind CloudFront only `/api/*` reaches this
    # service, and a post-deploy smoke test has to prove it from outside.
    app.include_router(health.router, prefix=settings.api_prefix, include_in_schema=False)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


def register_exception_handlers(app: FastAPI) -> None:
    """One response shape for every failure: `application/problem+json`."""

    def problem(request: Request, error: errors.AppError) -> JSONResponse:
        context = get_context(request)
        return JSONResponse(
            status_code=error.status_code,
            content=error.to_problem(
                instance=str(request.url.path), request_id=context.request_id
            ),
            headers={**error.headers, "Content-Type": "application/problem+json"},
        )

    @app.exception_handler(errors.AppError)
    async def _app_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, errors.AppError)
        if exc.status_code >= 500:
            log.error("error.server", code=exc.code, detail=exc.detail)
        else:
            log.info("error.client", code=exc.code, status=exc.status_code)
        return problem(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)
        # Field paths and messages are safe to return; the submitted values are
        # not — one of them may be a password.
        details = [
            {
                "field": ".".join(str(part) for part in item.get("loc", ())[1:]),
                "message": item.get("msg", "invalid"),
                "type": item.get("type", "value_error"),
            }
            for item in exc.errors()
        ]
        error = errors.ValidationError(extra={"errors": details})
        return problem(request, error)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, StarletteHTTPException)
        mapped = errors.AppError(
            detail=str(exc.detail),
            code="http_error",
            title="Request failed",
            status_code=exc.status_code,
        )
        if exc.status_code == 404:
            mapped = errors.NotFoundError()
        return problem(request, mapped)

    @app.exception_handler(SQLAlchemyError)
    @app.exception_handler(OSError)
    async def _database(request: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, _FILESYSTEM_ERRORS):
            # A file the process could not write is a bug or a mis-set container,
            # not a database outage: report it as one, with its traceback.
            log.exception("error.filesystem", error=type(exc).__name__)
            return problem(request, errors.AppError())
        # A refused connection or an exhausted pool is not "an unexpected
        # error": it is a dependency being down, it is worth retrying, and it
        # should read that way in the client and in the log. asyncpg raises
        # OSError on connect and SQLAlchemy wraps later failures, so both
        # arrive here.
        log.error("error.database", error=type(exc).__name__, detail=str(exc)[:300])
        return problem(request, errors.DatabaseUnavailableError())

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # The one place an unexpected exception is allowed to reach. It is
        # logged with its traceback and the request id, and the caller is told
        # nothing but that id.
        log.exception("error.unhandled", error=type(exc).__name__)
        return problem(request, errors.AppError())


app = create_app()
