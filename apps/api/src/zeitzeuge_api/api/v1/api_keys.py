"""`/api/v1/api-keys` — the credentials behind `/settings/api`."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from zeitzeuge_api.api.deps import CurrentIdentity, WriteIdentity, get_api_key_service
from zeitzeuge_api.schemas import api_key as schemas
from zeitzeuge_api.services.api_key_service import ApiKeyService

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

Service = Annotated[ApiKeyService, Depends(get_api_key_service)]


@router.get("", response_model=list[schemas.ApiKeyOut], summary="List this account's keys")
async def list_keys(identity: CurrentIdentity, service: Service) -> list[schemas.ApiKeyOut]:
    return await service.list_for_user(identity.session, user=identity.user)


@router.post(
    "",
    response_model=schemas.ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a key (the secret is shown exactly once)",
)
async def create_key(
    body: schemas.CreateApiKeyRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.ApiKeyCreated:
    # An API key must not be able to mint another API key: that would turn one
    # leaked read key into a permanent foothold that survives its revocation.
    identity.require_user_token()
    return await service.create(
        identity.session, user=identity.user, data=body, context=identity.context
    )


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Revoke a key",
)
async def revoke_key(
    key_id: str,
    identity: WriteIdentity,
    service: Service,
) -> None:
    await service.revoke(
        identity.session, user=identity.user, key_id=key_id, context=identity.context
    )
