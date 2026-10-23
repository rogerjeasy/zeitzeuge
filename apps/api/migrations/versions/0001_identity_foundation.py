"""Identity foundation: tenants, users, preferences, sessions, API keys, audit.

Revision ID: 0001_identity
Revises:
Create Date: 2026-09-24

Two things in this migration are not schema and are the reason it is worth
reading: the **row-level security policies** and the **grants**.

§9.4 claims that an archive's rows are unreachable from another archive's
session *in the database*. That claim is only as good as the policies below.
Each tenant table is `ENABLE`d **and** `FORCE`d — without FORCE, the table
owner (which is often the migration role) silently bypasses every policy, and
a test run as the owner would pass while production leaked.

The `bootstrap` policies are the deliberate exception. Authentication has to
read a row before it can know which tenant the request belongs to; that path
is restricted to the three identity tables, and every request leaves it the
moment the caller is recognised (`Database.set_tenant`).

`audit_log` gets INSERT and SELECT policies and no others, and the application
role has its UPDATE and DELETE privileges revoked outright. An audit trail the
application can rewrite is not an audit trail.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from zeitzeuge_api.db.base import GUID, JSONDict, enum_column
from zeitzeuge_api.db.models.enums import (
    ApiKeyScope,
    OrganizationKind,
    UserRole,
    UserStatus,
)

revision: str = "0001_identity"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "zeitzeuge_app"

TENANT_TABLES = ("organization_domains", "users", "user_preferences", "user_sessions", "api_keys")
BOOTSTRAP_TABLES = ("organizations", "users", "api_keys")


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", enum_column(OrganizationKind, "organization_kind"), nullable=False),
        sa.Column("canton", sa.String(2)),
        sa.Column("isil", sa.String(32)),
        sa.Column("contact_email", sa.String(320)),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("settings", JSONDict(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_organizations_kind_canton", "organizations", ["kind", "canton"])

    op.create_table(
        "organization_domains",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("org_id", GUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.String(253), nullable=False, unique=True),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("default_role", sa.String(32), nullable=False, server_default="reviewer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("org_id", GUID(), sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("cognito_sub", sa.String(64), nullable=False, unique=True),
        sa.Column("cognito_username", sa.String(320), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pending_email", sa.String(320)),
        sa.Column("full_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("job_title", sa.String(120)),
        sa.Column("department", sa.String(120)),
        sa.Column("phone", sa.String(40)),
        sa.Column("bio", sa.Text()),
        sa.Column("locale", sa.String(5), nullable=False, server_default="de"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Europe/Zurich"),
        sa.Column("avatar_key", sa.String(512)),
        sa.Column("avatar_updated_at", sa.DateTime(timezone=True)),
        sa.Column("role", enum_column(UserRole, "user_role"), nullable=False),
        sa.Column("status", enum_column(UserStatus, "user_status"), nullable=False),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True)),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("metadata", JSONDict(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_org_id_status", "users", ["org_id", "status"])
    op.create_index("ix_users_org_id_role", "users", ["org_id", "role"])

    op.create_table(
        "user_preferences",
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("theme", sa.String(16), nullable=False, server_default="system"),
        sa.Column("reduced_motion", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("high_contrast", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("email_queue_ready", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_hypothesis_refuted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("email_batch_complete", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_weekly_digest", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("inapp_queue_ready", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("inapp_hypothesis_refuted", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("inapp_batch_complete", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("inapp_weekly_digest", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_run_mode", sa.String(16), nullable=False, server_default="standard"),
        sa.Column("auto_accept_threshold", sa.Float(), nullable=False, server_default="0.92"),
        sa.Column("allow_abstention", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("default_collection", sa.String(64)),
        sa.Column("default_export_format", sa.String(16), nullable=False, server_default="isad"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "auto_accept_threshold >= 0.5 AND auto_accept_threshold <= 1.0",
            name="ck_user_preferences_auto_accept_threshold_range",
        ),
    )

    op.create_table(
        "user_sessions",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("org_id", GUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cognito_username", sa.String(320), nullable=False),
        sa.Column("device_label", sa.String(120), nullable=False, server_default="Unbekannt"),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("location", sa.String(120)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_reason", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id_revoked_at", "user_sessions", ["user_id", "revoked_at"])
    op.create_index("ix_user_sessions_org_id", "user_sessions", ["org_id"])

    op.create_table(
        "api_keys",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("org_id", GUID(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("prefix", sa.String(24), nullable=False, unique=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("scope", enum_column(ApiKeyScope, "api_key_scope", length=16), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_ip", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_api_keys_user_id_revoked_at", "api_keys", ["user_id", "revoked_at"])
    op.create_index("ix_api_keys_org_id", "api_keys", ["org_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("org_id", GUID(), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("actor_user_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("actor_email", sa.String(320)),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(64)),
        sa.Column("target_id", sa.String(128)),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("request_id", sa.String(64)),
        sa.Column("details", JSONDict(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_org_id_created_at", "audit_log", ["org_id", "created_at"])
    op.create_index("ix_audit_log_actor_user_id_created_at", "audit_log", ["actor_user_id", "created_at"])
    op.create_index("ix_audit_log_action_created_at", "audit_log", ["action", "created_at"])

    if op.get_bind().dialect.name == "postgresql":
        _apply_row_level_security()
        _apply_grants()


def _apply_row_level_security() -> None:
    tenant_match = "org_id::text = current_setting('app.org_id', true)"
    is_bootstrap = "current_setting('app.role', true) = 'bootstrap'"

    # --- the tenant tables -------------------------------------------------
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        # FORCE also binds the table owner. Without it a policy is advice.
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    for table in ("organization_domains", "users", "user_sessions", "api_keys"):
        op.execute(
            f"CREATE POLICY {table}_tenant_select ON {table} FOR SELECT USING ({tenant_match})"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_insert ON {table} FOR INSERT WITH CHECK ({tenant_match})"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_update ON {table} FOR UPDATE "
            f"USING ({tenant_match}) WITH CHECK ({tenant_match})"
        )
        op.execute(
            f"CREATE POLICY {table}_tenant_delete ON {table} FOR DELETE USING ({tenant_match})"
        )

    # `user_preferences` has no `org_id` of its own: it is one row per user, so
    # its tenancy is its owner's. The subquery is on a primary key.
    preference_match = (
        "EXISTS (SELECT 1 FROM users u WHERE u.id = user_preferences.user_id "
        "AND u.org_id::text = current_setting('app.org_id', true))"
    )
    op.execute(
        f"CREATE POLICY user_preferences_tenant_select ON user_preferences "
        f"FOR SELECT USING ({preference_match})"
    )
    op.execute(
        f"CREATE POLICY user_preferences_tenant_insert ON user_preferences "
        f"FOR INSERT WITH CHECK ({preference_match})"
    )
    op.execute(
        f"CREATE POLICY user_preferences_tenant_update ON user_preferences "
        f"FOR UPDATE USING ({preference_match}) WITH CHECK ({preference_match})"
    )
    op.execute(
        f"CREATE POLICY user_preferences_tenant_delete ON user_preferences "
        f"FOR DELETE USING ({preference_match})"
    )

    # --- organizations -----------------------------------------------------
    op.execute("ALTER TABLE organizations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY organizations_tenant_select ON organizations FOR SELECT "
        "USING (id::text = current_setting('app.org_id', true))"
    )
    op.execute(
        "CREATE POLICY organizations_tenant_update ON organizations FOR UPDATE "
        "USING (id::text = current_setting('app.org_id', true)) "
        "WITH CHECK (id::text = current_setting('app.org_id', true))"
    )

    # --- the pre-authentication path --------------------------------------
    # Registration and sign-in run before a tenant is known. Scoped to the
    # three identity tables and used by exactly two call sites.
    for table in BOOTSTRAP_TABLES:
        op.execute(
            f"CREATE POLICY {table}_bootstrap_select ON {table} FOR SELECT USING ({is_bootstrap})"
        )
        op.execute(
            f"CREATE POLICY {table}_bootstrap_insert ON {table} FOR INSERT WITH CHECK ({is_bootstrap})"
        )
        op.execute(
            f"CREATE POLICY {table}_bootstrap_update ON {table} FOR UPDATE "
            f"USING ({is_bootstrap}) WITH CHECK ({is_bootstrap})"
        )
    for table in ("organization_domains", "user_preferences", "user_sessions"):
        op.execute(
            f"CREATE POLICY {table}_bootstrap_select ON {table} FOR SELECT USING ({is_bootstrap})"
        )
        op.execute(
            f"CREATE POLICY {table}_bootstrap_insert ON {table} FOR INSERT WITH CHECK ({is_bootstrap})"
        )
        op.execute(
            f"CREATE POLICY {table}_bootstrap_update ON {table} FOR UPDATE "
            f"USING ({is_bootstrap}) WITH CHECK ({is_bootstrap})"
        )

    # --- audit_log: append and read, never amend ---------------------------
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_log FORCE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true)")
    op.execute(
        "CREATE POLICY audit_log_select ON audit_log FOR SELECT "
        "USING (org_id::text = current_setting('app.org_id', true) "
        f"OR {is_bootstrap})"
    )
    # No UPDATE or DELETE policy exists, so both are denied for every row.


def _apply_grants() -> None:
    """Grant the application role exactly what it needs — and no more.

    Wrapped in a `DO` block because the role is created by Terraform (or by
    hand on a laptop) and may not exist when this runs. A migration that fails
    because a grant target is missing is a deploy blocked on a detail that the
    application does not need in order to work.
    """
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON
                    organizations, organization_domains, users, user_preferences,
                    user_sessions, api_keys
                TO {APP_ROLE};

                -- The audit trail is append-and-read for the application.
                GRANT SELECT, INSERT ON audit_log TO {APP_ROLE};
                REVOKE UPDATE, DELETE ON audit_log FROM {APP_ROLE};
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("api_keys")
    op.drop_table("user_sessions")
    op.drop_table("user_preferences")
    op.drop_table("users")
    op.drop_table("organization_domains")
    op.drop_table("organizations")
