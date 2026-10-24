"""The confidence rule — deterministic, over the ledger, never a model's number.

The brief asks for a confidence per row *and* an understandable rule (MUST M7);
Ralph Ruch's illustration is «zehn bestätigende Quellen = 100 %». This keeps the
intuition — count what confirms — and fixes its two weaknesses: ten copies of
one web page are one source, and a contradiction has to cost something
(architecture §8.5, BR-6, design note §3).

    raw = 1 - prod_c (1 - w_c · s_c)     over independent source classes c,
                                      s_c = the strongest item in class c
        * prod (1 - severity)            for each upheld objection
    refuted                           → 0, the field stays empty

    raw ≥ 0.90  → emit              («übernahmefähig»)
    raw ≥ 0.50  → emit_with_review  («Prüfbedarf»)
    otherwise   → abstain           («bewusst leer gelassen»)

**Find, then prove** (identification-upgrade note §2, ADR-19): a register
*name lookup* proves only that a name exists (`REGISTER_EXISTENCE`); a model
with live web search may propose a value (`open_research`), but a field reaches
the acceptance line only with evidence that ties this photograph to the value —
a sign, the same picture online (`reverse_image`), a matching reference photo
or Street View frame, geometry, or a human.

There is no calibration map yet (no gold set by the deadline, design note D6),
so `confidence = raw` and the Methode sheet says so. Strengths are not free
either: a tool's match kind maps to a fixed strength, and anything a model
states is capped at `MODEL_STRENGTH_CAP` — so one model observation alone can
never exceed 0.3 * 0.8 = 0.24.

This module has no I/O and no model. The workbook, the review screen and a
judge with a calculator all get the same number from the same inputs.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from zeitzeuge_api.db.models.enums import AbstainReason, FieldDecisionKind, SourceClass
from zeitzeuge_api.investigation.tools.base import MatchKind

WEIGHTS: Mapping[SourceClass, float] = {
    SourceClass.EXIF: 0.6,
    SourceClass.VISUAL: 0.3,
    SourceClass.TEXT_IN_IMAGE: 0.5,
    SourceClass.GEODATA_LAYER: 0.7,
    SourceClass.REFERENCE_IMAGE: 0.6,
    SourceClass.REVERSE_IMAGE: 0.8,
    SourceClass.OPEN_RESEARCH: 0.5,
    SourceClass.OPEN_WEB: 0.4,
    SourceClass.TERRAIN_GEOMETRY: 0.9,
    SourceClass.STREET_LEVEL: 0.5,
    SourceClass.ARCHIVAL: 0.7,
    SourceClass.HUMAN: 0.95,
}
"""Default weights per source class (architecture §8.5)."""

ACCEPT_AT = 0.90
"""The brief's > 90 % acceptance value, applied to this scale."""
REVIEW_AT = 0.50
"""Below this a value is not shown at all: «dürfen nicht geraten werden»."""

MODEL_STRENGTH_CAP = 0.8
REFERENCE_TITLE_MATCH = 0.8
"""A reference photo whose title names the same object."""
OPEN_WEB_PAGE = 0.6

REGISTER_EXISTENCE = 0.35
"""A register knows the *name* («Schwyz» is in swissNAMES3D): it exists, it is spelled
so, it lies there. That is not evidence the photograph shows it, so it is weak."""

REVERSE_FULL_MATCH = 0.95
REVERSE_PARTIAL_MATCH = 0.8
REVERSE_SIMILAR = 0.5
LANDMARK_CAP = 0.85
"""A landmark detector's own score, capped: it names famous places, not this photo's."""

RESEARCH_VERIFIED = 0.6
"""One model family names the value and a page it cites, fetched by us, contains it."""
RESEARCH_UNVERIFIED = 0.3
RESEARCH_AGREEMENT = 0.9
"""Two independent families name the same value and at least one is verified."""

_MATCH_STRENGTH: Mapping[MatchKind, float] = {
    MatchKind.EXACT: 1.0,
    MatchKind.NORMALISED: 0.85,
    MatchKind.FUZZY: 0.6,
    MatchKind.SPATIAL: 0.9,
}

SOURCE_CLASS_DE: Mapping[SourceClass, str] = {
    SourceClass.EXIF: "EXIF",
    SourceClass.VISUAL: "Bildinhalt",
    SourceClass.TEXT_IN_IMAGE: "Schrift im Bild",
    SourceClass.GEODATA_LAYER: "Geodaten",
    SourceClass.REFERENCE_IMAGE: "Referenzbild",
    SourceClass.REVERSE_IMAGE: "Bild im Web",
    SourceClass.OPEN_RESEARCH: "KI-Recherche",
    SourceClass.OPEN_WEB: "Web",
    SourceClass.TERRAIN_GEOMETRY: "Geländemodell",
    SourceClass.STREET_LEVEL: "Strassenansicht",
    SourceClass.ARCHIVAL: "Archivkatalog",
    SourceClass.HUMAN: "Archivar:in",
}


@dataclass(frozen=True, slots=True)
class Support:
    """One cited evidence item that supports the selected value."""

    source_class: SourceClass
    strength: float


@dataclass(frozen=True, slots=True)
class Objection:
    """An upheld, unresolved objection against the selected value."""

    severity: float


@dataclass(frozen=True, slots=True)
class Scored:
    raw: float
    decision: FieldDecisionKind
    abstain_reason: AbstainReason | None
    source_classes: tuple[SourceClass, ...]
    """Distinct corroborating classes, strongest contribution first."""
    corroborating_count: int
    objection_count: int
    explanation: str
    """«3 Quellenarten bestätigen (Geodaten, Referenzbild, Schrift im Bild) · 0 Einwände»."""


class ReverseMatch(StrEnum):
    """How closely a web page's picture matches the photograph."""

    FULL = "full"
    PARTIAL = "partial"
    SIMILAR = "similar"


_REVERSE_STRENGTH: Mapping[ReverseMatch, float] = {
    ReverseMatch.FULL: REVERSE_FULL_MATCH,
    ReverseMatch.PARTIAL: REVERSE_PARTIAL_MATCH,
    ReverseMatch.SIMILAR: REVERSE_SIMILAR,
}


def strength_for_match(match: MatchKind) -> float:
    return _MATCH_STRENGTH[match]


def reverse_image_strength(match: ReverseMatch) -> float:
    """A page whose picture matches and whose title or URL names the value."""
    return _REVERSE_STRENGTH[match]


def landmark_strength(detector_score: float) -> float:
    return max(0.0, min(LANDMARK_CAP, detector_score))


def research_strength(*, verified: bool, families_agreeing: int, any_verified: bool) -> float:
    """One research family's claim. Agreement counts only when someone's source checks out."""
    if families_agreeing >= 2 and any_verified:
        return RESEARCH_AGREEMENT
    return RESEARCH_VERIFIED if verified else RESEARCH_UNVERIFIED


def model_strength(stated: float) -> float:
    """Clamp what a model says about its own observation to [0, cap]."""
    return max(0.0, min(MODEL_STRENGTH_CAP, stated))


def score(
    support: Sequence[Support],
    objections: Sequence[Objection] = (),
    *,
    refuted: bool = False,
    weights: Mapping[SourceClass, float] = WEIGHTS,
) -> Scored:
    strongest: dict[SourceClass, float] = {}
    for item in support:
        s = max(0.0, min(1.0, item.strength))
        strongest[item.source_class] = max(s, strongest.get(item.source_class, 0.0))

    remaining = 1.0
    for source_class, s in strongest.items():
        remaining *= 1.0 - weights[source_class] * s
    raw = 1.0 - remaining if strongest else 0.0
    for objection in objections:
        raw *= 1.0 - max(0.0, min(1.0, objection.severity))

    refuted = refuted or any(o.severity >= 1.0 for o in objections)
    if refuted:
        raw = 0.0
    raw = round(raw, 3)

    ordered = tuple(
        sorted(strongest, key=lambda c: (-weights[c] * strongest[c], SOURCE_CLASS_DE[c]))
    )
    if refuted:
        decision, reason = FieldDecisionKind.ABSTAIN, AbstainReason.CONFLICTING_EVIDENCE
    elif raw >= ACCEPT_AT:
        decision, reason = FieldDecisionKind.EMIT, None
    elif raw >= REVIEW_AT:
        decision, reason = FieldDecisionKind.EMIT_WITH_REVIEW, None
    else:
        decision, reason = FieldDecisionKind.ABSTAIN, AbstainReason.INSUFFICIENT_EVIDENCE

    return Scored(
        raw=raw,
        decision=decision,
        abstain_reason=reason,
        source_classes=ordered,
        corroborating_count=len(support),
        objection_count=len(objections),
        explanation=_explain(ordered, len(objections), refuted=refuted),
    )


def row_confidence(fields: Iterable[Scored | None]) -> float | None:
    """`Gesamtkonfidenz`: the weakest emitted field, or nothing if none is."""
    emitted = [
        f.raw for f in fields if f is not None and f.decision is not FieldDecisionKind.ABSTAIN
    ]
    return min(emitted) if emitted else None


def _explain(classes: Sequence[SourceClass], objections: int, *, refuted: bool) -> str:
    # Only objections the adjudicator upheld are charged — and only those are counted.
    einwaende = "1 anerkannter Einwand" if objections == 1 else f"{objections} anerkannte Einwände"
    if refuted:
        return f"Widerlegt · {einwaende} · bewusst leer gelassen"
    if not classes:
        return "Keine belastbare Quelle · bewusst leer gelassen"
    names = ", ".join(SOURCE_CLASS_DE[c] for c in classes)
    if len(classes) == 1:
        return f"1 Quellenart bestätigt ({names}) · {einwaende}"
    return f"{len(classes)} Quellenarten bestätigen ({names}) · {einwaende}"
