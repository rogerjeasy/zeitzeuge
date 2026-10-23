"""`/api/v1/auth` — registration, sign-in, passwords, second factor, demo.

Routes are thin on purpose: validate, delegate, choose a status code. Every
decision worth arguing about is in `services.auth_service`, where it can be
tested without an HTTP client.

Status codes carry meaning here. `202 Accepted` on the password-reset and
resend routes is not decoration — it is the honest code for "we have taken
this request and will not tell you what happened next", which is the same
answer for a registered and an unregistered address.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.api.deps import (
    CurrentIdentity,
    bootstrap_session,
    get_auth_service,
    get_context,
)
from zeitzeuge_api.core.context import RequestContext
from zeitzeuge_api.schemas import auth as schemas
from zeitzeuge_api.schemas.common import Message
from zeitzeuge_api.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

Session = Annotated[AsyncSession, Depends(bootstrap_session)]
Service = Annotated[AuthService, Depends(get_auth_service)]
Context = Annotated[RequestContext, Depends(get_context)]


@router.post(
    "/register",
    response_model=schemas.RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register an archivist",
)
async def register(
    body: schemas.RegisterRequest,
    session: Session,
    service: Service,
    context: Context,
) -> schemas.RegisterResponse:
    return await service.register(session, body, context)


@router.post("/verify", response_model=Message, summary="Confirm an e-mail address")
async def verify_email(
    body: schemas.VerifyEmailRequest,
    session: Session,
    service: Service,
    context: Context,
) -> Message:
    await service.verify_email(session, body, context)
    return Message(status="verified", message="The address is confirmed. You can sign in.")


@router.post(
    "/verify/resend",
    response_model=Message,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a new confirmation code",
)
async def resend_verification(
    body: schemas.ResendCodeRequest,
    session: Session,
    service: Service,
    context: Context,
) -> Message:
    await service.resend_verification(session, body, context)
    return Message(message="If that address needs confirming, a new code is on its way.")


@router.post("/login", response_model=schemas.LoginResponse, summary="Sign in")
async def login(
    body: schemas.LoginRequest,
    session: Session,
    service: Service,
    context: Context,
) -> schemas.LoginResponse:
    return await service.login(session, body, context)


@router.post(
    "/challenge",
    response_model=schemas.LoginResponse,
    summary="Answer an MFA or new-password challenge",
)
async def answer_challenge(
    body: schemas.ChallengeAnswerRequest,
    session: Session,
    service: Service,
    context: Context,
) -> schemas.LoginResponse:
    return await service.answer_challenge(session, body, context)


@router.post("/refresh", response_model=schemas.SessionTokens, summary="Refresh an access token")
async def refresh(
    body: schemas.RefreshRequest,
    session: Session,
    service: Service,
    context: Context,
) -> schemas.SessionTokens:
    return await service.refresh(session, body, context)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Sign out of this device, or of all of them",
)
async def logout(
    body: schemas.LogoutRequest,
    identity: CurrentIdentity,
    service: Service,
) -> None:
    await service.logout(
        identity.session, user=identity.user, data=body, context=identity.context
    )


@router.post(
    "/password/forgot",
    response_model=Message,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Begin a password reset",
)
async def forgot_password(
    body: schemas.ForgotPasswordRequest,
    session: Session,
    service: Service,
    context: Context,
) -> Message:
    await service.forgot_password(session, body, context)
    # Identical for a registered and an unregistered address, by design.
    return Message(
        message="If an account exists for that address, a reset code has been sent to it."
    )


@router.post("/password/reset", response_model=Message, summary="Complete a password reset")
async def reset_password(
    body: schemas.ResetPasswordRequest,
    session: Session,
    service: Service,
    context: Context,
) -> Message:
    await service.reset_password(session, body, context)
    return Message(
        status="reset",
        message="The password has been changed and every other session was signed out.",
    )


@router.post(
    "/password/change",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Change the password of the signed-in account",
)
async def change_password(
    body: schemas.ChangePasswordRequest,
    identity: CurrentIdentity,
    service: Service,
) -> None:
    await service.change_password(
        identity.session,
        user=identity.user,
        access_token=identity.require_user_token(),
        data=body,
        context=identity.context,
    )


@router.post(
    "/mfa/totp",
    response_model=schemas.TotpEnrolmentResponse,
    summary="Begin enrolling an authenticator app",
)
async def begin_totp(
    identity: CurrentIdentity,
    service: Service,
) -> schemas.TotpEnrolmentResponse:
    return await service.begin_totp(
        access_token=identity.require_user_token(), user=identity.user
    )


@router.post(
    "/mfa/totp/verify",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Confirm the authenticator app and switch MFA on",
)
async def confirm_totp(
    body: schemas.TotpConfirmRequest,
    identity: CurrentIdentity,
    service: Service,
) -> None:
    await service.confirm_totp(
        identity.session,
        access_token=identity.require_user_token(),
        user=identity.user,
        data=body,
        context=identity.context,
    )


@router.delete(
    "/mfa/totp",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Switch MFA off",
)
async def disable_totp(
    identity: CurrentIdentity,
    service: Service,
) -> None:
    await service.disable_totp(
        identity.session, user=identity.user, context=identity.context
    )


@router.post(
    "/guest",
    response_model=schemas.GuestSessionResponse,
    summary='Start the demo session ("Als Gast demo starten")',
)
async def guest_session(
    session: Session,
    service: Service,
    context: Context,
) -> schemas.GuestSessionResponse:
    return await service.start_guest_session(session, context)
