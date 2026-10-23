"""Shared response shapes."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from zeitzeuge_api.schemas.password import evaluate_password

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ConfirmationCode = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9]{6,10}$")
]


class Schema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="forbid",
    )


class Message(Schema):
    """A deliberately uninformative acknowledgement.

    Used wherever answering truthfully would leak whether an account exists.
    `status` is always `accepted`; the real outcome, if any, arrives by mail.
    """

    status: str = "accepted"
    message: str


class NormalisedEmail(Schema):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()


class Password(Schema):
    password: str = Field(min_length=8, max_length=256)

    @field_validator("password")
    @classmethod
    def _policy(cls, value: str) -> str:
        verdict = evaluate_password(value)
        if not verdict.satisfied:
            raise ValueError(verdict.message)
        return value


class ProblemDetail(Schema):
    """RFC 9457. Documented here so it appears in the OpenAPI schema."""

    model_config = ConfigDict(extra="allow")

    type: str
    title: str
    status: int
    detail: str
    code: str
    instance: str | None = None
    request_id: str | None = None
    errors: list[dict[str, Any]] | None = None
