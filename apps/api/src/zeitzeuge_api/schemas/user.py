"""Request and response bodies for `/api/v1/users/*`.

`UserProfile` is shaped to feed the two screens that already exist —
`/profile` and `/settings` — including the `initials` the avatar falls back to
and the organisation block the member list renders. Serving three requests to
paint one header is a latency tax the archivist pays on every page.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import EmailStr, Field, StringConstraints, field_validator

from zeitzeuge_api.db.models.enums import UserRole, UserStatus
from zeitzeuge_api.schemas.common import ConfirmationCode, NonEmptyStr, Schema

Locale = Literal["de", "fr", "en"]
Theme = Literal["system", "light", "dark"]
RunMode = Literal["fast", "standard", "deep"]
ExportFormat = Literal["isad", "ead", "dc", "ricox", "iiif", "xmp"]


class OrganizationSummary(Schema):
    id: str
    slug: str
    name: str
    kind: str
    canton: str | None = None
    isil: str | None = None
    is_demo: bool = False


class UserProfile(Schema):
    id: str
    email: EmailStr
    email_verified: bool
    pending_email: EmailStr | None = None
    full_name: str
    initials: str
    job_title: str | None = None
    department: str | None = None
    phone: str | None = None
    bio: str | None = None
    locale: Locale
    timezone: str
    role: UserRole
    status: UserStatus
    mfa_enabled: bool
    avatar_url: str | None = Field(
        default=None,
        description="Signed, short-lived. Re-fetch the profile rather than caching it.",
    )
    organization: OrganizationSummary
    member_since: datetime
    last_login_at: datetime | None = None


class UpdateProfileRequest(Schema):
    """Every field optional; absent means unchanged.

    `email` is deliberately absent — changing the sign-in identity needs a
    verification round trip and has its own endpoint. So is `role`: nobody
    promotes themselves.
    """

    full_name: Annotated[str, StringConstraints(min_length=1, max_length=200)] | None = None
    job_title: Annotated[str, StringConstraints(max_length=120)] | None = None
    department: Annotated[str, StringConstraints(max_length=120)] | None = None
    phone: Annotated[str, StringConstraints(max_length=40)] | None = None
    bio: Annotated[str, StringConstraints(max_length=2000)] | None = None
    locale: Locale | None = None
    timezone: Annotated[str, StringConstraints(max_length=64)] | None = None

    @field_validator("phone")
    @classmethod
    def _plausible_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        cleaned = value.replace(" ", "")
        if not cleaned.replace("+", "").replace("/", "").replace("-", "").isdigit():
            raise ValueError("The telephone number contains unexpected characters.")
        return value


class NotificationPreferences(Schema):
    email_queue_ready: bool = True
    email_hypothesis_refuted: bool = False
    email_batch_complete: bool = True
    email_weekly_digest: bool = True
    inapp_queue_ready: bool = True
    inapp_hypothesis_refuted: bool = True
    inapp_batch_complete: bool = True
    inapp_weekly_digest: bool = False


class CataloguingPreferences(Schema):
    default_run_mode: RunMode = "standard"
    auto_accept_threshold: float = Field(default=0.92, ge=0.5, le=1.0)
    """Below 0.5 this would be a random-number generator with a signature field
    attached. The floor is a product decision, enforced here."""

    allow_abstention: bool = True
    default_collection: str | None = Field(default=None, max_length=64)
    default_export_format: ExportFormat = "isad"


class AppearancePreferences(Schema):
    theme: Theme = "system"
    reduced_motion: bool = False
    high_contrast: bool = False


class UserPreferencesOut(Schema):
    appearance: AppearancePreferences
    notifications: NotificationPreferences
    cataloguing: CataloguingPreferences


class UpdatePreferencesRequest(Schema):
    appearance: AppearancePreferences | None = None
    notifications: NotificationPreferences | None = None
    cataloguing: CataloguingPreferences | None = None


class AvatarUploadRequest(Schema):
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    content_length: int = Field(gt=0, le=5 * 1024 * 1024)


class AvatarUploadTicket(Schema):
    upload_url: str
    fields: dict[str, str] = Field(
        description="POST these as multipart form fields, `file` last."
    )
    key: str
    expires_in: int
    max_bytes: int


class AvatarCommitRequest(Schema):
    key: NonEmptyStr


class AvatarResponse(Schema):
    avatar_url: str | None
    updated_at: datetime | None


class ChangeEmailRequest(Schema):
    new_email: EmailStr

    @field_validator("new_email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.strip().lower()


class ConfirmEmailChangeRequest(Schema):
    code: ConfirmationCode


class SessionOut(Schema):
    id: str
    device: str
    location: str | None = None
    ip_address: str | None = None
    created_at: datetime
    last_active: datetime | None = None
    current: bool = False


class DeleteAccountRequest(Schema):
    """Deleting an account is a typed confirmation, not a button.

    nDSG gives the person the right; §5.4 M5 means their corrections stay
    attributed. Both are satisfied: the identity is removed from Cognito and
    the row is soft-deleted, so the authority record survives without the
    credential.
    """

    confirmation: Literal["LÖSCHEN", "DELETE"]
    reason: str | None = Field(default=None, max_length=500)
