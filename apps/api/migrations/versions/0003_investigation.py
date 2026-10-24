"""Investigation: runs, invocations, run events and the Evidence Ledger
(data-model §7, P0 subset).

Revision ID: 0003_investigation
Revises: 0002_holdings
Create Date: 2026-10-24

The ledger tables (`evidence_items`, `evidence_links`) are append-only for the
application: SELECT and INSERT policies and grants, nothing else. A correction
is new `human` evidence, never an edit.

`runs` carries one extra policy pair for the investigation worker (design note
D2). The worker has to *find* queued work before it knows which tenant the
work belongs to, the same problem sign-in has, solved the same way as
`bootstrap` in `0001`. A transaction that announces `app.role = 'worker'` may
see and update `runs` across tenants, and nothing else. Once it has claimed a
run it re-announces that run's tenant, and every ledger read and write after
that is ordinary tenant-scoped RLS.

`pg_notify` fan-out for the live stream (design note D8) is a function so the
channel naming lives in one place.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import zeitzeuge_api.db.base
from zeitzeuge_api.db.rls import enable_tenant_rls, grant_app, is_postgres

revision: str = "0003_investigation"
down_revision: str | None = "0002_holdings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "runs",
    "agent_invocations",
    "run_events",
    "evidence_items",
    "hypotheses",
    "evidence_links",
    "objections",
)
APPEND_ONLY = ("evidence_items", "evidence_links", "run_events")


def upgrade() -> None:
    op.create_table(
        "runs",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("asset_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("batch_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "initial",
                "rerun",
                "steer",
                "tip",
                "eval",
                name="run_kind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("parent_run_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "mode",
            sa.Enum("fast", "standard", "deep", name="run_mode", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column(
            "reached_stage",
            sa.Enum("fast", "standard", "deep", name="run_mode", native_enum=False, length=32),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "running",
                "awaiting_review",
                "accepted",
                "abstained",
                "failed",
                "cancelled",
                "superseded",
                name="run_status",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("current_stage", sa.String(length=32), nullable=True),
        sa.Column("attempts", sa.SmallInteger(), nullable=False),
        sa.Column("outcome_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("agents_total", sa.SmallInteger(), nullable=False),
        sa.Column("agents_completed", sa.SmallInteger(), nullable=False),
        sa.Column("abstentions", sa.SmallInteger(), nullable=False),
        sa.Column("models_manifest_sha", sa.String(length=64), nullable=True),
        sa.Column("code_version", sa.String(length=64), nullable=True),
        sa.Column("triggered_by", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "outcome_confidence IS NULL OR outcome_confidence BETWEEN 0 AND 1",
            name=op.f("ck_runs_outcome_confidence_range"),
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"], ["assets.id"], name=op.f("fk_runs_asset_id_assets"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["upload_batches.id"],
            name=op.f("fk_runs_batch_id_upload_batches"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_runs_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_run_id"], ["runs.id"], name=op.f("fk_runs_parent_run_id_runs")
        ),
        sa.ForeignKeyConstraint(
            ["triggered_by"], ["users.id"], name=op.f("fk_runs_triggered_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_runs")),
        sa.UniqueConstraint("public_id", name=op.f("uq_runs_public_id")),
    )
    op.create_index("ix_runs_asset_id", "runs", ["asset_id"], unique=False)
    op.create_index("ix_runs_batch_id", "runs", ["batch_id"], unique=False)
    op.create_index("ix_runs_status_created_at", "runs", ["status", "created_at"], unique=False)
    op.create_table(
        "agent_invocations",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("run_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column(
            "agent_id",
            sa.Enum(
                "forensics",
                "scene",
                "heritage",
                "materiality",
                "verso",
                "text-in-image",
                "skyline",
                "geo",
                "memory",
                "research",
                "chronology",
                "synthesiser",
                "falsifier",
                "streetlevel",
                "redteam",
                "adjudicator",
                "cartographer",
                "multilingual",
                "sensitivity",
                "curator",
                name="agent_id",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("acting_as", zeitzeuge_api.db.base.StringArray(), nullable=False),
        sa.Column("tier", sa.SmallInteger(), nullable=False),
        sa.Column("attempt", sa.SmallInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "running",
                "succeeded",
                "failed",
                "skipped",
                "reused",
                name="invocation_status",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("reused_from_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("model_binding", sa.String(length=64), nullable=True),
        sa.Column("model_id", sa.String(length=128), nullable=True),
        sa.Column("inference_profile", sa.String(length=128), nullable=True),
        sa.Column("region", sa.String(length=64), nullable=True),
        sa.Column("input_sha256", sa.String(length=64), nullable=True),
        sa.Column("output_schema_id", sa.String(length=128), nullable=True),
        sa.Column("output", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("io_s3_key", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_write_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column("error", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_agent_invocations_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reused_from_id"],
            ["agent_invocations.id"],
            name=op.f("fk_agent_invocations_reused_from_id_agent_invocations"),
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["runs.id"],
            name=op.f("fk_agent_invocations_run_id_runs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_invocations")),
        sa.UniqueConstraint(
            "run_id", "stage", "attempt", name="uq_agent_invocations_run_stage_attempt"
        ),
    )
    op.create_table(
        "run_events",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("run_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("local_id", sa.String(length=8), nullable=True),
        sa.Column("t_ms", sa.Integer(), nullable=False),
        sa.Column(
            "agent_id",
            sa.Enum(
                "forensics",
                "scene",
                "heritage",
                "materiality",
                "verso",
                "text-in-image",
                "skyline",
                "geo",
                "memory",
                "research",
                "chronology",
                "synthesiser",
                "falsifier",
                "streetlevel",
                "redteam",
                "adjudicator",
                "cartographer",
                "multilingual",
                "sensitivity",
                "curator",
                name="agent_id",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "note",
                "evidence",
                "objection",
                "abstain",
                "verdict",
                "state",
                "cost",
                "error",
                name="run_event_kind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("message_key", sa.String(length=64), nullable=True),
        sa.Column("evidence_local_id", sa.String(length=8), nullable=True),
        sa.Column("posteriors", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("kills", zeitzeuge_api.db.base.StringArray(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_run_events_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name=op.f("fk_run_events_run_id_runs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_run_events")),
        sa.UniqueConstraint("run_id", "seq", name="uq_run_events_run_id_seq"),
    )
    op.create_table(
        "evidence_items",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("run_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("local_id", sa.String(length=8), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "visual",
                "textual",
                "geometric",
                "external",
                "archival",
                "human",
                name="evidence_kind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "source_class",
            sa.Enum(
                "exif",
                "visual",
                "text_in_image",
                "geodata_layer",
                "reference_image",
                "open_web",
                "terrain_geometry",
                "street_level",
                "archival",
                "human",
                name="evidence_source_class",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            sa.Enum(
                "forensics",
                "scene",
                "heritage",
                "materiality",
                "verso",
                "text-in-image",
                "skyline",
                "geo",
                "memory",
                "research",
                "chronology",
                "synthesiser",
                "falsifier",
                "streetlevel",
                "redteam",
                "adjudicator",
                "cartographer",
                "multilingual",
                "sensitivity",
                "curator",
                name="agent_id",
                native_enum=False,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column("invocation_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("model_id", sa.String(length=128), nullable=True),
        sa.Column("created_by", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("observation", sa.Text(), nullable=False),
        sa.Column("observation_key", sa.String(length=64), nullable=True),
        sa.Column("region", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("side", sa.String(length=8), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("source_uri", sa.Text(), nullable=True),
        sa.Column("artifact_s3_key", sa.Text(), nullable=True),
        sa.Column("strength", sa.Numeric(precision=4, scale=3), nullable=False),
        sa.Column("implies", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("reused_from_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(kind = 'human') = (created_by IS NOT NULL)",
            name=op.f("ck_evidence_items_human_iff_created_by"),
        ),
        sa.CheckConstraint(
            "strength BETWEEN 0 AND 1", name=op.f("ck_evidence_items_strength_range")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_evidence_items_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["invocation_id"],
            ["agent_invocations.id"],
            name=op.f("fk_evidence_items_invocation_id_agent_invocations"),
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_evidence_items_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reused_from_id"],
            ["evidence_items.id"],
            name=op.f("fk_evidence_items_reused_from_id_evidence_items"),
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name=op.f("fk_evidence_items_run_id_runs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_evidence_items")),
        sa.UniqueConstraint("run_id", "local_id", name="uq_evidence_items_run_id_local_id"),
    )
    op.create_table(
        "hypotheses",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("run_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("local_id", sa.String(length=8), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "place",
                "building",
                "street",
                "feature",
                "date",
                "subject",
                "photographer",
                name="hypothesis_kind",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("field_key", sa.String(length=32), nullable=True),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("value", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("camera_pose", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("prior", sa.Numeric(precision=4, scale=3), nullable=False),
        sa.Column("posterior", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "refuted",
                "surviving",
                "selected",
                "rejected",
                name="hypothesis_status",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("refuted_by_evidence_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "origin",
            sa.Enum(
                "synthesiser",
                "exif",
                "reference_match",
                "steer",
                "tip",
                name="hypothesis_origin",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("prior BETWEEN 0 AND 1", name=op.f("ck_hypotheses_prior_range")),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_hypotheses_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["refuted_by_evidence_id"],
            ["evidence_items.id"],
            name=op.f("fk_hypotheses_refuted_by_evidence_id_evidence_items"),
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name=op.f("fk_hypotheses_run_id_runs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hypotheses")),
        sa.UniqueConstraint("run_id", "local_id", name="uq_hypotheses_run_id_local_id"),
    )
    op.create_table(
        "evidence_links",
        sa.Column("evidence_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("hypothesis_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column(
            "relation",
            sa.Enum("supports", "refutes", name="evidence_relation", native_enum=False, length=32),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"],
            ["evidence_items.id"],
            name=op.f("fk_evidence_links_evidence_id_evidence_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["hypothesis_id"],
            ["hypotheses.id"],
            name=op.f("fk_evidence_links_hypothesis_id_hypotheses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_evidence_links_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("evidence_id", "hypothesis_id", name=op.f("pk_evidence_links")),
    )
    op.create_table(
        "objections",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("run_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("hypothesis_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("evidence_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "from_agent",
            sa.Enum(
                "forensics",
                "scene",
                "heritage",
                "materiality",
                "verso",
                "text-in-image",
                "skyline",
                "geo",
                "memory",
                "research",
                "chronology",
                "synthesiser",
                "falsifier",
                "streetlevel",
                "redteam",
                "adjudicator",
                "cartographer",
                "multilingual",
                "sensitivity",
                "curator",
                name="agent_id",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("model_id", sa.String(length=128), nullable=True),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("severity", sa.Numeric(precision=4, scale=3), nullable=False),
        sa.Column(
            "resolution",
            sa.Enum(
                "open",
                "upheld",
                "dismissed",
                "partially_upheld",
                name="objection_resolution",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("severity BETWEEN 0 AND 1", name=op.f("ck_objections_severity_range")),
        sa.ForeignKeyConstraint(
            ["evidence_id"],
            ["evidence_items.id"],
            name=op.f("fk_objections_evidence_id_evidence_items"),
        ),
        sa.ForeignKeyConstraint(
            ["hypothesis_id"],
            ["hypotheses.id"],
            name=op.f("fk_objections_hypothesis_id_hypotheses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_objections_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name=op.f("fk_objections_run_id_runs"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_objections")),
    )

    op.create_index(
        "ix_runs_claimable",
        "runs",
        ["created_at"],
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )

    if is_postgres():
        _apply_row_level_security()


def _apply_row_level_security() -> None:
    """Policies, grants and triggers — also loaded by `tests/_policies.py`."""
    enable_tenant_rls(TABLES, append_only=APPEND_ONLY)
    op.execute(
        "CREATE POLICY runs_worker_select ON runs FOR SELECT "
        "USING (current_setting('app.role', true) = 'worker')"
    )
    op.execute(
        "CREATE POLICY runs_worker_update ON runs FOR UPDATE "
        "USING (current_setting('app.role', true) = 'worker') "
        "WITH CHECK (current_setting('app.role', true) = 'worker')"
    )
    grant_app(
        ("runs", "agent_invocations", "hypotheses", "objections"),
        "SELECT, INSERT, UPDATE, DELETE",
    )
    grant_app(APPEND_ONLY, "SELECT, INSERT")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
