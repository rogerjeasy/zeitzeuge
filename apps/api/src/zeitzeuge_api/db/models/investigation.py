"""Investigation: runs, agent invocations, run events and the Evidence Ledger
(data-model §7).

`runs` is one investigation of one asset. Everything an agent concludes is an
`evidence_items` row with a `source_class` — the unit of independence the
confidence rule counts (I-14) — and hypotheses cite evidence through
`evidence_links`, never free text. The ledger is append-only for the
application: corrections arrive as new `human` evidence.

P0 runs the stages in-process (design note D1). Each stage writes one
`agent_invocations` row under its primary roster id and records the other roster
roles it played in `acting_as`; its validated output is what a resumed run
reads instead of recomputing.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from zeitzeuge_api.db.base import GUID, Base, JSONDict, StringArray, enum_column, uuid_pk
from zeitzeuge_api.db.models.enums import (
    AgentId,
    EvidenceKind,
    EvidenceRelation,
    HypothesisKind,
    HypothesisOrigin,
    HypothesisStatus,
    InvocationStatus,
    ObjectionResolution,
    RunEventKind,
    RunKind,
    RunMode,
    RunStatus,
    SourceClass,
)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _org_fk() -> Mapped[uuid.UUID]:
    return mapped_column(GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


def _run_fk() -> Mapped[uuid.UUID]:
    return mapped_column(GUID(), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    public_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("upload_batches.id", ondelete="SET NULL")
    )
    kind: Mapped[RunKind] = mapped_column(
        enum_column(RunKind, "run_kind"), nullable=False, default=RunKind.INITIAL
    )
    parent_run_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("runs.id"))
    mode: Mapped[RunMode] = mapped_column(
        enum_column(RunMode, "run_mode"), nullable=False, default=RunMode.STANDARD
    )
    reached_stage: Mapped[RunMode | None] = mapped_column(enum_column(RunMode, "run_mode"))
    status: Mapped[RunStatus] = mapped_column(
        enum_column(RunStatus, "run_status"), nullable=False, default=RunStatus.QUEUED
    )
    current_stage: Mapped[str | None] = mapped_column(String(32))
    """The pipeline stage in progress — what the queue screen's progress shows."""
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    outcome_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    agents_total: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    agents_completed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    abstentions: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    models_manifest_sha: Mapped[str | None] = mapped_column(String(64))
    code_version: Mapped[str | None] = mapped_column(String(64))
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        CheckConstraint(
            "outcome_confidence IS NULL OR outcome_confidence BETWEEN 0 AND 1",
            name="outcome_confidence_range",
        ),
        Index("ix_runs_status_created_at", "status", "created_at"),
        Index("ix_runs_batch_id", "batch_id"),
        Index("ix_runs_asset_id", "asset_id"),
        Index(
            "ix_runs_claimable",
            "created_at",
            postgresql_where=text("status IN ('queued', 'running')"),
        ),
    )


class AgentInvocation(Base):
    __tablename__ = "agent_invocations"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    run_id: Mapped[uuid.UUID] = _run_fk()
    agent_id: Mapped[AgentId] = mapped_column(enum_column(AgentId, "agent_id"), nullable=False)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    acting_as: Mapped[list[str]] = mapped_column(StringArray(), nullable=False, default=list)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    attempt: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    status: Mapped[InvocationStatus] = mapped_column(
        enum_column(InvocationStatus, "invocation_status"),
        nullable=False,
        default=InvocationStatus.PENDING,
    )
    reused_from_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("agent_invocations.id")
    )
    model_binding: Mapped[str | None] = mapped_column(String(64))
    model_id: Mapped[str | None] = mapped_column(String(128))
    inference_profile: Mapped[str | None] = mapped_column(String(128))
    region: Mapped[str | None] = mapped_column(String(64))
    input_sha256: Mapped[str | None] = mapped_column(String(64))
    output_schema_id: Mapped[str | None] = mapped_column(String(128))
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    io_s3_key: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())

    __table_args__ = (
        UniqueConstraint(
            "run_id", "stage", "attempt", name="uq_agent_invocations_run_stage_attempt"
        ),
    )


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    run_id: Mapped[uuid.UUID] = _run_fk()
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    local_id: Mapped[str | None] = mapped_column(String(8))
    t_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    agent_id: Mapped[AgentId] = mapped_column(enum_column(AgentId, "agent_id"), nullable=False)
    kind: Mapped[RunEventKind] = mapped_column(
        enum_column(RunEventKind, "run_event_kind"), nullable=False
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    message_key: Mapped[str | None] = mapped_column(String(64))
    evidence_local_id: Mapped[str | None] = mapped_column(String(8))
    posteriors: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    kills: Mapped[list[str] | None] = mapped_column(StringArray())
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (UniqueConstraint("run_id", "seq", name="uq_run_events_run_id_seq"),)


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    run_id: Mapped[uuid.UUID] = _run_fk()
    local_id: Mapped[str] = mapped_column(String(8), nullable=False)
    kind: Mapped[EvidenceKind] = mapped_column(
        enum_column(EvidenceKind, "evidence_kind"), nullable=False
    )
    source_class: Mapped[SourceClass] = mapped_column(
        enum_column(SourceClass, "evidence_source_class"), nullable=False
    )
    agent_id: Mapped[AgentId | None] = mapped_column(enum_column(AgentId, "agent_id"))
    invocation_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("agent_invocations.id")
    )
    model_id: Mapped[str | None] = mapped_column(String(128))
    created_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    observation: Mapped[str] = mapped_column(Text, nullable=False)
    observation_key: Mapped[str | None] = mapped_column(String(64))
    region: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    side: Mapped[str | None] = mapped_column(String(8))
    source: Mapped[str | None] = mapped_column(Text)
    source_uri: Mapped[str | None] = mapped_column(Text)
    artifact_s3_key: Mapped[str | None] = mapped_column(Text)
    strength: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    implies: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    """What the item asserts, machine-readable: `{field, value, lv95?, ...}`."""
    reused_from_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("evidence_items.id")
    )
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        UniqueConstraint("run_id", "local_id", name="uq_evidence_items_run_id_local_id"),
        CheckConstraint("strength BETWEEN 0 AND 1", name="strength_range"),
        CheckConstraint("(kind = 'human') = (created_by IS NOT NULL)", name="human_iff_created_by"),
    )


class EvidenceLink(Base):
    __tablename__ = "evidence_links"

    evidence_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("evidence_items.id", ondelete="CASCADE"), primary_key=True
    )
    hypothesis_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("hypotheses.id", ondelete="CASCADE"), primary_key=True
    )
    org_id: Mapped[uuid.UUID] = _org_fk()
    relation: Mapped[EvidenceRelation] = mapped_column(
        enum_column(EvidenceRelation, "evidence_relation"), nullable=False
    )


class Hypothesis(Base):
    __tablename__ = "hypotheses"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    run_id: Mapped[uuid.UUID] = _run_fk()
    local_id: Mapped[str] = mapped_column(String(8), nullable=False)
    kind: Mapped[HypothesisKind] = mapped_column(
        enum_column(HypothesisKind, "hypothesis_kind"), nullable=False
    )
    field_key: Mapped[str | None] = mapped_column(String(32))
    """Which ranked field the hypothesis answers (`building`, `street`, …)."""
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    camera_pose: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    prior: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    posterior: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    status: Mapped[HypothesisStatus] = mapped_column(
        enum_column(HypothesisStatus, "hypothesis_status"),
        nullable=False,
        default=HypothesisStatus.OPEN,
    )
    refuted_by_evidence_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("evidence_items.id")
    )
    origin: Mapped[HypothesisOrigin] = mapped_column(
        enum_column(HypothesisOrigin, "hypothesis_origin"),
        nullable=False,
        default=HypothesisOrigin.SYNTHESISER,
    )
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (
        UniqueConstraint("run_id", "local_id", name="uq_hypotheses_run_id_local_id"),
        CheckConstraint("prior BETWEEN 0 AND 1", name="prior_range"),
    )


class Objection(Base):
    __tablename__ = "objections"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = _org_fk()
    run_id: Mapped[uuid.UUID] = _run_fk()
    hypothesis_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("hypotheses.id", ondelete="CASCADE"), nullable=False
    )
    evidence_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("evidence_items.id"))
    from_agent: Mapped[AgentId] = mapped_column(enum_column(AgentId, "agent_id"), nullable=False)
    model_id: Mapped[str | None] = mapped_column(String(128))
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    resolution: Mapped[ObjectionResolution] = mapped_column(
        enum_column(ObjectionResolution, "objection_resolution"),
        nullable=False,
        default=ObjectionResolution.OPEN,
    )
    resolution_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()

    __table_args__ = (CheckConstraint("severity BETWEEN 0 AND 1", name="severity_range"),)
