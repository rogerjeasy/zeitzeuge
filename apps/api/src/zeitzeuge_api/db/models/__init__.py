"""Model package. Importing it registers every table on `Base.metadata`."""

from zeitzeuge_api.db.base import Base
from zeitzeuge_api.db.models.api_key import ApiKey
from zeitzeuge_api.db.models.audit import AuditLog
from zeitzeuge_api.db.models.catalogue import (
    CatalogueRecord,
    Export,
    ExportItem,
    FieldDefinition,
    FieldReview,
    RecordField,
    RecordFieldEvidence,
    RecordVersion,
)
from zeitzeuge_api.db.models.enums import (
    ApiKeyScope,
    AuditAction,
    OrganizationKind,
    UserRole,
    UserStatus,
)
from zeitzeuge_api.db.models.holdings import Asset, AssetFile, Fonds, UploadBatch
from zeitzeuge_api.db.models.investigation import (
    AgentInvocation,
    EvidenceItem,
    EvidenceLink,
    Hypothesis,
    Objection,
    Run,
    RunEvent,
)
from zeitzeuge_api.db.models.organization import Organization, OrganizationDomain
from zeitzeuge_api.db.models.session import UserSession
from zeitzeuge_api.db.models.user import User, UserPreferences

__all__ = [
    "AgentInvocation",
    "ApiKey",
    "ApiKeyScope",
    "Asset",
    "AssetFile",
    "AuditAction",
    "AuditLog",
    "Base",
    "CatalogueRecord",
    "EvidenceItem",
    "EvidenceLink",
    "Export",
    "ExportItem",
    "FieldDefinition",
    "FieldReview",
    "Fonds",
    "Hypothesis",
    "Objection",
    "Organization",
    "OrganizationDomain",
    "OrganizationKind",
    "RecordField",
    "RecordFieldEvidence",
    "RecordVersion",
    "Run",
    "RunEvent",
    "UploadBatch",
    "User",
    "UserPreferences",
    "UserRole",
    "UserSession",
    "UserStatus",
]
