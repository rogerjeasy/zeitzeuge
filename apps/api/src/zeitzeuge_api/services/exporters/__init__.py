"""Export formats. `xlsx` is first and the default: the Excel table is the
brief's mandatory deliverable (data-model R21); the archival formats follow."""

from zeitzeuge_api.services.exporters.xlsx import build_workbook

__all__ = ["build_workbook"]
