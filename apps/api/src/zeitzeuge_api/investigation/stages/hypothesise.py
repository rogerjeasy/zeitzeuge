"""Hypothesise (roster: `synthesiser`) — group the ledger into candidate answers.

Per ranked field, every evidence item that names a value is grouped with the
others naming the *same* value (after folding case, accents and «Sankt/St.»),
and each group becomes one hypothesis citing exactly those items. Evidence
marked `refutes` counts against its group instead.

P0 does this deterministically rather than with a model (a change from the
architecture's Opus synthesiser): grouping by normalised name is a solved
problem, and a hypothesis that can only cite what is actually in the ledger is
the invariant this stage exists to protect. The official spelling wins the
label: a register hit's spelling beats a model's.
"""

from __future__ import annotations

import unicodedata
from collections import defaultdict
from datetime import UTC, datetime

from zeitzeuge_api.db.models.enums import AgentId, SourceClass
from zeitzeuge_api.investigation.confidence import Support, score
from zeitzeuge_api.investigation.context import RunContext
from zeitzeuge_api.investigation.contracts import RANKED_FIELDS, Evidence, HypothesisOut
from zeitzeuge_api.investigation.names import feature_key, is_placeholder, massif

STAGE = "hypothesise"

_OFFICIAL = (SourceClass.GEODATA_LAYER, SourceClass.TEXT_IN_IMAGE, SourceClass.REFERENCE_IMAGE)


def normalise(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value.casefold().replace("ß", "ss"))
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = folded.replace("sankt ", "st. ").replace("st ", "st. ")
    return " ".join(folded.replace("-", " ").split())


def _label(items: list[Evidence]) -> str:
    massifs = {massif(i.value) for i in items if i.value and massif(i.value)}
    if items and items[0].field == "landscape_feature" and len(massifs) == 1:
        return massifs.pop()  # type: ignore[return-value]
    for source_class in _OFFICIAL:
        for item in items:
            if item.source_class is source_class and item.value:
                return item.value
    return next(item.value for item in items if item.value)


async def run(ctx: RunContext) -> None:
    record = ctx.begin(STAGE, AgentId.SYNTHESISER)
    for field in RANKED_FIELDS:
        groups: dict[str, list[Evidence]] = defaultdict(list)
        for item in ctx.ledger.for_field(field):
            if item.value and not (field == "building" and is_placeholder(item.value)):
                key = (
                    feature_key(item.value)
                    if field == "landscape_feature"
                    else normalise(item.value)
                )
                groups[key].append(item)

        scored = []
        for items in groups.values():
            supporting = [i for i in items if not i.attrs.get("refutes")]
            refuting = [i for i in items if i.attrs.get("refutes")]
            raw = score([Support(i.source_class, i.strength) for i in supporting]).raw
            if supporting:
                scored.append((raw, items, supporting, refuting))
        total = sum(raw for raw, *_ in scored) or 1.0
        for raw, items, supporting, refuting in sorted(scored, key=lambda s: -s[0]):
            typed = next(
                (i.attrs["typed_value"] for i in supporting if i.attrs.get("typed_value")), None
            )
            hypothesis = HypothesisOut(
                local_id=ctx.ledger.next_hypothesis_id(),
                field=field,  # type: ignore[arg-type]
                value=_label(supporting or items),
                typed_value=typed,
                supporting=[i.local_id for i in supporting],
                refuting=[i.local_id for i in refuting],
                prior=round(raw / total, 3),
            )
            ctx.ledger.hypotheses.append(hypothesis)
            for item in refuting:
                ctx.ledger.refutations.append((item.local_id, hypothesis.local_id))

    counts = {f: sum(1 for h in ctx.ledger.hypotheses if h.field == f) for f in RANKED_FIELDS}
    ctx.ledger.note(
        AgentId.SYNTHESISER,
        "Hypothesen: " + ", ".join(f"{f} {n}" for f, n in counts.items()),
    )
    record.output = {"hypotheses": [h.model_dump() for h in ctx.ledger.hypotheses]}
    record.ended_at = datetime.now(UTC)
