"""Withdrawal: photos and batches leave every view without being destroyed.

Revision ID: 0005_withdrawal
Revises: 0004_catalogue
Create Date: 2026-10-24

An archive does not delete what it once held: the originals bucket is Object
Lock and the ledger is append-only. «Entfernen» therefore sets `deleted_at`,
and every read path filters on it (batch-management note §1). Restoring
clears it. The existing tenant policies cover the new columns.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import zeitzeuge_api.db.base

revision: str = "0005_withdrawal"
down_revision: str | None = "0004_catalogue"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "assets",
        sa.Column(
            "deleted_by",
            zeitzeuge_api.db.base.GUID(),
            sa.ForeignKey("users.id", name="fk_assets_deleted_by_users"),
            nullable=True,
        ),
    )
    op.add_column("assets", sa.Column("deletion_reason", sa.Text(), nullable=True))
    op.create_index("ix_assets_org_id_deleted_at", "assets", ["org_id", "deleted_at"])
    op.add_column(
        "upload_batches", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "upload_batches",
        sa.Column(
            "deleted_by",
            zeitzeuge_api.db.base.GUID(),
            sa.ForeignKey("users.id", name="fk_upload_batches_deleted_by_users"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("upload_batches", "deleted_by")
    op.drop_column("upload_batches", "deleted_at")
    op.drop_index("ix_assets_org_id_deleted_at", table_name="assets")
    op.drop_column("assets", "deletion_reason")
    op.drop_column("assets", "deleted_by")
    op.drop_column("assets", "deleted_at")
