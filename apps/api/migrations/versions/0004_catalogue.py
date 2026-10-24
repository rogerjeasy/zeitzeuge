"""Catalogue: field definitions, records, versions, fields, reviews, exports
(data-model §8, P0 subset).

Revision ID: 0004_catalogue
Revises: 0003_investigation
Create Date: 2026-10-24

`field_definitions` is global reference data, seeded here with the brief's five
ranked fields (`priority_rank` 1–5, `excel_column`) plus the two points and the
date. It has no RLS and is read-only to the application.

`record_versions`, `record_fields`, `record_field_evidence` and `field_reviews`
are append-only: a review writes a new version, never an UPDATE.

The P1 invariant (I-1) is enforced in the database as well as in Pydantic: a
deferred constraint trigger refuses, at commit, any emitted field without at
least one cited evidence item. The error is a `check_violation` whose message
starts `evidence_missing`.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import zeitzeuge_api.db.base
from zeitzeuge_api.db.rls import enable_tenant_rls, grant_app, is_postgres

revision: str = "0004_catalogue"
down_revision: str | None = "0003_investigation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "catalogue_records",
    "record_versions",
    "record_fields",
    "record_field_evidence",
    "field_reviews",
    "exports",
    "export_items",
)
APPEND_ONLY = ("record_versions", "record_fields", "record_field_evidence", "field_reviews")

FIELD_DEFINITIONS = [
    # key, label, rank, excel column, ISAD(G), DC, EAD3, value type, owner, description
    (
        "locality",
        "Ortschaft",
        1,
        "Ortschaft",
        None,
        "dcterms:spatial",
        '<geogname localtype="ortschaft">',
        "place_ref",
        "geo",
        "Ortschaft gemäss amtlichem Ortschaftenverzeichnis (swisstopo), am Motivpunkt bestimmt.",
    ),
    (
        "municipality",
        "Politische Gemeinde",
        2,
        "Gemeinde",
        None,
        "dcterms:spatial",
        '<geogname localtype="gemeinde">',
        "municipality_ref",
        "geo",
        "Politische Gemeinde gemäss swissBOUNDARIES3D, mit BFS-Nummer.",
    ),
    (
        "building",
        "Gebäude",
        3,
        "Gebaeude",
        None,
        "dcterms:spatial",
        '<geogname localtype="gebaeude">',
        "building_ref",
        "heritage",
        "Konkretes Gebäude mit Namen; Adresse aus dem amtlichen Gebäudeadressverzeichnis.",
    ),
    (
        "landscape_feature",
        "See / Fluss / Berg",
        4,
        "See_Fluss_Berg",
        None,
        "dcterms:spatial",
        '<geogname localtype="landschaft">',
        "feature_list",
        "geo",
        "Benannte Seen, Flüsse und Berge im Bild, gemäss swissNAMES3D.",
    ),
    (
        "street",
        "Strasse",
        5,
        "Strasse",
        None,
        "dcterms:spatial",
        '<geogname localtype="strasse">',
        "street_ref",
        "geo",
        "Strasse gemäss amtlichem Strassen- bzw. Gebäudeadressverzeichnis.",
    ),
    (
        "subject_point",
        "Motiv (Koordinate)",
        None,
        "Motiv_LV95",
        None,
        None,
        None,
        "point",
        "geo",
        "Der Punkt, den das Foto zeigt (LV95).",
    ),
    (
        "camera_point",
        "Aufnahmestandort",
        None,
        "Aufnahmestandort_LV95",
        None,
        None,
        None,
        "pose",
        "falsifier",
        "Wo das Foto aufgenommen wurde (LV95, Richtung).",
    ),
    (
        "date",
        "Aufnahmedatum",
        None,
        "Aufnahmedatum_EXIF",
        "3.1.3",
        "dc:date",
        "<unitdate>",
        "date_bracket",
        "forensics",
        "Aufnahmedatum aus den EXIF-Daten der Datei.",
    ),
]


def upgrade() -> None:
    op.create_table(
        "field_definitions",
        sa.Column("key", sa.String(length=32), nullable=False),
        sa.Column("label_de", sa.String(length=120), nullable=False),
        sa.Column("priority_rank", sa.SmallInteger(), nullable=True),
        sa.Column("excel_column", sa.String(length=64), nullable=True),
        sa.Column("isad", sa.String(length=32), nullable=True),
        sa.Column("dublin_core", sa.String(length=64), nullable=True),
        sa.Column("ead3", sa.String(length=128), nullable=True),
        sa.Column("scope_archiv", sa.String(length=128), nullable=True),
        sa.Column("value_type", sa.String(length=32), nullable=False),
        sa.Column(
            "owning_agent",
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
        sa.Column("description_de", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_field_definitions")),
    )
    op.create_table(
        "exports",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column(
            "format",
            sa.Enum(
                "xlsx",
                "isad_csv",
                "ead3",
                "dc_xml",
                "iiif_manifest",
                "rico_jsonld",
                "xmp_jpeg",
                name="export_format",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "scope",
            sa.Enum(
                "batch",
                "record",
                "selection",
                "fonds",
                "approved_since",
                name="export_scope",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("batch_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("record_count", sa.Integer(), nullable=False),
        sa.Column("includes_unapproved", sa.Boolean(), nullable=False),
        sa.Column("s3_key", sa.Text(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("created_by", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "includes_unapproved = false OR format = 'xlsx'",
            name=op.f("ck_exports_only_xlsx_unapproved"),
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["upload_batches.id"], name=op.f("fk_exports_batch_id_upload_batches")
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_exports_created_by_users")
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_exports_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exports")),
    )
    op.create_table(
        "catalogue_records",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("asset_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("fonds_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "in_review",
                "approved",
                "held",
                "exported",
                "reopened",
                name="record_status",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("approved_version", sa.Integer(), nullable=True),
        sa.Column("publication_hold", sa.Boolean(), nullable=False),
        sa.Column("public_assist", sa.Boolean(), nullable=False),
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
            ["asset_id"],
            ["assets.id"],
            name=op.f("fk_catalogue_records_asset_id_assets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["fonds_id"], ["fonds.id"], name=op.f("fk_catalogue_records_fonds_id_fonds")
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_catalogue_records_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_catalogue_records")),
        sa.UniqueConstraint("asset_id", name=op.f("uq_catalogue_records_asset_id")),
    )
    op.create_table(
        "export_items",
        sa.Column("export_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("record_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["export_id"],
            ["exports.id"],
            name=op.f("fk_export_items_export_id_exports"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_export_items_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["catalogue_records.id"],
            name=op.f("fk_export_items_record_id_catalogue_records"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("export_id", "record_id", name=op.f("pk_export_items")),
    )
    op.create_table(
        "field_reviews",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("record_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("from_version", sa.Integer(), nullable=False),
        sa.Column("to_version", sa.Integer(), nullable=False),
        sa.Column("field_key", sa.String(length=32), nullable=False),
        sa.Column(
            "action",
            sa.Enum(
                "accepted_unchanged",
                "edited",
                "rejected",
                "filled",
                "constraint_disabled",
                name="review_action",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("from_value_text", sa.Text(), nullable=True),
        sa.Column("to_value_text", sa.Text(), nullable=True),
        sa.Column("overrode_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("user_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_field_reviews_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["catalogue_records.id"],
            name=op.f("fk_field_reviews_record_id_catalogue_records"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_field_reviews_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_field_reviews")),
    )
    op.create_index("ix_field_reviews_record_id", "field_reviews", ["record_id"], unique=False)
    op.create_table(
        "record_versions",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("record_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("run_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column("parent_version", sa.Integer(), nullable=True),
        sa.Column(
            "actor_kind",
            sa.Enum("human", "machine", "system", name="actor_kind", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("actor_user_id", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "change_kind",
            sa.Enum(
                "generated",
                "steered",
                "edited",
                "rejected",
                "filled",
                "approved_snapshot",
                "reopened",
                name="version_change",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("formula_weights", zeitzeuge_api.db.base.JSONDict(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(actor_kind = 'human') = (actor_user_id IS NOT NULL)",
            name=op.f("ck_record_versions_human_iff_actor_user"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.id"], name=op.f("fk_record_versions_actor_user_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_record_versions_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["record_id"],
            ["catalogue_records.id"],
            name=op.f("fk_record_versions_record_id_catalogue_records"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name=op.f("fk_record_versions_run_id_runs")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_record_versions")),
        sa.UniqueConstraint("record_id", "version", name="uq_record_versions_record_id_version"),
    )
    op.create_table(
        "record_fields",
        sa.Column("id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("record_version_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("field_key", sa.String(length=32), nullable=False),
        sa.Column(
            "decision",
            sa.Enum(
                "emit",
                "emit_with_review",
                "abstain",
                name="field_decision",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "abstain_reason",
            sa.Enum(
                "insufficient_evidence",
                "conflicting_evidence",
                "out_of_scope",
                "sensitivity_hold",
                name="abstain_reason",
                native_enum=False,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column("value_text", sa.Text(), nullable=True),
        sa.Column("value", zeitzeuge_api.db.base.JSONDict(), nullable=True),
        sa.Column("value_uri", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("raw_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("source_classes", zeitzeuge_api.db.base.StringArray(), nullable=False),
        sa.Column("corroborating_count", sa.SmallInteger(), nullable=False),
        sa.Column("objection_count", sa.SmallInteger(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("generated_by", sa.String(length=64), nullable=False),
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
        sa.Column("models", zeitzeuge_api.db.base.StringArray(), nullable=False),
        sa.Column("method", sa.String(length=128), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "origin",
            sa.Enum(
                "machine", "human", "carried", name="field_origin", native_enum=False, length=32
            ),
            nullable=False,
        ),
        sa.Column("reviewed_by", zeitzeuge_api.db.base.GUID(), nullable=True),
        sa.Column(
            "review_action",
            sa.Enum(
                "accepted_unchanged",
                "edited",
                "rejected",
                "filled",
                "constraint_disabled",
                name="review_action",
                native_enum=False,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("overrode_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.CheckConstraint(
            "decision <> 'abstain' OR (value_text IS NULL AND confidence IS NULL AND abstain_reason IS NOT NULL)",
            name=op.f("ck_record_fields_abstain_is_empty"),
        ),
        sa.CheckConstraint(
            "decision = 'abstain' OR (confidence IS NOT NULL AND abstain_reason IS NULL AND corroborating_count >= 1)",
            name=op.f("ck_record_fields_emit_has_confidence"),
        ),
        sa.CheckConstraint(
            "origin <> 'human' OR reviewed_by IS NOT NULL",
            name=op.f("ck_record_fields_human_has_reviewer"),
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR confidence BETWEEN 0 AND 1",
            name=op.f("ck_record_fields_confidence_range"),
        ),
        sa.ForeignKeyConstraint(
            ["field_key"],
            ["field_definitions.key"],
            name=op.f("fk_record_fields_field_key_field_definitions"),
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_record_fields_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["record_version_id"],
            ["record_versions.id"],
            name=op.f("fk_record_fields_record_version_id_record_versions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.id"], name=op.f("fk_record_fields_reviewed_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_record_fields")),
        sa.UniqueConstraint(
            "record_version_id", "field_key", name="uq_record_fields_version_field"
        ),
    )
    op.create_table(
        "record_field_evidence",
        sa.Column("record_field_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("evidence_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column("org_id", zeitzeuge_api.db.base.GUID(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "primary",
                "supporting",
                "contested",
                name="evidence_role",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"],
            ["evidence_items.id"],
            name=op.f("fk_record_field_evidence_evidence_id_evidence_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_record_field_evidence_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["record_field_id"],
            ["record_fields.id"],
            name=op.f("fk_record_field_evidence_record_field_id_record_fields"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "record_field_id", "evidence_id", name=op.f("pk_record_field_evidence")
        ),
    )

    definitions = sa.table(
        "field_definitions",
        sa.column("key"),
        sa.column("label_de"),
        sa.column("priority_rank"),
        sa.column("excel_column"),
        sa.column("isad"),
        sa.column("dublin_core"),
        sa.column("ead3"),
        sa.column("value_type"),
        sa.column("owning_agent"),
        sa.column("description_de"),
    )
    op.bulk_insert(
        definitions,
        [
            dict(
                zip(
                    (
                        "key",
                        "label_de",
                        "priority_rank",
                        "excel_column",
                        "isad",
                        "dublin_core",
                        "ead3",
                        "value_type",
                        "owning_agent",
                        "description_de",
                    ),
                    row,
                    strict=True,
                )
            )
            for row in FIELD_DEFINITIONS
        ],
    )

    if is_postgres():
        _apply_row_level_security()


def _apply_row_level_security() -> None:
    """Policies, grants and triggers — also loaded by `tests/_policies.py`."""
    enable_tenant_rls(TABLES, append_only=APPEND_ONLY)
    grant_app(("catalogue_records", "exports", "export_items"), "SELECT, INSERT, UPDATE, DELETE")
    grant_app(APPEND_ONLY, "SELECT, INSERT")
    grant_app(("field_definitions",), "SELECT")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION zz_field_requires_evidence() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.decision <> 'abstain' AND NOT EXISTS (
                SELECT 1 FROM record_field_evidence WHERE record_field_id = NEW.id
            ) THEN
                RAISE EXCEPTION 'evidence_missing: field % of version % cites no evidence',
                    NEW.field_key, NEW.record_version_id
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NULL;
        END
        $$;
        """
    )
    op.execute(
        "CREATE CONSTRAINT TRIGGER trg_field_requires_evidence AFTER INSERT ON record_fields "
        "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION zz_field_requires_evidence()"
    )


def downgrade() -> None:
    if is_postgres():
        op.execute("DROP TRIGGER IF EXISTS trg_field_requires_evidence ON record_fields")
        op.execute("DROP FUNCTION IF EXISTS zz_field_requires_evidence()")
    for table in reversed(TABLES):
        op.drop_table(table)
    op.drop_table("field_definitions")
