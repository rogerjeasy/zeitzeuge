"""Holdings: fonds, upload batches, assets and the bytes behind them (data-model §6).

An *asset* is one photograph — recto plus optional verso — and the thing every
later table hangs off. The two columns the brief made load-bearing are
`external_ref` (the delivered filename: the Excel's «eindeutige Zuordnung zur
Bilddatei») and `priority` (1 = one of Ralph Ruch's 50 Prio-1 photos).

EXIF is stored as *witness* columns, not as facts: `captured_at` fills the date
with `source_class = exif` evidence, and a GPS fix would enter the ledger as a
hypothesis. Coordinates are plain numerics rather than PostGIS `geography` so
the same schema loads on SQLite for the unit suite and on a local pgvector
image without the extension; nothing in P0 needs a spatial index.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
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

from zeitzeuge_api.db.base import GUID, Base, JSONDict, TimestampMixin, enum_column, uuid_pk
from zeitzeuge_api.db.models.enums import (
    AssetSide,
    AssetStatus,
    BatchSource,
    BatchStatus,
    DescriptionLevel,
    ExtentUnit,
    FileRole,
    RunMode,
)

MAX_MASTER_BYTES = 209_715_200
"""`MAX_FILE_BYTES` in the upload screen; enforced by S3 and by a CHECK."""


class Fonds(Base, TimestampMixin):
    __tablename__ = "fonds"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("fonds.id"))
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    reference_code: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    level: Mapped[DescriptionLevel] = mapped_column(
        enum_column(DescriptionLevel, "description_level"), nullable=False
    )
    scope_note: Mapped[str | None] = mapped_column(Text)
    creator_name: Mapped[str | None] = mapped_column(String(200))
    finding_aid_from: Mapped[int | None] = mapped_column(SmallInteger)
    finding_aid_to: Mapped[int | None] = mapped_column(SmallInteger)
    extent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extent_unit: Mapped[ExtentUnit] = mapped_column(
        enum_column(ExtentUnit, "extent_unit"), nullable=False
    )
    digitised: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ais_ref: Mapped[str | None] = mapped_column(String(128))

    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_fonds_org_id_slug"),
        UniqueConstraint("org_id", "reference_code", name="uq_fonds_org_id_reference_code"),
    )


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    source: Mapped[BatchSource] = mapped_column(
        enum_column(BatchSource, "batch_source"), nullable=False
    )
    source_ref: Mapped[str | None] = mapped_column(Text)
    label: Mapped[str | None] = mapped_column(String(64))
    """`prio1` for the 50 Priority-1 photos; the batch workbook is keyed on it."""
    fonds_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("fonds.id"))
    run_mode: Mapped[RunMode] = mapped_column(
        enum_column(RunMode, "run_mode"), nullable=False, default=RunMode.STANDARD
    )
    asset_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paired_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    issue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    issues: Mapped[list[Any]] = mapped_column(JSONDict(), nullable=False, default=list)
    status: Mapped[BatchStatus] = mapped_column(
        enum_column(BatchStatus, "batch_status"), nullable=False, default=BatchStatus.UPLOADING
    )
    mirrored_from_id: Mapped[uuid.UUID | None] = mapped_column(GUID())
    """Set on the demo tenant's copy of a Staatsarchiv batch (D9). Deliberately
    not a foreign key: the source lives in another tenant, invisible under RLS."""
    mirrored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_upload_batches_org_id_label", "org_id", "label"),)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    fonds_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("fonds.id"), nullable=False)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("upload_batches.id", ondelete="SET NULL")
    )
    signature: Mapped[str | None] = mapped_column(String(128))
    external_ref: Mapped[str] = mapped_column(String(260), nullable=False)
    priority: Mapped[int | None] = mapped_column(SmallInteger)

    # --- EXIF witnesses (BR-10) ---------------------------------------------
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exif_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    exif_lon: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    exif_make: Mapped[str | None] = mapped_column(String(64))
    exif_model: Mapped[str | None] = mapped_column(String(64))
    exif_focal_mm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    exif_hfov_deg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    outside_canton: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[AssetStatus] = mapped_column(
        enum_column(AssetStatus, "asset_status"), nullable=False, default=AssetStatus.QUEUED
    )
    forensics: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    created_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))

    # --- withdrawal (batch-management note §1): never a hard delete ----------
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("users.id"))
    deletion_reason: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("org_id", "batch_id", "external_ref", name="uq_assets_batch_external_ref"),
        Index("ix_assets_org_id_deleted_at", "org_id", "deleted_at"),
        CheckConstraint("priority IS NULL OR priority BETWEEN 1 AND 9", name="priority_range"),
        Index("ix_assets_org_id_priority", "org_id", "priority"),
    )


class AssetFile(Base):
    __tablename__ = "asset_files"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    side: Mapped[AssetSide] = mapped_column(enum_column(AssetSide, "asset_side"), nullable=False)
    role: Mapped[FileRole] = mapped_column(enum_column(FileRole, "file_role"), nullable=False)
    bucket: Mapped[str] = mapped_column(String(63), nullable=False)
    s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(260))
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64))
    """Null until the upload is committed and verified."""
    width_px: Mapped[int | None] = mapped_column(Integer)
    height_px: Mapped[int | None] = mapped_column(Integer)
    exif: Mapped[dict[str, Any] | None] = mapped_column(JSONDict())
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("asset_id", "side", "role", name="uq_asset_files_asset_side_role"),
        CheckConstraint(f"role <> 'master' OR bytes <= {MAX_MASTER_BYTES}", name="master_size"),
    )
