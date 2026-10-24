"""Purge failed runs: the one hard delete, narrow by construction.

Revision ID: 0006_purge_failed_runs
Revises: 0005_withdrawal
Create Date: 2026-10-24

The ledger is append-only for the application (0003): no DELETE policy, no
DELETE grant on `evidence_items`, `evidence_links`, `run_events`. That stays.
A *failed* run is different: it never reached Produce, no record version cites
it, and what it left is a half-written ledger nobody may build on. Keeping
dozens of them (a throttled first run of the Prio-1 set) invites re-running the
wrong thing, so an archivist can remove them for good.

`purge_failed_runs(batch)` is the only path. It is SECURITY DEFINER so the
cascade can remove the run's partial ledger, and it deletes a run only when

* it belongs to the calling tenant (`app.org_id`, the same match as every policy),
* its status is `failed`,
* no `record_versions` row references it,
* and, when a batch is given, it belongs to that batch.

It returns the ids it removed; the API writes one audit entry with them.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_purge_failed_runs"
down_revision: str | None = "0005_withdrawal"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        """
        CREATE OR REPLACE FUNCTION purge_failed_runs(p_batch uuid)
        RETURNS SETOF uuid
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
            DELETE FROM runs r
             WHERE r.org_id::text = current_setting('app.org_id', true)
               AND r.status = 'failed'
               AND (p_batch IS NULL OR r.batch_id = p_batch)
               AND NOT EXISTS (SELECT 1 FROM record_versions v WHERE v.run_id = r.id)
            RETURNING r.id
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION purge_failed_runs(uuid) FROM PUBLIC")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeitzeuge_app') THEN
                GRANT EXECUTE ON FUNCTION purge_failed_runs(uuid) TO zeitzeuge_app;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("DROP FUNCTION IF EXISTS purge_failed_runs(uuid)")
