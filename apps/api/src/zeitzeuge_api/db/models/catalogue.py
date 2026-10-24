"""Catalogue: records, immutable versions, fields with provenance, reviews and
exports (data-model §8).

A record is a mutable head over append-only versions. Every machine run and
every human touch is a new `record_versions` row, so the archive never loses
what it once said, and `QC_Status` in the workbook is derived from these rows
rather than stored.

`record_fields` carries the inputs of the confidence rule — `source_classes`,
`corroborating_count`, `objection_count`, `raw_confidence` — next to the result,
so the Excel can print why a number is what it is (BR-6, ADR-15). Two P0
additions beside the data model: `explanation` (the rendered one-line reason,
«3 Quellenarten bestätigen (…) · 0 Einwände») and `rationale` (the
adjudicator's prose for the review screen).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from zeitzeuge_api.db.base import GUID, Base, JSONDict, StringArray, enum_column, uuid_pk
from zeitzeuge_api.db.models.enums import (
    AbstainReason,
    ActorKind,
    AgentId,
    EvidenceRole,
    ExportFormat,
    ExportScope,
    FieldDecisionKind,
    FieldOrigin,
    RecordStatus,
    ReviewAction,
    VersionChange,
)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _org_fk() -> Mapped[uuid.UUID]:
    return mapped_column(GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


class FieldDefinition(Base):
    """Global reference table: the field ↔ Excel ↔ standards mapping as data."""

    __tablename__ = "field_definitions"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    label_de: Mapped[str] = mapped_column(String(120), nullable=False)
    priority_rank: Mapped[int | None] = mapped_column(SmallInteger)
    excel_column: Mapped[str | None] = mapped_column(String(64))
    isad: Mapped[str | None] = mapped_column(String(32))
    dublin_core: Mapped[str | None] = mapped_column(String(64))
    ead3: Mapped[str | None] = mapped_column(String(128))
    scope_archiv: Mapped[str | None] = mapped_column(String(128))
    value_type: Mapped[str] = mapped_column(String(32), nullable=False)
    owning_agent: Mapped[AgentId | None] = mapped_column(enum_column(AgentId, "agent_id"))
    description_de: Mapped[str | None] = mapped_column(Text)


class CatalogueRecord(Base):
    __tablename__ = "catalogue_records"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    asset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    fonds_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("fonds.id"), nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[RecordStatus] = mapped_column(
        enum_column(RecordStatus, "record_status"), nullable=False, default=RecordStatus.IN_REVIEW
    )
    approved_version: Mapped[int | None] = mapped_column(Integer)
    publication_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    public_assist: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class RecordVersion(Base):
    __tablename__ = "record_versions"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    record_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("catalogue_records.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    run_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("runs.id"))
    parent_version: Mapped[int | None] = mapped_column(Integer)
    actor_kind: Mapped[ActorKind] = mapped_column(
        enum_column(ActorKind, "actor_kind"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    change_kind: Mapped[VersionChange] = mapped_column(
        enum_column(VersionChange, "version_change"), nullable=False
    )
    formula_weights: Mapped[dict[str, Any]] = mapped_column(
        JSONDict(), nullable=False, default=dict
    )
    summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        UniqueConstraint("record_id", "version", name="uq_record_versions_record_id_version"),
        CheckConstraint(
            "(actor_kind = 'human') = (actor_user_id IS NOT NULL)", name="human_iff_actor_user"
        ),
    )


class RecordField(Base):
    __tablename__ = "record_fields"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    record_version_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("record_versions.id", ondelete="CASCADE"), nullable=False
    )
    field_key: Mapped[str] = mapped_column(
        String(32), ForeignKey("field_definitions.key"), nullable=False
    )
    decision: Mapped[FieldDecisionKind] = mapped_column(
        enum_column(FieldDecisionKind, "field_decision"), nullable=False
    )
    abstain_reason: Mapped[AbstainReason | None] = mapped_column(
        enum_column(AbstainReason, "abstain_reason")
    )
    value_text: Mapped[str | None] = mapped_column(Text)
    value: Mapped[Any | None] = mapped_column(JSONDict())
    value_uri: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    raw_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    source_classes: Mapped[list[str]] = mapped_column(StringArray(), nullable=False, default=list)
    corroborating_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    objection_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    explanation: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    generated_by: Mapped[str] = mapped_column(String(64), nullable=False)
    agent_id: Mapped[AgentId | None] = mapped_column(enum_column(AgentId, "agent_id"))
    models: Mapped[list[str]] = mapped_column(StringArray(), nullable=False, default=list)
    method: Mapped[str | None] = mapped_column(String(128))
    generated_at: Mapped[datetime] = _created_at()
    origin: Mapped[FieldOrigin] = mapped_column(
        enum_column(FieldOrigin, "field_origin"), nullable=False, default=FieldOrigin.MACHINE
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    review_action: Mapped[ReviewAction | None] = mapped_column(
        enum_column(ReviewAction, "review_action")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    overrode_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))

    __table_args__ = (
        UniqueConstraint("record_version_id", "field_key", name="uq_record_fields_version_field"),
        CheckConstraint(
            "decision <> 'abstain' OR (value_text IS NULL AND confidence IS NULL "
            "AND abstain_reason IS NOT NULL)",
            name="abstain_is_empty",
        ),
        CheckConstraint(
            "decision = 'abstain' OR (confidence IS NOT NULL AND abstain_reason IS NULL "
            "AND corroborating_count >= 1)",
            name="emit_has_confidence",
        ),
        CheckConstraint(
            "confidence IS NULL OR confidence BETWEEN 0 AND 1", name="confidence_range"
        ),
        CheckConstraint("origin <> 'human' OR reviewed_by IS NOT NULL", name="human_has_reviewer"),
    )


class RecordFieldEvidence(Base):
    __tablename__ = "record_field_evidence"

    record_field_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("record_fields.id", ondelete="CASCADE"), primary_key=True
    )
    evidence_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("evidence_items.id", ondelete="CASCADE"), primary_key=True
    )
    org_id: Mapped[uuid.UUID] = _org_fk()
    role: Mapped[EvidenceRole] = mapped_column(
        enum_column(EvidenceRole, "evidence_role"), nullable=False, default=EvidenceRole.SUPPORTING
    )


class FieldReview(Base):
    __tablename__ = "field_reviews"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    record_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("catalogue_records.id", ondelete="CASCADE"), nullable=False
    )
    from_version: Mapped[int] = mapped_column(Integer, nullable=False)
    to_version: Mapped[int] = mapped_column(Integer, nullable=False)
    field_key: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[ReviewAction] = mapped_column(
        enum_column(ReviewAction, "review_action"), nullable=False
    )
    from_value_text: Mapped[str | None] = mapped_column(Text)
    to_value_text: Mapped[str | None] = mapped_column(Text)
    overrode_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    reason: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (Index("ix_field_reviews_record_id", "record_id"),)


class Export(Base):
    __tablename__ = "exports"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    format: Mapped[ExportFormat] = mapped_column(
        enum_column(ExportFormat, "export_format"), nullable=False
    )
    scope: Mapped[ExportScope] = mapped_column(
        enum_column(ExportScope, "export_scope"), nullable=False
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("upload_batches.id"))
    record_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    includes_unapproved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    s3_key: Mapped[str | None] = mapped_column(Text)
    sha256: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "includes_unapproved = false OR format = 'xlsx'", name="only_xlsx_unapproved"
        ),
    )


class ExportItem(Base):
    __tablename__ = "export_items"

    export_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("exports.id", ondelete="CASCADE"), primary_key=True
    )
    record_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("catalogue_records.id", ondelete="CASCADE"), primary_key=True
    )
    org_id: Mapped[uuid.UUID] = _org_fk()
    version: Mapped[int] = mapped_column(Integer, nullable=False)
