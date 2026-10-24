"""Closed vocabularies.

Roles are the ones the web app already renders under `settings.archive.roles.*`
(`apps/web/src/lib/data/settings.ts`), plus `guest` for the demo path. They are
mirrored as Cognito groups, so a token and a row always agree on what someone
may do.
"""

from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    """Archive administrator: members, thresholds, model routing, budgets."""

    ARCHIVIST = "archivist"
    """Signs off catalogue records. The authority in the workflow."""

    REVIEWER = "reviewer"
    """May review and correct, but not approve — §9.2 screen 7."""

    OPERATOR = "operator"
    """Runs the scanner and the batches; does not adjudicate metadata."""

    READER = "reader"
    """Reads finished records. External historians, the Historischer Verein."""

    GUEST = "guest"
    """The demo identity. Read-only, seeded collection, never writes."""

    @property
    def can_approve(self) -> bool:
        return self in {UserRole.ADMIN, UserRole.ARCHIVIST}

    @property
    def can_write(self) -> bool:
        return self in {UserRole.ADMIN, UserRole.ARCHIVIST, UserRole.REVIEWER, UserRole.OPERATOR}


class UserStatus(StrEnum):
    PENDING = "pending"
    """Registered, e-mail not yet confirmed. Cannot sign in."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"
    """Soft-deleted. The row survives because audit entries reference it."""


class OrganizationKind(StrEnum):
    ARCHIVE = "archive"
    MUSEUM = "museum"
    ASSOCIATION = "association"
    PERSONAL = "personal"
    DEMO = "demo"


class ApiKeyScope(StrEnum):
    READ = "read"
    WRITE = "write"


class AuditAction(StrEnum):
    """Every entry an identity flow may append. Append-only by RLS."""

    USER_REGISTERED = "user.registered"
    USER_VERIFIED = "user.verified"
    USER_LOGIN = "user.login"
    USER_LOGIN_FAILED = "user.login_failed"
    USER_LOGOUT = "user.logout"
    USER_REFRESHED = "user.refreshed"
    USER_PROFILE_UPDATED = "user.profile_updated"
    USER_PREFERENCES_UPDATED = "user.preferences_updated"
    USER_AVATAR_UPDATED = "user.avatar_updated"
    USER_AVATAR_REMOVED = "user.avatar_removed"
    USER_EMAIL_CHANGE_REQUESTED = "user.email_change_requested"
    USER_EMAIL_CHANGED = "user.email_changed"
    USER_PASSWORD_RESET_REQUESTED = "user.password_reset_requested"
    USER_PASSWORD_RESET = "user.password_reset"
    USER_PASSWORD_CHANGED = "user.password_changed"
    USER_MFA_ENABLED = "user.mfa_enabled"
    USER_MFA_DISABLED = "user.mfa_disabled"
    USER_DELETED = "user.deleted"
    USER_ROLE_CHANGED = "user.role_changed"
    SESSION_REVOKED = "session.revoked"
    SESSIONS_REVOKED_ALL = "session.revoked_all"
    API_KEY_CREATED = "api_key.created"
    API_KEY_REVOKED = "api_key.revoked"
    GUEST_SESSION_STARTED = "guest.session_started"
    DEMO_SESSION_STARTED = "demo.session_started"
    BATCH_CREATED = "batch.created"
    BATCH_EXPORTED = "batch.exported"
    BATCH_MIRRORED = "batch.mirrored"
    ASSET_UPLOADED = "asset.uploaded"
    RECORD_FIELD_REVIEWED = "record.field_reviewed"
    RECORD_BULK_ACCEPTED = "record.bulk_accepted"
    ASSET_WITHDRAWN = "asset.withdrawn"
    ASSET_RESTORED = "asset.restored"
    BATCH_WITHDRAWN = "batch.withdrawn"
    BATCH_RESTORED = "batch.restored"
    RUNS_PURGED = "runs.purged_failed"
    """Failed runs removed for good (migration 0006): the only hard delete."""


# --- Holdings, investigation, catalogue (data-model §19) ----------------------
# Every list is the full vocabulary from the data model, even where P0 uses a
# subset: a VARCHAR + CHECK column gains a value with a CHECK swap, but a value
# missing here would be a migration in the middle of the demo.


class DescriptionLevel(StrEnum):
    FONDS = "fonds"
    SUBFONDS = "subfonds"
    SERIES = "series"
    FILE = "file"
    ITEM = "item"


class ExtentUnit(StrEnum):
    PLATES = "plates"
    PHOTOGRAPHS = "photographs"
    PRINTS = "prints"
    CARDS = "cards"
    MIXED = "mixed"


class BatchSource(StrEnum):
    BROWSER = "browser"
    ZIP = "zip"
    S3_PREFIX = "s3_prefix"


class BatchStatus(StrEnum):
    UPLOADING = "uploading"
    READY = "ready"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class RunMode(StrEnum):
    FAST = "fast"
    STANDARD = "standard"
    DEEP = "deep"


class AssetStatus(StrEnum):
    QUEUED = "queued"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    ANALYSING = "analysing"
    DONE = "done"
    ERROR = "error"


class AssetSide(StrEnum):
    RECTO = "recto"
    VERSO = "verso"


class FileRole(StrEnum):
    MASTER = "master"
    ACCESS = "access"
    THUMBNAIL = "thumbnail"
    IIIF_TILES = "iiif_tiles"
    XMP_JPEG = "xmp_jpeg"


class RunKind(StrEnum):
    INITIAL = "initial"
    RERUN = "rerun"
    STEER = "steer"
    TIP = "tip"
    EVAL = "eval"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_REVIEW = "awaiting_review"
    ACCEPTED = "accepted"
    ABSTAINED = "abstained"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SUPERSEDED = "superseded"


class AgentId(StrEnum):
    """The 20-agent roster (architecture §5.2). Ledger rows always carry these
    ids, never deploy-unit or stage names."""

    FORENSICS = "forensics"
    SCENE = "scene"
    HERITAGE = "heritage"
    MATERIALITY = "materiality"
    VERSO = "verso"
    TEXT_IN_IMAGE = "text-in-image"
    SKYLINE = "skyline"
    GEO = "geo"
    MEMORY = "memory"
    RESEARCH = "research"
    CHRONOLOGY = "chronology"
    SYNTHESISER = "synthesiser"
    FALSIFIER = "falsifier"
    STREETLEVEL = "streetlevel"
    REDTEAM = "redteam"
    ADJUDICATOR = "adjudicator"
    CARTOGRAPHER = "cartographer"
    MULTILINGUAL = "multilingual"
    SENSITIVITY = "sensitivity"
    CURATOR = "curator"


class InvocationStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"
    REUSED = "reused"


class RunEventKind(StrEnum):
    NOTE = "note"
    EVIDENCE = "evidence"
    OBJECTION = "objection"
    ABSTAIN = "abstain"
    VERDICT = "verdict"
    STATE = "state"
    COST = "cost"
    ERROR = "error"


class EvidenceKind(StrEnum):
    VISUAL = "visual"
    TEXTUAL = "textual"
    GEOMETRIC = "geometric"
    EXTERNAL = "external"
    ARCHIVAL = "archival"
    HUMAN = "human"


class SourceClass(StrEnum):
    """The unit of independence for the confidence rule (I-14)."""

    EXIF = "exif"
    VISUAL = "visual"
    TEXT_IN_IMAGE = "text_in_image"
    GEODATA_LAYER = "geodata_layer"
    REFERENCE_IMAGE = "reference_image"
    REVERSE_IMAGE = "reverse_image"
    """The same or a near-identical picture on a web page (Vision web detection, Lens)."""
    OPEN_RESEARCH = "open_research"
    """A model family with live web search names the value (identification-upgrade note §5)."""
    OPEN_WEB = "open_web"
    TERRAIN_GEOMETRY = "terrain_geometry"
    STREET_LEVEL = "street_level"
    ARCHIVAL = "archival"
    HUMAN = "human"


class EvidenceRelation(StrEnum):
    SUPPORTS = "supports"
    REFUTES = "refutes"


class HypothesisKind(StrEnum):
    PLACE = "place"
    BUILDING = "building"
    STREET = "street"
    FEATURE = "feature"
    DATE = "date"
    SUBJECT = "subject"
    PHOTOGRAPHER = "photographer"


class HypothesisStatus(StrEnum):
    OPEN = "open"
    REFUTED = "refuted"
    SURVIVING = "surviving"
    SELECTED = "selected"
    REJECTED = "rejected"


class HypothesisOrigin(StrEnum):
    SYNTHESISER = "synthesiser"
    EXIF = "exif"
    REFERENCE_MATCH = "reference_match"
    STEER = "steer"
    TIP = "tip"


class ObjectionResolution(StrEnum):
    OPEN = "open"
    UPHELD = "upheld"
    DISMISSED = "dismissed"
    PARTIALLY_UPHELD = "partially_upheld"


class RecordStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    HELD = "held"
    EXPORTED = "exported"
    REOPENED = "reopened"


class ActorKind(StrEnum):
    HUMAN = "human"
    MACHINE = "machine"
    SYSTEM = "system"


class VersionChange(StrEnum):
    GENERATED = "generated"
    STEERED = "steered"
    EDITED = "edited"
    REJECTED = "rejected"
    FILLED = "filled"
    APPROVED_SNAPSHOT = "approved_snapshot"
    REOPENED = "reopened"


class FieldDecisionKind(StrEnum):
    EMIT = "emit"
    EMIT_WITH_REVIEW = "emit_with_review"
    ABSTAIN = "abstain"


class AbstainReason(StrEnum):
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    CONFLICTING_EVIDENCE = "conflicting_evidence"
    OUT_OF_SCOPE = "out_of_scope"
    SENSITIVITY_HOLD = "sensitivity_hold"


class FieldOrigin(StrEnum):
    MACHINE = "machine"
    HUMAN = "human"
    CARRIED = "carried"


class ReviewAction(StrEnum):
    ACCEPTED_UNCHANGED = "accepted_unchanged"
    EDITED = "edited"
    REJECTED = "rejected"
    FILLED = "filled"
    CONSTRAINT_DISABLED = "constraint_disabled"


class EvidenceRole(StrEnum):
    PRIMARY = "primary"
    SUPPORTING = "supporting"
    CONTESTED = "contested"


class ExportFormat(StrEnum):
    XLSX = "xlsx"
    ISAD_CSV = "isad_csv"
    EAD3 = "ead3"
    DC_XML = "dc_xml"
    IIIF_MANIFEST = "iiif_manifest"
    RICO_JSONLD = "rico_jsonld"
    XMP_JPEG = "xmp_jpeg"


class ExportScope(StrEnum):
    BATCH = "batch"
    RECORD = "record"
    SELECTION = "selection"
    FONDS = "fonds"
    APPROVED_SINCE = "approved_since"
