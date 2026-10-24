"""Quality control: the brief's QC made visible, per row and per batch (MUST M9).

`QC_Status` is derived, never stored (data-model §8.12). Storing it would give
the archive two truths, the column and the `field_reviews` it summarises, and
the first correction that forgot to update the column would make the workbook
lie. So the status is a pure function of the reviews and the run state. The
Excel row, the Prio-1 panel on `/evaluation` and the dashboard counter all call
this one function.

Precedence, first match wins (design note §4):

    korrigiert   any review edited, rejected or filled a field
    geprüft      every emitted ranked field was accepted unchanged
    offen        a human touched the row but did not finish, or the run has not finished
    maschinell   finished run, no human touch (abstentions included)

`korrigiert` wins over `geprüft` because a single human correction is the
fact the archive most needs to see: it is what the override rate counts.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.db.models.catalogue import (
    CatalogueRecord,
    FieldDefinition,
    FieldReview,
    RecordField,
    RecordVersion,
)
from zeitzeuge_api.db.models.enums import (
    AssetSide,
    FieldDecisionKind,
    FileRole,
    ReviewAction,
    RunStatus,
)
from zeitzeuge_api.db.models.holdings import Asset, AssetFile, UploadBatch
from zeitzeuge_api.db.models.investigation import Run
from zeitzeuge_api.db.models.user import User

QC_MACHINE = "maschinell"
QC_CONFIRMED = "geprüft"
QC_CORRECTED = "korrigiert"
QC_OPEN = "offen"

RANKED_FIELD_KEYS: tuple[str, ...] = (
    "locality",
    "municipality",
    "building",
    "landscape_feature",
    "street",
)
"""The brief's five ranked fields, in priority order. `field_definitions` is
the authority for their labels and columns; this tuple is only the key set the
QC summary reports on, so its shape does not depend on what is seeded."""

OVERRIDE_ACTIONS = frozenset({ReviewAction.EDITED, ReviewAction.REJECTED, ReviewAction.FILLED})
"""What counts as a human overriding the machine."""

REVIEW_ACTIONS = OVERRIDE_ACTIONS | {ReviewAction.ACCEPTED_UNCHANGED}
"""What counts as a field having been reviewed at all, for the override rate."""

_UNFINISHED_RUNS = frozenset({RunStatus.QUEUED, RunStatus.RUNNING})


class BatchNotFoundError(LookupError):
    """The batch does not exist, or is not visible under the session's tenant."""


def qc_status(
    *,
    run_finished: bool,
    reviews: Sequence[FieldReview],
    emitted_fields: Sequence[str],
) -> str:
    """`maschinell · geprüft · korrigiert · offen` for one photograph.

    `emitted_fields` are the ranked field keys the head version emits
    (decision `emit` or `emit_with_review`); `reviews` are every
    `field_reviews` row of the record.
    """
    if any(review.action in OVERRIDE_ACTIONS for review in reviews):
        return QC_CORRECTED
    accepted = {r.field_key for r in reviews if r.action == ReviewAction.ACCEPTED_UNCHANGED}
    # `reviews` must be non-empty: with nothing emitted and nobody looking,
    # "every emitted field accepted" is vacuously true and would claim a check
    # that never happened.
    if reviews and accepted.issuperset(emitted_fields):
        return QC_CONFIRMED
    if reviews or not run_finished:
        return QC_OPEN
    return QC_MACHINE


# --- the batch, as the workbook and the QC panel see it ------------------------


@dataclass(slots=True)
class AssetState:
    """One photograph of a batch with everything its Excel row is made of."""

    asset: Asset
    master_sha256: str | None = None
    record: CatalogueRecord | None = None
    head: RecordVersion | None = None
    fields: dict[str, RecordField] = field(default_factory=dict)
    """Head-version fields by `field_key`."""
    reviews: list[FieldReview] = field(default_factory=list)
    """Oldest first."""
    run: Run | None = None
    """The run that produced the newest machine version (`Run_ID`)."""
    run_in_progress: bool = False
    last_reviewer: str | None = None

    @property
    def run_finished(self) -> bool:
        return self.head is not None and not self.run_in_progress

    @property
    def emitted_ranked(self) -> list[str]:
        return [
            key
            for key in RANKED_FIELD_KEYS
            if key in self.fields and self.fields[key].decision != FieldDecisionKind.ABSTAIN
        ]

    @property
    def qc(self) -> str:
        return qc_status(
            run_finished=self.run_finished,
            reviews=self.reviews,
            emitted_fields=self.emitted_ranked,
        )


@dataclass(slots=True)
class BatchState:
    batch: UploadBatch
    assets: list[AssetState]
    definitions: list[FieldDefinition]


async def load_batch(session: AsyncSession, batch_id: uuid.UUID) -> BatchState:
    """Read one batch with its head versions, reviews and runs.

    A fixed handful of queries, each joined through `assets.batch_id`, so the
    cost does not grow with the number of photographs and no query carries a
    600-element IN list. Everything is read under the session's tenant: RLS
    decides what exists.
    """
    batch = await session.get(UploadBatch, batch_id)
    if batch is None:
        raise BatchNotFoundError(str(batch_id))

    in_batch = Asset.batch_id == batch_id
    assets = list(await session.scalars(select(Asset).where(in_batch)))
    states = {a.id: AssetState(asset=a) for a in assets}

    masters = await session.execute(
        select(AssetFile.asset_id, AssetFile.sha256)
        .join(Asset, Asset.id == AssetFile.asset_id)
        .where(in_batch, AssetFile.side == AssetSide.RECTO, AssetFile.role == FileRole.MASTER)
    )
    for asset_id, sha256 in masters:
        states[asset_id].master_sha256 = sha256

    by_record: dict[uuid.UUID, AssetState] = {}
    for record in await session.scalars(
        select(CatalogueRecord).join(Asset, Asset.id == CatalogueRecord.asset_id).where(in_batch)
    ):
        states[record.asset_id].record = record
        by_record[record.id] = states[record.asset_id]

    # Every version, not only the head: `Run_ID` names the run behind the
    # newest *machine* version, and a human review writes versions without one.
    producing_run: dict[uuid.UUID, tuple[int, uuid.UUID]] = {}
    for version in await session.scalars(
        select(RecordVersion)
        .join(CatalogueRecord, CatalogueRecord.id == RecordVersion.record_id)
        .join(Asset, Asset.id == CatalogueRecord.asset_id)
        .where(in_batch)
    ):
        state = by_record[version.record_id]
        assert state.record is not None
        if version.version == state.record.current_version:
            state.head = version
        if version.run_id is not None and version.version <= state.record.current_version:
            best = producing_run.get(version.record_id)
            if best is None or version.version > best[0]:
                producing_run[version.record_id] = (version.version, version.run_id)

    head_fields = await session.execute(
        select(CatalogueRecord.id, RecordField)
        .join(RecordVersion, RecordVersion.id == RecordField.record_version_id)
        .join(
            CatalogueRecord,
            and_(
                CatalogueRecord.id == RecordVersion.record_id,
                CatalogueRecord.current_version == RecordVersion.version,
            ),
        )
        .join(Asset, Asset.id == CatalogueRecord.asset_id)
        .where(in_batch)
    )
    for record_id, record_field in head_fields:
        by_record[record_id].fields[record_field.field_key] = record_field

    reviews = await session.execute(
        select(FieldReview, User.full_name)
        .join(CatalogueRecord, CatalogueRecord.id == FieldReview.record_id)
        .join(Asset, Asset.id == CatalogueRecord.asset_id)
        .outerjoin(User, User.id == FieldReview.user_id)
        .where(in_batch)
        .order_by(FieldReview.created_at, FieldReview.id)
    )
    for review, full_name in reviews:
        state = by_record[review.record_id]
        state.reviews.append(review)
        state.last_reviewer = full_name or None

    runs: dict[uuid.UUID, Run] = {}
    for run in await session.scalars(
        select(Run).join(Asset, Asset.id == Run.asset_id).where(in_batch)
    ):
        runs[run.id] = run
        if run.status in _UNFINISHED_RUNS:
            states[run.asset_id].run_in_progress = True
    for record_id, (_, run_id) in producing_run.items():
        by_record[record_id].run = runs.get(run_id)

    definitions = list(await session.scalars(select(FieldDefinition)))
    ordered = sorted(states.values(), key=lambda s: natural_key(s.asset.external_ref))
    return BatchState(batch=batch, assets=ordered, definitions=definitions)


def natural_key(text: str) -> tuple[tuple[int, int | str], ...]:
    """Sort key that puts SG.CIV.17.3 before SG.CIV.17.11, the way an archivist
    reads a signature. Numbers and text never compare with each other."""
    parts: list[tuple[int, int | str]] = []
    number = ""
    word = ""
    for char in text:
        if char.isdigit():
            if word:
                parts.append((1, word.casefold()))
                word = ""
            number += char
        else:
            if number:
                parts.append((0, int(number)))
                number = ""
            word += char
    if number:
        parts.append((0, int(number)))
    if word:
        parts.append((1, word.casefold()))
    return tuple(parts)


# --- the batch summary (data-model §14.10 `QcSummary`) -------------------------


def summarise(state: BatchState) -> dict[str, Any]:
    statuses = [a.qc for a in state.assets]
    return {
        "batch": state.batch.label or str(state.batch.id),
        "total": len(state.assets),
        "processed": sum(1 for a in state.assets if a.head is not None),
        "confirmed": statuses.count(QC_CONFIRMED),
        "corrected": statuses.count(QC_CORRECTED),
        "open": statuses.count(QC_OPEN),
        "machine": statuses.count(QC_MACHINE),
        "overrideRate": override_rates(
            (a.record.id, r) for a in state.assets if a.record is not None for r in a.reviews
        ),
    }


def override_rates(
    reviews: Iterable[tuple[uuid.UUID, FieldReview]],
) -> dict[str, float | None]:
    """Per ranked field: overridden ÷ reviewed, over (record, field) pairs.

    Counted per pair rather than per review row, so a field looked at twice is
    one review, and a field corrected once and then accepted stays corrected.
    `None` when no record has that field reviewed: "not measured" is not 0 %.
    """
    reviewed: dict[str, set[uuid.UUID]] = {key: set() for key in RANKED_FIELD_KEYS}
    overridden: dict[str, set[uuid.UUID]] = {key: set() for key in RANKED_FIELD_KEYS}
    for record_id, review in reviews:
        if review.field_key not in reviewed or review.action not in REVIEW_ACTIONS:
            continue
        reviewed[review.field_key].add(record_id)
        if review.action in OVERRIDE_ACTIONS:
            overridden[review.field_key].add(record_id)
    return {
        key: (round(len(overridden[key]) / len(reviewed[key]), 3) if reviewed[key] else None)
        for key in RANKED_FIELD_KEYS
    }


async def qc_summary(session: AsyncSession, batch_id: uuid.UUID) -> dict[str, Any]:
    """The `QcSummary` object of data-model §14.10 for one batch."""
    return summarise(await load_batch(session, batch_id))
