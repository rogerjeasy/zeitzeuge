"""A temporary directory the process can actually write to.

The API container runs with a read-only root filesystem as uid 10001, and its
`/tmp` is a Fargate volume owned by root: Python's `tempfile` finds no usable
directory, and libraries that spill to disk — openpyxl writes every worksheet
to a temporary file before zipping the workbook — fail with
`FileNotFoundError: No usable temporary directory`. That is what broke the
first Prio-1 export in prod.

At startup the first writable candidate wins and becomes `tempfile.tempdir`;
`/dev/shm` (a tmpfs every container gets) is the fallback. A workbook for 600
photographs is a few megabytes, well inside it.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Sequence

from zeitzeuge_api.core.logging import get_logger

log = get_logger(__name__)

CANDIDATES: tuple[str, ...] = ("/tmp", "/dev/shm", "/var/tmp")  # noqa: S108


def writable(directory: str) -> bool:
    try:
        with tempfile.NamedTemporaryFile(dir=directory):
            return True
    except OSError:
        return False


def choose(candidates: Sequence[str] = CANDIDATES) -> str | None:
    """Point `tempfile` at the first directory that accepts a file; None if none does."""
    preferred = os.environ.get("TMPDIR")
    for directory in ([preferred] if preferred else []) + list(candidates):
        if directory and os.path.isdir(directory) and writable(directory):
            tempfile.tempdir = directory
            return directory
    log.error("startup.no_temp_dir", tried=list(candidates))
    return None
