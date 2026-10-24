"""Apply the revisions' row-level-security policies to a test schema.

The integration suite creates its tables with `metadata.create_all` for speed,
then calls this to install the policies. It loads the revision module by path
and calls the very function the migration calls, so there is one definition of
the policies and the test cannot drift from what ships.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

VERSIONS = Path(__file__).resolve().parents[1] / "migrations" / "versions"
REVISIONS = (
    "0001_identity_foundation.py",
    "0002_holdings.py",
    "0003_investigation.py",
    "0004_catalogue.py",
)


def _load(filename: str) -> ModuleType:
    name = f"zz_revision_{filename[:4]}"
    spec = importlib.util.spec_from_file_location(name, VERSIONS / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def apply_policies(connection: Any) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    revisions = [_load(filename) for filename in REVISIONS]

    def _run(sync_connection: Any) -> None:
        context = MigrationContext.configure(sync_connection)
        with Operations.context(context):
            for revision in revisions:
                revision._apply_row_level_security()
                if hasattr(revision, "_apply_grants"):
                    revision._apply_grants()

    await connection.run_sync(_run)
