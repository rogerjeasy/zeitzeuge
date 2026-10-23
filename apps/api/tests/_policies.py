"""Apply revision 0001's row-level-security policies to a test schema.

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

REVISION = (
    Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0001_identity_foundation.py"
)


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("zz_revision_0001", REVISION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def apply_policies(connection: Any) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    revision = _load()

    def _run(sync_connection: Any) -> None:
        context = MigrationContext.configure(sync_connection)
        with Operations.context(context):
            revision._apply_row_level_security()
            revision._apply_grants()

    await connection.run_sync(_run)
