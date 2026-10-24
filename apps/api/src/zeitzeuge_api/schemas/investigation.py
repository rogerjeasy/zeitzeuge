"""Request and response shapes of the investigation surface (architecture §10.2).

The response models follow data-model §14 (`CaseFile`, `QueueItem`, `ExcelRow`)
in the subset P0 serves. Values a model produced arrive here as plain strings:
the web app renders them escaped, never as markup.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from zeitzeuge_api.db.models.enums import RunMode
from zeitzeuge_api.schemas.common import NonEmptyStr, Schema

ImageType = Literal["image/jpeg", "image/png", "image/tiff", "image/webp"]


class CreateBatchRequest(Schema):
    label: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    fonds_slug: str = Field(default="foto21", pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    mode: RunMode = RunMode.STANDARD
    priority: int | None = Field(default=None, ge=1, le=9)
    """Default priority for every file in the batch (`1` for the Prio-1 set)."""


class FileToRegister(Schema):
    filename: str = Field(min_length=1, max_length=260)
    content_type: ImageType
    content_length: int = Field(gt=0, le=209_715_200)
    sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    priority: int | None = Field(default=None, ge=1, le=9)


class RegisterFilesRequest(Schema):
    files: list[FileToRegister] = Field(min_length=1, max_length=200)


class UploadTicketOut(Schema):
    upload_url: str
    fields: dict[str, str] = Field(description="POST these as multipart form fields, `file` last.")
    key: str
    expires_in: int
    max_bytes: int


class RegisteredFile(Schema):
    asset_id: str
    filename: str
    upload: UploadTicketOut | None
    """None when the file is already in the batch (re-registering is idempotent)."""
    status: str


class RegisterFilesResponse(Schema):
    batch_id: str
    files: list[RegisteredFile]


class CommitResponse(Schema):
    asset_id: str
    run_id: str
    status: str


class FieldSummary(Schema):
    value: str | None
    decision: str
    confidence: float | None


class BatchAsset(Schema):
    asset_id: str
    external_ref: str
    priority: int | None
    status: str
    stage: str | None
    run_id: str | None
    run_status: str | None
    error: str | None
    outcome_confidence: float | None
    record_id: str | None
    status_label: str | None
    """übernahmefähig · Prüfbedarf · unbestimmt (design note §4)."""
    qc_status: str
    fields: dict[str, FieldSummary]
    preview_url: str | None
    captured_at: datetime | None = None
    deleted_at: datetime | None = None
    deletion_reason: str | None = None


class BatchCounts(Schema):
    total: int
    uploaded: int
    queued: int
    running: int
    done: int
    failed: int
    accepted: int
    review: int
    undetermined: int
    deleted: int = 0
    """Withdrawn photos in the batch, whatever `include_deleted` says."""


class BatchOut(Schema):
    id: str
    label: str | None
    status: str
    created_at: datetime
    mirrored_from: str | None
    mirrored_at: datetime | None
    deleted_at: datetime | None = None
    counts: BatchCounts
    assets: list[BatchAsset]


class BatchSummary(Schema):
    id: str
    label: str | None
    status: str
    created_at: datetime
    asset_count: int
    mirrored_from: str | None
    deleted_at: datetime | None = None


class EvidenceOut(Schema):
    id: str
    kind: str
    source_class: str
    source_class_label: str
    agent: str | None
    model: str | None
    observation: str
    source: str | None
    source_uri: str | None
    strength: float
    field: str | None
    value: str | None


class HypothesisOutSchema(Schema):
    id: str
    field: str | None
    value: str
    prior: float
    posterior: float | None
    status: str
    supporting: list[str]
    refuting: list[str]


class ObjectionOutSchema(Schema):
    hypothesis: str
    claim: str
    severity: float
    resolution: str
    model: str | None


class CaseField(Schema):
    key: str
    label: str
    rank: int | None
    decision: str
    value: str | None
    typed_value: Any | None
    confidence: float | None
    raw_confidence: float | None
    explanation: str | None
    rationale: str | None
    abstain_reason: str | None
    source_classes: list[str]
    evidence: list[str]
    """Local evidence ids cited by this field (`ev_007`)."""
    origin: str
    review_action: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None


class RunEventOut(Schema):
    seq: int
    t_ms: int
    agent: str
    kind: str
    summary: str
    evidence: str | None


class CaseRun(Schema):
    id: str
    status: str
    stage: str | None
    started_at: datetime | None
    finished_at: datetime | None
    cost_usd: float
    models: list[str]
    error: str | None


class CaseFile(Schema):
    deleted_at: datetime | None = None
    deletion_reason: str | None = None
    record_id: str | None
    version: int | None
    asset_id: str
    external_ref: str
    priority: int | None
    captured_at: datetime | None
    camera: str | None
    preview_url: str | None
    batch_id: str | None
    status_label: str | None
    qc_status: str
    row_confidence: float | None
    run: CaseRun | None
    fields: list[CaseField]
    evidence: list[EvidenceOut]
    hypotheses: list[HypothesisOutSchema]
    objections: list[ObjectionOutSchema]
    events: list[RunEventOut]


class FieldReviewRequest(Schema):
    action: Literal["accept", "correct", "reject"]
    value: NonEmptyStr | None = None
    reason: str | None = Field(default=None, max_length=1000)


class QcSummaryOut(Schema):
    batch: str | None
    total: int
    processed: int
    confirmed: int
    corrected: int
    open: int
    machine: int
    override_rate: dict[str, float | None] = Field(alias="overrideRate")


# --- batch management (batch-management note §3) -------------------------------

BulkAction = Literal["delete", "restore", "rerun", "accept"]


class WithdrawRequest(Schema):
    reason: str | None = Field(default=None, max_length=500)


class BulkRequest(Schema):
    action: BulkAction
    asset_ids: list[uuid.UUID] = Field(min_length=1, max_length=600)
    reason: str | None = Field(default=None, max_length=500)


class BulkItem(Schema):
    asset_id: str
    ok: bool
    detail: str | None = None
    """already_withdrawn · not_withdrawn · not_found · running · withdrawn ·
    no_record · nothing_to_accept"""


class BulkResult(Schema):
    action: BulkAction
    requested: int
    succeeded: int
    results: list[BulkItem]


class BatchWithdrawResult(Schema):
    batch_id: str
    deleted_at: datetime | None = None
    assets: int

