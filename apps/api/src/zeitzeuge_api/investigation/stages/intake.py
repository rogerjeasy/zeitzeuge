"""Intake (roster: `forensics`) — EXIF as a witness, not as a fact.

For a born-digital 21st-century file the camera is the first witness: the
capture date (all 50 Prio-1 photos carry one), the camera, the focal length.
GPS would be a place *hypothesis*; none of the Prio-1 files has coordinates,
and 15 of them carry a GPS block holding only the version tag. Presence of the
block is therefore not GPS: only a parseable latitude and longitude is.

The 35 mm-equivalent focal length gives the horizontal field of view the terrain
falsifier will need later (BR-10); it is recorded now and costs nothing.
"""

from __future__ import annotations

import io
import math
from datetime import UTC, datetime
from typing import Any

from PIL import Image

from zeitzeuge_api.db.models.enums import AgentId, EvidenceKind, SourceClass
from zeitzeuge_api.investigation.context import RunContext

STAGE = "intake"

_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825
_DATETIME_ORIGINAL = 36867
_FOCAL_LENGTH = 37386
_FOCAL_35MM = 41989
_MAKE = 271
_MODEL = 272


def read_exif(raw: bytes) -> dict[str, Any]:
    """The witness columns of `assets` (data-model §6.3), from the file bytes."""
    image = Image.open(io.BytesIO(raw))
    exif = image.getexif()
    sub = exif.get_ifd(_EXIF_IFD)
    gps = exif.get_ifd(_GPS_IFD)

    captured_at = _parse_datetime(sub.get(_DATETIME_ORIGINAL))
    focal = _number(sub.get(_FOCAL_LENGTH))
    focal_35 = _number(sub.get(_FOCAL_35MM))
    lat, lon = _gps(gps)
    return {
        "captured_at": captured_at,
        "make": _text(exif.get(_MAKE)),
        "model": _text(exif.get(_MODEL)),
        "focal_mm": focal,
        "focal_35mm": focal_35,
        "hfov_deg": hfov_from_35mm(focal_35) if focal_35 else None,
        "gps_block": bool(gps),
        "lat": lat,
        "lon": lon,
        "width_px": image.width,
        "height_px": image.height,
    }


def hfov_from_35mm(focal_35mm: float) -> float:
    """Horizontal field of view of a 36 mm wide frame at that focal length."""
    return round(math.degrees(2 * math.atan(36 / (2 * focal_35mm))), 2)


async def run(ctx: RunContext) -> None:
    record = ctx.begin(STAGE, AgentId.FORENSICS)
    facts = read_exif(ctx.asset.image)
    ctx.facts["exif"] = facts

    if facts["captured_at"]:
        ctx.ledger.add(
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.EXIF,
            agent_id=AgentId.FORENSICS,
            observation=(
                f"EXIF DateTimeOriginal {facts['captured_at']:%Y-%m-%d %H:%M}; Kamera "
                f"{facts['make'] or '?'} {facts['model'] or ''}".strip()
            ),
            strength=1.0,
            source="EXIF der gelieferten Datei",
            attrs={"captured_at": facts["captured_at"].isoformat()},
        )
    if facts["lat"] is not None and facts["lon"] is not None:
        ctx.ledger.add(
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.EXIF,
            agent_id=AgentId.FORENSICS,
            observation=(
                f"EXIF GPS {facts['lat']:.5f}, {facts['lon']:.5f} (Hypothese, nicht Tatsache)"
            ),
            strength=0.6,
            source="EXIF der gelieferten Datei",
            attrs={"lat": facts["lat"], "lon": facts["lon"]},
        )
    elif facts["gps_block"]:
        ctx.ledger.note(AgentId.FORENSICS, "GPS-Block vorhanden, aber ohne Koordinaten")

    record.output = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in facts.items()}
    record.ended_at = datetime.now(UTC)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        # EXIF carries no zone; the archive's cameras were set to Swiss local time.
        return datetime.strptime(str(value).strip(), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return number if number > 0 else None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().strip("\x00").strip()
    return text or None


def _gps(gps: Any) -> tuple[float | None, float | None]:
    try:
        lat = _dms(gps[2], gps.get(1))
        lon = _dms(gps[4], gps.get(3))
    except (KeyError, TypeError, ValueError, ZeroDivisionError, IndexError):
        return None, None
    return lat, lon


def _dms(value: Any, ref: Any) -> float:
    degrees, minutes, seconds = (float(part) for part in value)
    decimal = degrees + minutes / 60 + seconds / 3600
    return -decimal if str(ref).upper() in {"S", "W"} else decimal
