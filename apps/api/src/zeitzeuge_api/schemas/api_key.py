"""Request and response bodies for `/api/v1/api-keys`."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from zeitzeuge_api.db.models.enums import ApiKeyScope
from zeitzeuge_api.schemas.common import NonEmptyStr, Schema


class CreateApiKeyRequest(Schema):
    name: NonEmptyStr = Field(max_length=120, description="`OAI-PMH Harvester`")
    scope: ApiKeyScope = ApiKeyScope.READ
    expires_in_days: int | None = Field(default=365, ge=1, le=3650)


class ApiKeyOut(Schema):
    id: str
    name: str
    prefix: str
    scope: ApiKeyScope
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None


class ApiKeyCreated(ApiKeyOut):
    secret: str = Field(
        description="Shown once. It is stored only as a SHA-256 digest and cannot be recovered."
    )
