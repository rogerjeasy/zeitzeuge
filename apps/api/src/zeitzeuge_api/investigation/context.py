"""What a run carries from stage to stage.

`RunContext` is the in-memory form of one investigation: the image, the EXIF
facts, and a `RunLedger` that every stage appends to. The ledger hands out
run-local ids (`ev_001`, `hyp_A`) so a model can cite evidence by id and the
adjudicator's citations can be checked against what actually exists — a cited
id that is not in the ledger is dropped, never trusted.

Each stage records a `StageRecord` (which roster agents it acted as, which
model, tokens, cost). `ledger.py` persists those; a stage itself never touches
the database, which is what lets the same stage code run in the in-API worker
today and in a Lambda handler later (design note D1).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from zeitzeuge_api.db.models.enums import AgentId, RunEventKind
from zeitzeuge_api.investigation.contracts import Evidence, HypothesisOut, ObjectionOut
from zeitzeuge_api.investigation.models import ModelClient, Reply
from zeitzeuge_api.investigation.tools.base import ToolHit


class Tools(Protocol):
    """The lookup clients a run may use (`investigation/tools/`)."""

    swisstopo: Any
    overpass: Any
    commons: Any
    wikipedia: Any
    catalogue: Any

    async def fetch_image(self, url: str) -> bytes | None: ...


@dataclass(slots=True)
class StageEvent:
    agent_id: AgentId
    kind: RunEventKind
    summary: str
    evidence_local_id: str | None = None
    at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(slots=True)
class StageRecord:
    stage: str
    agent_id: AgentId
    acting_as: list[AgentId]
    started_at: datetime
    ended_at: datetime | None = None
    model_id: str | None = None
    region: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def add_reply(self, reply: Reply[Any]) -> None:
        self.model_id = reply.model_id
        self.region = reply.region
        self.input_tokens += reply.input_tokens
        self.output_tokens += reply.output_tokens
        self.cost_usd += reply.cost_usd


@dataclass(slots=True)
class RunLedger:
    evidence: list[Evidence] = field(default_factory=list)
    hypotheses: list[HypothesisOut] = field(default_factory=list)
    objections: list[ObjectionOut] = field(default_factory=list)
    refutations: list[tuple[str, str]] = field(default_factory=list)
    """(evidence id, hypothesis id) pairs where the evidence refutes."""
    events: list[StageEvent] = field(default_factory=list)

    def next_evidence_id(self) -> str:
        return f"ev_{len(self.evidence) + 1:03d}"

    def next_hypothesis_id(self) -> str:
        n = len(self.hypotheses)
        letters = ""
        while True:
            letters = chr(ord("A") + n % 26) + letters
            n = n // 26 - 1
            if n < 0:
                break
        return f"hyp_{letters}"

    def add(self, **fields: Any) -> Evidence:
        item = Evidence(local_id=self.next_evidence_id(), **fields)
        self.evidence.append(item)
        self.events.append(
            StageEvent(
                agent_id=item.agent_id,
                kind=RunEventKind.EVIDENCE,
                summary=item.observation[:280],
                evidence_local_id=item.local_id,
            )
        )
        return item

    def add_from_hit(self, hit: ToolHit, **fields: Any) -> Evidence:
        """An evidence item citing a tool hit: source, link and position come with it."""
        return self.add(
            source=hit.source,
            source_uri=hit.source_uri,
            lv95=hit.lv95,
            attrs={"tool": hit.tool, "match": hit.match.value, **hit.attrs},
            **fields,
        )

    def note(self, agent_id: AgentId, summary: str) -> None:
        self.events.append(StageEvent(agent_id=agent_id, kind=RunEventKind.NOTE, summary=summary))

    def by_id(self, local_id: str) -> Evidence | None:
        return next((e for e in self.evidence if e.local_id == local_id), None)

    def for_field(self, field_key: str) -> list[Evidence]:
        return [e for e in self.evidence if e.field == field_key]


@dataclass(slots=True)
class Asset:
    id: uuid.UUID
    external_ref: str
    image: bytes
    """The master, as delivered."""
    prepared: bytes
    """JPEG, long edge 1568 px: what the models see."""


@dataclass(slots=True)
class RunContext:
    run_id: uuid.UUID
    org_id: uuid.UUID
    asset: Asset
    models: ModelClient
    tools: Tools
    ledger: RunLedger = field(default_factory=RunLedger)
    facts: dict[str, Any] = field(default_factory=dict)
    """Stage outputs other stages read: `exif`, `perception`, `candidates`, …"""
    records: list[StageRecord] = field(default_factory=list)

    def begin(self, stage: str, agent_id: AgentId, *acting_as: AgentId) -> StageRecord:
        record = StageRecord(
            stage=stage,
            agent_id=agent_id,
            acting_as=[agent_id, *acting_as],
            started_at=datetime.now(UTC),
        )
        self.records.append(record)
        self.ledger.events.append(
            StageEvent(agent_id=agent_id, kind=RunEventKind.STATE, summary=f"{stage}: gestartet")
        )
        return record
