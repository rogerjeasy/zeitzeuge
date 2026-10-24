"""Wire contracts between the stages (data-model §14.2-14.4, P0 shapes).

Two kinds of model live here:

* **Ledger shapes** (`Evidence`, `HypothesisOut`, `ObjectionOut`,
  `FieldDecision`): what a stage adds to the run, before it is persisted.
  `FieldDecision` enforces I-1 — an emitted field must cite evidence — before
  anything reaches the database trigger that enforces it a second time.
* **Model replies** (`Perception`, `Comparison`, `Challenge`, `Adjudication`):
  the JSON a model must return. Their JSON Schema is sent to the model as the
  only tool it may call, so a reply that does not fit is a retry, not a parse
  heuristic.

Everything a model writes is untrusted text. It becomes a *value* in the
ledger, never a control-flow decision (architecture §6, the reason the flow
lives in code rather than in a prompt).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from zeitzeuge_api.db.models.enums import (
    AbstainReason,
    AgentId,
    EvidenceKind,
    FieldDecisionKind,
    SourceClass,
)

RANKED_FIELDS: tuple[str, ...] = (
    "locality",
    "municipality",
    "building",
    "landscape_feature",
    "street",
)
"""The brief's priority order: Ortschaft → Gemeinde → Gebäude → See/Fluss/Berg → Strasse."""

FieldKey = Literal["locality", "municipality", "building", "landscape_feature", "street"]


# --- ledger shapes ------------------------------------------------------------


class Evidence(BaseModel):
    model_config = ConfigDict(frozen=True)

    local_id: str
    kind: EvidenceKind
    source_class: SourceClass
    agent_id: AgentId
    observation: str
    strength: float = Field(ge=0, le=1)
    model_id: str | None = None
    source: str | None = None
    source_uri: str | None = None
    field: FieldKey | None = None
    """Which ranked field this item speaks to; None for context (EXIF date, scene)."""
    value: str | None = None
    """The value it supports, as text («Schwyz», «Grundstrasse 32»)."""
    lv95: tuple[float, float] | None = None
    attrs: dict[str, Any] = Field(default_factory=dict)


class HypothesisOut(BaseModel):
    local_id: str
    field: FieldKey
    value: str
    typed_value: dict[str, Any] | list[Any] | None = None
    supporting: list[str]
    """Evidence local ids that support it."""
    refuting: list[str] = Field(default_factory=list)
    prior: float = Field(ge=0, le=1)


class ObjectionOut(BaseModel):
    hypothesis: str
    claim: str
    severity: float = Field(ge=0, le=1)
    model_id: str | None = None


class FieldDecision(BaseModel):
    field: FieldKey
    decision: FieldDecisionKind
    value: str | None = None
    typed_value: dict[str, Any] | list[Any] | None = None
    hypothesis: str | None = None
    evidence: list[str] = Field(default_factory=list)
    upheld_objections: list[int] = Field(default_factory=list)
    """Indexes into the run's objection list."""
    abstain_reason: AbstainReason | None = None
    rationale: str = ""

    @model_validator(mode="after")
    def _evidence_or_abstain(self) -> FieldDecision:
        # I-1, first of three enforcements (Pydantic · DB trigger · CI test).
        if self.decision is FieldDecisionKind.ABSTAIN:
            if self.value is not None or self.abstain_reason is None:
                raise ValueError("an abstention carries no value and states its reason")
        elif not self.evidence or not self.value:
            raise ValueError("an emitted field must carry a value and cite evidence")
        return self


# --- model replies --------------------------------------------------------------


class Candidate(BaseModel):
    name: str = Field(description="The concrete proper name, e.g. «Schwyz», «Grosser Mythen».")
    kind: str = Field(
        default="",
        description="For buildings: nursing_home, hotel, church, school, hospital, house, …; "
        "for features: lake, river, peak, mountain_range.",
    )
    why: str = Field(description="What in the image supports this, concretely.")
    confidence: float = Field(ge=0, le=1)


class TextFinding(BaseModel):
    text: str = Field(description="Exactly as written, including spelling and diacritics.")
    where: str = Field(description="Where in the image (sign on façade, street plate, …).")
    legibility: float = Field(ge=0, le=1)


class Perception(BaseModel):
    """What the vision model reads off the image. It may say nothing."""

    description: str = Field(description="Two sentences: what the photograph shows.")
    scene_type: Literal["landscape", "village", "building", "street", "interior", "event", "other"]
    visible_text: list[TextFinding] = Field(default_factory=list)
    building_type: str = Field(
        default="", description="Generic type of the main building, e.g. nursing_home, hotel."
    )
    localities: list[Candidate] = Field(default_factory=list)
    buildings: list[Candidate] = Field(default_factory=list)
    features: list[Candidate] = Field(
        default_factory=list, description="Named lakes, rivers, mountains visible."
    )
    streets: list[Candidate] = Field(default_factory=list)
    viewpoint: str = Field(
        default="", description="Where the camera stands relative to the landmarks, if inferable."
    )


class Comparison(BaseModel):
    """Is the reference photo showing the same object as the archive photo?"""

    same_object: Literal["yes", "no", "unsure"]
    confidence: float = Field(ge=0, le=1)
    matching_details: list[str] = Field(default_factory=list)
    differences: list[str] = Field(default_factory=list)


class ChallengeItem(BaseModel):
    hypothesis: str = Field(description="The hypothesis id, e.g. hyp_A.")
    objection: str = Field(
        default="", description="The cheapest concrete way this conclusion is wrong; empty if none."
    )
    severity: float = Field(
        ge=0, le=1, description="0 = no real objection, 1 = the hypothesis is refuted."
    )


class Challenge(BaseModel):
    items: list[ChallengeItem]


class AdjudicatedField(BaseModel):
    field: FieldKey
    hypothesis: str | None = Field(
        default=None, description="The selected hypothesis id, or null to leave the field empty."
    )
    evidence: list[str] = Field(
        default_factory=list, description="Evidence ids that support the selected value."
    )
    upheld_objections: list[int] = Field(
        default_factory=list, description="Indexes of objections you uphold against it."
    )
    rationale: str = Field(description="One or two sentences, in German, for the archivist.")


class Adjudication(BaseModel):
    fields: list[AdjudicatedField]


class ReferenceVerdict(BaseModel):
    index: int = Field(description="The reference photo's number as given in the prompt.")
    same_object: Literal["yes", "no", "unsure"]
    confidence: float = Field(ge=0, le=1)
    details: str = Field(default="", description="Which concrete details match or differ.")


class ReferenceVerdicts(BaseModel):
    """Do the reference photos show the same building as the archive photo?"""

    verdicts: list[ReferenceVerdict]


class SightedName(BaseModel):
    field: Literal["locality", "municipality", "building", "landscape_feature", "street"]
    value: str = Field(description="A proper name exactly as a page title or label spells it.")


class SightingNames(BaseModel):
    """Proper names found in reverse-image page titles, labels and OCR text. No confidence:
    the pipeline checks which pages contain each name and assigns the strength itself."""

    names: list[SightedName] = Field(default_factory=list)
