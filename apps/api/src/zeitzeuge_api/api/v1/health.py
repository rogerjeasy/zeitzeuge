"""Liveness and readiness.

`/healthz` answers "is this process running" and touches nothing — it is what
the ALB polls every few seconds, and a health check that queries the database
turns a slow database into a killed task and a killed task into an outage.

`/readyz` answers "can this process serve" and does check its dependencies. It
is what a deployment waits on, and what tells you, at 03:00, whether the thing
that broke is the API or Aurora.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status

from zeitzeuge_api.api.deps import get_settings
from zeitzeuge_api.core.config import Settings
from zeitzeuge_api.db.session import Database

router = APIRouter(tags=["health"])


@router.get("/healthz", summary="Liveness")
async def healthz(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "env": settings.env}


@router.get("/readyz", summary="Readiness")
async def readyz(request: Request, response: Response) -> dict[str, Any]:
    database: Database | None = getattr(request.app.state, "database", None)
    database_ok = await database.healthcheck() if database is not None else False
    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if database_ok else "degraded",
        "checks": {"database": database_ok, "identity": hasattr(request.app.state, "verifier")},
    }
