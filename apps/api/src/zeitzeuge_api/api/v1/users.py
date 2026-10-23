"""`/api/v1/users/me` — the profile, the preferences, the picture, the sessions.

Every route acts on the caller. There is no `/users/{id}` here at all: member
administration is a different concern with a different guard, and leaving the
id out of the URL means there is no id to forget to check.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from zeitzeuge_api.api.deps import CurrentIdentity, WriteIdentity, get_user_service
from zeitzeuge_api.schemas import user as schemas
from zeitzeuge_api.schemas.common import Message
from zeitzeuge_api.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])

Service = Annotated[UserService, Depends(get_user_service)]


@router.get("/me", response_model=schemas.UserProfile, summary="The signed-in archivist")
async def read_me(identity: CurrentIdentity, service: Service) -> schemas.UserProfile:
    return service.to_profile(identity.user, identity.organization)


@router.patch("/me", response_model=schemas.UserProfile, summary="Update the profile")
async def update_me(
    body: schemas.UpdateProfileRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.UserProfile:
    user = await service.update_profile(
        identity.session, user=identity.user, data=body, context=identity.context
    )
    return service.to_profile(user, identity.organization)


@router.get(
    "/me/preferences",
    response_model=schemas.UserPreferencesOut,
    summary="Settings for appearance, notifications and cataloguing",
)
async def read_preferences(
    identity: CurrentIdentity, service: Service
) -> schemas.UserPreferencesOut:
    return await service.get_preferences(identity.session, user=identity.user)


@router.patch(
    "/me/preferences",
    response_model=schemas.UserPreferencesOut,
    summary="Update settings (each group optional)",
)
async def update_preferences(
    body: schemas.UpdatePreferencesRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.UserPreferencesOut:
    return await service.update_preferences(
        identity.session, user=identity.user, data=body, context=identity.context
    )


@router.post(
    "/me/avatar/ticket",
    response_model=schemas.AvatarUploadTicket,
    summary="Get a presigned POST for a new profile picture",
)
async def create_avatar_ticket(
    body: schemas.AvatarUploadRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.AvatarUploadTicket:
    return await service.create_avatar_ticket(
        user=identity.user, data=body, context=identity.context
    )


@router.put(
    "/me/avatar",
    response_model=schemas.AvatarResponse,
    summary="Confirm the upload and attach the picture",
)
async def commit_avatar(
    body: schemas.AvatarCommitRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.AvatarResponse:
    return await service.commit_avatar(
        identity.session, user=identity.user, data=body, context=identity.context
    )


@router.delete(
    "/me/avatar",
    response_model=schemas.AvatarResponse,
    summary="Remove the profile picture",
)
async def delete_avatar(
    identity: WriteIdentity,
    service: Service,
) -> schemas.AvatarResponse:
    return await service.remove_avatar(
        identity.session, user=identity.user, context=identity.context
    )


@router.post(
    "/me/email",
    response_model=Message,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request a change of e-mail address",
)
async def request_email_change(
    body: schemas.ChangeEmailRequest,
    identity: WriteIdentity,
    service: Service,
) -> Message:
    await service.request_email_change(
        identity.session,
        user=identity.user,
        access_token=identity.require_user_token(),
        data=body,
        context=identity.context,
    )
    return Message(message="A confirmation code has been sent to the new address.")


@router.post(
    "/me/email/verify",
    response_model=schemas.UserProfile,
    summary="Confirm the new e-mail address",
)
async def confirm_email_change(
    body: schemas.ConfirmEmailChangeRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.UserProfile:
    user = await service.confirm_email_change(
        identity.session,
        user=identity.user,
        access_token=identity.require_user_token(),
        data=body,
        context=identity.context,
    )
    return service.to_profile(user, identity.organization)


@router.get(
    "/me/sessions",
    response_model=list[schemas.SessionOut],
    summary="Devices currently signed in",
)
async def list_sessions(
    identity: CurrentIdentity, service: Service
) -> list[schemas.SessionOut]:
    return await service.list_sessions(
        identity.session, user=identity.user, context=identity.context
    )


@router.delete(
    "/me/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="End a session",
)
async def revoke_session(
    session_id: str,
    identity: CurrentIdentity,
    service: Service,
) -> None:
    await service.revoke_session(
        identity.session,
        user=identity.user,
        session_id=session_id,
        context=identity.context,
    )


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete this account",
)
async def delete_account(
    body: schemas.DeleteAccountRequest,
    identity: WriteIdentity,
    service: Service,
) -> None:
    await service.delete_account(
        identity.session, user=identity.user, data=body, context=identity.context
    )
