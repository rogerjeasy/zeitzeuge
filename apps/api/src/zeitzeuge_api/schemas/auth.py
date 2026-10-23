"""Request and response bodies for `/api/v1/auth/*`.

The response side is written against what the web app already expects
(`apps/web/src/lib/auth/client.ts`): a result that is either a success or a
`code` the UI maps to a translation key. Nothing here returns free German or
English prose as the primary signal — the language belongs to the frontend,
which already ships `de`, `fr` and `en`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import EmailStr, Field, field_validator

from zeitzeuge_api.schemas.common import ConfirmationCode, NonEmptyStr, Schema
from zeitzeuge_api.schemas.password import evaluate_password

ChallengeName = Literal["SOFTWARE_TOKEN_MFA", "SMS_MFA", "NEW_PASSWORD_REQUIRED"]


def _validate_password(value: str) -> str:
    verdict = evaluate_password(value)
    if not verdict.satisfied:
        raise ValueError(verdict.message)
    return value


class RegisterRequest(Schema):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    full_name: NonEmptyStr = Field(max_length=200)
    organization_name: str | None = Field(
        default=None,
        max_length=200,
        description=(
            "The archive this person works for. A new tenant is created when it "
            "is not already known; leave it empty to get a personal workspace."
        ),
    )
    canton: str | None = Field(default=None, max_length=2)
    job_title: str | None = Field(default=None, max_length=120)
    locale: Literal["de", "fr", "en"] = "de"
    accept_terms: bool = Field(
        description="Must be true. Recorded with a timestamp on the user row."
    )

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def _policy(cls, value: str) -> str:
        return _validate_password(value)

    @field_validator("accept_terms")
    @classmethod
    def _must_accept(cls, value: bool) -> bool:
        if not value:
            raise ValueError("The terms must be accepted.")
        return value


class RegisterResponse(Schema):
    user_id: str
    email: EmailStr
    next_step: Literal["verify_email"] = "verify_email"
    message: str = "A confirmation code has been sent to the address."


class VerifyEmailRequest(Schema):
    email: EmailStr
    code: ConfirmationCode

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()


class ResendCodeRequest(Schema):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()


class LoginRequest(Schema):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    remember: bool = False

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()


class SessionTokens(Schema):
    """What the browser gets on a successful sign-in.

    The tokens are returned in the body, not set as cookies, because the Next.js
    app is the one that owns the cookie: its route handler re-issues them as
    `HttpOnly; Secure; SameSite=Lax`. Doing it here would put a `Set-Cookie` for
    the API's domain on a cross-origin response, which is both weaker and, under
    third-party cookie rules, increasingly not a thing that works.
    """

    access_token: str
    id_token: str
    refresh_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int
    session_id: str = Field(
        description="Identifies this sign-in. Send it back as `X-ZZ-Session`."
    )


class ChallengeResponse(Schema):
    """Cognito wants a second factor, or a new password, before it issues tokens."""

    challenge: ChallengeName
    session: str = Field(description="Opaque. Return it verbatim with the answer.")
    username: str
    parameters: dict[str, str] = Field(default_factory=dict)


class LoginResponse(Schema):
    tokens: SessionTokens | None = None
    challenge: ChallengeResponse | None = None


class ChallengeAnswerRequest(Schema):
    challenge: ChallengeName
    session: NonEmptyStr
    username: NonEmptyStr
    code: str | None = Field(default=None, max_length=16)
    new_password: str | None = Field(default=None, max_length=256)

    @field_validator("new_password")
    @classmethod
    def _policy(cls, value: str | None) -> str | None:
        return _validate_password(value) if value else value


class RefreshRequest(Schema):
    refresh_token: NonEmptyStr
    session_id: NonEmptyStr = Field(
        description=(
            "The id from sign-in. Required: the Cognito SECRET_HASH for a refresh "
            "is computed over the pool username, which this row holds."
        )
    )


class LogoutRequest(Schema):
    refresh_token: str | None = None
    all_devices: bool = False


class ForgotPasswordRequest(Schema):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordRequest(Schema):
    email: EmailStr
    code: ConfirmationCode
    new_password: str = Field(min_length=8, max_length=256)

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("new_password")
    @classmethod
    def _policy(cls, value: str) -> str:
        return _validate_password(value)


class ChangePasswordRequest(Schema):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)

    @field_validator("new_password")
    @classmethod
    def _policy(cls, value: str) -> str:
        return _validate_password(value)


class TotpEnrolmentResponse(Schema):
    secret: str
    otpauth_uri: str = Field(description="Render as the QR code; never log it.")


class TotpConfirmRequest(Schema):
    code: ConfirmationCode
    device_name: str = Field(default="ZEITZEUGE", max_length=64)


class GuestSessionResponse(Schema):
    """The "Als Gast demo starten" path (§9.2 screen 2).

    A judge must never meet a signup wall. This returns a real Cognito session
    for a real, permanently read-only user in the seeded demo tenant — not a
    bypass, not a mocked token, and therefore not a hole to argue about.
    """

    tokens: SessionTokens
    organization_id: str
    read_only: Literal[True] = True
