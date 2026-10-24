"""Import the team's QC labels as reviews (the Evaluation page's data source).

The team checks photographs in a copy of the exported workbook: a correct
value is coloured green, a wrong one is overwritten with the right value and
coloured green, an empty one is filled in and coloured green. That workbook is
review work, so this turns each green cell into the review a click on the
review screen would have written — through the same `apply_review`, attributed
to the person who uploads it, versioned and audited:

    machine value names the label       accept   (accepted_unchanged)
    machine value names something else  correct  (edited, label as value)
    machine left the field open         correct  (filled, label as value)

Name matching is the evaluator's (`investigation.evaluate.same`): case, accents,
«St./Sankt», generic building words and a missing house number are forgiven.
A field already reviewed in the app is left alone, so the import can run twice
and never overrides a person. A «Gemeinde» label that is not one of the
canton's 30 political municipalities is reported, not written.
"""

from __future__ import annotations

import asyncio
import io
import uuid
import zipfile
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.core import errors
from zeitzeuge_api.db.models import Asset, CatalogueRecord, FieldReview, UploadBatch, User
from zeitzeuge_api.db.models.enums import FieldDecisionKind
from zeitzeuge_api.investigation.evaluate import FIELDS, label_issues, read_labels, same
from zeitzeuge_api.schemas import investigation as schemas
from zeitzeuge_api.services.investigation_service import InvestigationService

MAX_BYTES = 5 * 1024 * 1024
MAX_UNPACKED = 40 * 1024 * 1024
"""An .xlsx is a zip: a 5 MB upload could inflate to gigabytes inside openpyxl."""
MAX_PARTS = 300
MAX_RATIO = 200
MAX_ROWS = 5_000


def _check_archive(workbook: bytes) -> None:
    """Refuse a decompression bomb before openpyxl inflates it."""
    try:
        with zipfile.ZipFile(io.BytesIO(workbook)) as archive:
            parts = archive.infolist()
    except zipfile.BadZipFile as exc:
        raise errors.ValidationError("This file is not a readable .xlsx workbook.") from exc
    unpacked = sum(p.file_size for p in parts)
    packed = sum(p.compress_size for p in parts) or 1
    if len(parts) > MAX_PARTS or unpacked > MAX_UNPACKED or unpacked / packed > MAX_RATIO:
        raise errors.ValidationError("This workbook is too large to import.")


COLUMN_TO_FIELD = {
    "Ortschaft": "locality",
    "Gemeinde": "municipality",
    "Gebaeude": "building",
    "See_Fluss_Berg": "landscape_feature",
    "Strasse": "street",
}
assert set(COLUMN_TO_FIELD) == {column for column, _ in FIELDS}


async def parse(workbook: bytes) -> tuple[dict[str, dict[str, str]], dict[str, set[str]]]:
    if not workbook:
        raise errors.ValidationError("The upload is empty.")
    if len(workbook) > MAX_BYTES:
        raise errors.ValidationError("The workbook is larger than 5 MB.")
    _check_archive(workbook)
    try:
        labels = await asyncio.to_thread(read_labels, io.BytesIO(workbook), MAX_ROWS)
    except ValueError as exc:
        raise errors.ValidationError(str(exc)) from exc
    except Exception as exc:  # openpyxl raises a zoo of types for a non-workbook
        raise errors.ValidationError("This file is not a readable .xlsx workbook.") from exc
    return labels, label_issues(labels)


async def import_labels(
    service: InvestigationService,
    session: AsyncSession,
    *,
    user: User,
    batch_id: uuid.UUID,
    workbook: bytes,
    source_name: str | None = None,
) -> dict[str, Any]:
    labels, issues = await parse(workbook)
    batch = await session.get(UploadBatch, batch_id)
    if batch is None or batch.deleted_at is not None:
        raise errors.NotFoundError("No such batch.")

    assets = list(
        await session.scalars(
            select(Asset).where(Asset.batch_id == batch.id, Asset.deleted_at.is_(None))
        )
    )
    by_name = {a.external_ref: a for a in assets if a.external_ref}
    records = {
        r.asset_id: r
        for r in await session.scalars(
            select(CatalogueRecord).where(CatalogueRecord.asset_id.in_([a.id for a in assets]))
        )
    }
    reviewed = {
        (r.record_id, r.field_key)
        for r in await session.scalars(
            select(FieldReview).where(FieldReview.record_id.in_([r.id for r in records.values()]))
        )
    }
    reason = f"QC-Import «{source_name}»" if source_name else "QC-Import"

    counts = {"accepted": 0, "edited": 0, "filled": 0, "already_reviewed": 0, "no_decision": 0}
    unmatched: list[str] = []
    skipped_labels: list[str] = []
    photos = 0
    for name, values in labels.items():
        if not values:
            continue
        asset = by_name.get(name)
        record = records.get(asset.id) if asset is not None else None
        if record is None:
            unmatched.append(name)
            continue
        photos += 1
        for column, label in values.items():
            if column in issues.get(name, set()):
                skipped_labels.append(f"{name}: {column} «{label}»")
                continue
            field_key = COLUMN_TO_FIELD[column]
            if (record.id, field_key) in reviewed:
                counts["already_reviewed"] += 1
                continue
            head = (await service._head_fields(session, [record])).get(record.id, [])
            target = next((f for f in head if f.field_key == field_key), None)
            if target is None:
                counts["no_decision"] += 1
                continue
            machine = (
                target.value_text if target.decision is not FieldDecisionKind.ABSTAIN else None
            )
            if machine and same(column, machine, label):
                data = schemas.FieldReviewRequest(action="accept", reason=reason)
                counts["accepted"] += 1
            else:
                data = schemas.FieldReviewRequest(action="correct", value=label, reason=reason)
                counts["edited" if machine else "filled"] += 1
            await service.apply_review(
                session,
                user=user,
                record_id=record.id,
                field_key=field_key,
                data=data,
                if_match=None,
            )
            reviewed.add((record.id, field_key))
    return {
        "batch_id": str(batch.id),
        "photos": photos,
        **counts,
        "unmatched": sorted(unmatched)[:50],
        "label_issues": skipped_labels[:50],
    }
