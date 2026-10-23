"""Model package. Importing it registers every table on `Base.metadata`."""

from zeitzeuge_api.db.base import Base
from zeitzeuge_api.db.models.api_key import ApiKey
from zeitzeuge_api.db.models.audit import AuditLog
from zeitzeuge_api.db.models.enums import (
    ApiKeyScope,
    AuditAction,
    OrganizationKind,
    UserRole,
    UserStatus,
)
from zeitzeuge_api.db.models.organization import Organization, OrganizationDomain
from zeitzeuge_api.db.models.session import UserSession
from zeitzeuge_api.db.models.user import User, UserPreferences

__all__ = [
    "ApiKey",
    "ApiKeyScope",
    "AuditAction",
    "AuditLog",
    "Base",
    "Organization",
    "OrganizationDomain",
    "OrganizationKind",
    "User",
    "UserPreferences",
    "UserRole",
    "UserSession",
    "UserStatus",
]
