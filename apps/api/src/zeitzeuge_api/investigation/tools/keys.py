"""The keys of the public tools a run may use (`research_tier = public_tools`).

An empty key is not an error: the tool that needs it reports itself as skipped,
the stage writes a ledger note, and the run carries on with what it has
(identification-upgrade note D10).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ExternalKeys:
    openai: str = ""
    gemini: str = ""
    serpapi: str = ""
    google: str = ""

    def present(self) -> list[str]:
        """Names only, never values: for the startup log."""
        return [name for name in ("openai", "gemini", "serpapi", "google") if getattr(self, name)]
