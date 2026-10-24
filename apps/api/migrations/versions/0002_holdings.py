"""Holdings: fonds, upload batches, assets, asset files (data-model §6, P0 subset).

Revision ID: 0002_holdings
Revises: 0001_identity
Create Date: 2026-10-24

The two columns the brief made load-bearing are `assets.external_ref` (the
delivered filename, the Excel's unique link to the file) and `assets.priority`
(1 = the 50 Prio-1 photos). EXIF lands in witness columns (BR-10).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import zeitzeuge_api.db.base
from zeitzeuge_api.db.rls import enable_tenant_rls, grant_app, is_postgres

revision: str = "0002_holdings"
down_revision: str | None = "0001_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("fonds", "upload_batches", "assets", "asset_files")


def upgrade() -> None:
    op.create_table(
        "fonds",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("parent_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("reference_code", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column(
            "level",
            sa.Enum(
                "fonds",
                "subfonds",
                "series",
                "file",
                "item",
                name="description_level",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("scope_note", sa.Text(), nullable=True),
        sa.Column("creator_name", sa.String(length=200), nullable=True),
        sa.Column("finding_aid_from", sa.SmallInteger(), nullable=True),
        sa.Column("finding_aid_to", sa.SmallInteger(), nullable=True),
        sa.Column("extent", sa.Integer(), nullable=False),
        sa.Column(
            "extent_unit",
            sa.Enum(
                "plates",
                "photographs",
                "prints",
                "cards",
                "mixed",
                name="extent_unit",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("digitised", sa.Boolean(), nullable=False),
        sa.Column("ais_ref", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_fonds_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["parent_id"], ["fonds.id"], name=op.f("fk_fonds_parent_id_fonds")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fonds")),
        sa.UniqueConstraint("org_id", "reference_code", name="uq_fonds_org_id_reference_code"),
        sa.UniqueConstraint("org_id", "slug", name="uq_fonds_org_id_slug"),
    )
    op.create_table(
        "upload_batches",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("created_by", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "source",
            sa.Enum(
                "browser", "zip", "s3_prefix", name="batch_source", native_enum=False, length=32
            ),
            nullable=False,
        ),
        sa.Column("source_ref", sa.Text(), nullable=True),
        sa.Column("label", sa.String(length=64), nullable=True),
        sa.Column("fonds_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "run_mode",
            sa.Enum("fast", "standard", "deep", name="run_mode", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("asset_count", sa.Integer(), nullable=False),
        sa.Column("paired_count", sa.Integer(), nullable=False),
        sa.Column("issue_count", sa.Integer(), nullable=False),
        sa.Column("issues", zeitzeuge_api.db.base.JSONDict(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "uploading",
                "ready",
                "running",
                "done",
                "failed",
                name="batch_status",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("mirrored_from_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("mirrored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_upload_batches_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["fonds_id"], ["fonds.id"], name=op.f("fk_upload_batches_fonds_id_fonds")
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_upload_batches_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_upload_batches")),
    )
    op.create_index(
        "ix_upload_batches_org_id_label", "upload_batches", ["org_id", "label"], unique=False
    )
    op.create_table(
        "assets",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("fonds_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("batch_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("signature", sa.String(length=128), nullable=True),
        sa.Column("external_ref", sa.String(length=260), nullable=False),
        sa.Column("priority", sa.SmallInteger(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exif_lat", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("exif_lon", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("exif_make", sa.String(length=64), nullable=True),
        sa.Column("exif_model", sa.String(length=64), nullable=True),
        sa.Column("exif_focal_mm", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("exif_hfov_deg", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("outside_canton", sa.Boolean(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "uploading",
                "uploaded",
                "analysing",
                "done",
                "error",
                name="asset_status",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("forensics", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("created_by", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "priority IS NULL OR priority BETWEEN 1 AND 9", name=op.f("ck_assets_priority_range")
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["upload_batches.id"],
            name=op.f("fk_assets_batch_id_upload_batches"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_assets_created_by_users")
        ),
        sa.ForeignKeyConstraint(["fonds_id"], ["fonds.id"], name=op.f("fk_assets_fonds_id_fonds")),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_assets_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assets")),
        sa.UniqueConstraint(
            "org_id", "batch_id", "external_ref", name="uq_assets_batch_external_ref"
        ),
    )
    op.create_index("ix_assets_org_id_priority", "assets", ["org_id", "priority"], unique=False)
    op.create_table(
        "asset_files",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("asset_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column(
            "side",
            sa.Enum("recto", "verso", name="asset_side", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum(
                "master",
                "access",
                "thumbnail",
                "iiif_tiles",
                "xmp_jpeg",
                name="file_role",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("bucket", sa.String(length=63), nullable=False),
        sa.Column("s3_key", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.String(length=260), nullable=True),
        sa.Column("mime_type", sa.String(length=64), nullable=False),
        sa.Column("bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.Column("exif", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role <> 'master' OR bytes <= 209715200", name=op.f("ck_asset_files_master_size")
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.id"],
            name=op.f("fk_asset_files_asset_id_assets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_asset_files_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_files")),
        sa.UniqueConstraint("asset_id", "side", "role", name="uq_asset_files_asset_side_role"),
    )

    if is_postgres():
        _apply_row_level_security()


def _apply_row_level_security() -> None:
    """Policies, grants and triggers — also loaded by `tests/_policies.py`."""
    enable_tenant_rls(TABLES)
    grant_app(TABLES, "SELECT, INSERT, UPDATE, DELETE")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
