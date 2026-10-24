"""Research (roster: `research`) — two model families search the web; we check their sources.

The calls start right after Intake (`start`) and run while Perception looks at
the photo; this stage only collects them, so the ledger stays sequential.

Each family's value per field becomes one `open_research` evidence item. Its
strength is the rule's, not the model's (identification-upgrade note §5.1):

* every URL the family cited for the value is fetched by `page.verify`; the claim
  is *verified* when a page names the value (for a building or street: and the
  place the same family named);
* verified 0.6, unverified 0.3; when both families name the same value and at
  least one is verified, both items carry 0.9.

The values then go to Grounding as candidates (`extra_candidates`), and the
image URLs the agents found go to Reference as photos to compare. Research
alone can never fill a field: 0.5 x 0.9 = 0.45 is below the review line.
"""

from __future__ import annotations

import asyncio
import hashlib
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from zeitzeuge_api.db.models.enums import AgentId, EvidenceKind, SourceClass
from zeitzeuge_api.investigation.confidence import research_strength
from zeitzeuge_api.investigation.context import RunContext
from zeitzeuge_api.investigation.names import distinctive, feature_key
from zeitzeuge_api.investigation.stages.hypothesise import normalise
from zeitzeuge_api.investigation.tools.base import ToolUnavailable
from zeitzeuge_api.investigation.tools.pages import Page
from zeitzeuge_api.investigation.tools.research import FIELDS, ResearchResult

STAGE = "research"
MAX_PAGES_PER_VALUE = 4
_FAMILY_DE = {"openai": "OpenAI", "google": "Google Gemini"}


def _clients(ctx: RunContext) -> list[Any]:
    return [
        c
        for c in (
            getattr(ctx.tools, "research_openai", None),
            getattr(ctx.tools, "research_gemini", None),
        )
        if c is not None
    ]


def start(ctx: RunContext) -> None:
    """Launch both families in the background; `run` collects them."""
    if "research_tasks" in ctx.facts:
        return
    exif = ctx.facts.get("exif", {})
    captured = exif.get("captured_at")
    date = f"{captured:%Y-%m-%d}" if captured else None
    sha = hashlib.sha256(ctx.asset.image).hexdigest()
    tasks: dict[str, asyncio.Task[ResearchResult]] = {}
    for client in _clients(ctx):
        if client.available:
            tasks[client.family] = asyncio.create_task(
                client.investigate(ctx.asset.prepared, sha, exif_date=date)
            )
    ctx.facts["research_tasks"] = tasks


def cancel(ctx: RunContext) -> None:
    for task in ctx.facts.get("research_tasks", {}).values():
        task.cancel()


def agreement_key(field: str, value: str) -> str:
    if field == "landscape_feature":
        return feature_key(value)
    if field == "building":
        return distinctive(value) or normalise(value)
    return normalise(value)


def _place_for(field: str, result: ResearchResult) -> str | None:
    """What a page must also name for the value to count: the place of a building or street."""
    if field not in {"building", "street"}:
        return None
    fields = result.answer.fields
    for key in ("locality", "municipality"):
        item = fields.get(key)
        if item is not None and item.value:
            return item.value
    return None


async def _verify(
    ctx: RunContext, result: ResearchResult, field: str, value: str, urls: list[str]
) -> Page | None:
    verifier = getattr(ctx.tools, "pages", None)
    if verifier is None:
        return None
    place = _place_for(field, result)
    for url in urls[:MAX_PAGES_PER_VALUE]:
        page = await verifier.verify(url, value, place=place)
        if page is not None:
            return page
    return None


async def run(ctx: RunContext) -> None:
    record = ctx.begin(STAGE, AgentId.RESEARCH)
    clients = _clients(ctx)
    if not any(c.available for c in clients):
        ctx.ledger.note(AgentId.RESEARCH, "Web-Recherche übersprungen: kein Schlüssel hinterlegt")
        record.ended_at = datetime.now(UTC)
        return
    start(ctx)
    for client in clients:
        if not client.available:
            ctx.ledger.note(
                AgentId.RESEARCH,
                f"{_FAMILY_DE.get(client.family, client.family)}: übersprungen, kein Schlüssel",
            )

    results: list[ResearchResult] = []
    for family, task in ctx.facts["research_tasks"].items():
        try:
            results.append(await task)
        except ToolUnavailable as exc:
            ctx.ledger.note(AgentId.RESEARCH, f"{_FAMILY_DE.get(family, family)}: {exc}"[:280])
        except Exception as exc:  # one family failing must not cost the other's answer
            ctx.ledger.note(
                AgentId.RESEARCH, f"{_FAMILY_DE.get(family, family)}: {type(exc).__name__}"
            )

    # Verify every (family, field, value) concurrently.
    claims: list[tuple[ResearchResult, str, str, list[str]]] = []
    for result in results:
        cited = [url for url, _ in result.cited]
        for name in FIELDS:
            item = result.answer.fields.get(name)
            if item is None or not item.value:
                continue
            urls = list(dict.fromkeys([*item.sources, *cited]))
            claims.append((result, name, item.value.strip(), urls))
    pages = await asyncio.gather(*(_verify(ctx, r, f, v, u) for r, f, v, u in claims))

    families: dict[tuple[str, str], set[str]] = defaultdict(set)
    verified_any: dict[tuple[str, str], bool] = defaultdict(bool)
    for (result, field, value, _), page in zip(claims, pages, strict=True):
        key = (field, agreement_key(field, value))
        families[key].add(result.family)
        verified_any[key] |= page is not None

    extra: dict[str, list[tuple[float, str]]] = defaultdict(list)
    for (result, field, value, urls), page in zip(claims, pages, strict=True):
        key = (field, agreement_key(field, value))
        strength = research_strength(
            verified=page is not None,
            families_agreeing=len(families[key]),
            any_verified=verified_any[key],
        )
        claimed = result.answer.fields.get(field)  # type: ignore[call-overload]
        note = (claimed.note if claimed else "").strip()
        family = _FAMILY_DE.get(result.family, result.family)
        agreed = len(families[key]) > 1
        observation = (
            f"{family} ({result.model_id}, Websuche): «{value}»"
            + (" — beide Modellfamilien einig" if agreed else "")
            + (
                f" — Quelle geprüft: «{page.title or page.url}»"
                if page
                else " — keine der genannten Quellen nennt den Wert"
            )
            + (f". {note}" if note else "")
        )
        ctx.ledger.add(
            kind=EvidenceKind.EXTERNAL,
            source_class=SourceClass.OPEN_RESEARCH,
            agent_id=AgentId.RESEARCH,
            model_id=result.model_id,
            observation=observation[:600],
            strength=strength,
            source=f"KI-Recherche {family} mit Websuche",
            source_uri=page.url if page else (urls[0] if urls else None),
            field=field,
            value=value,
            attrs={
                "family": result.family,
                "verified": page is not None,
                "families_agreeing": len(families[key]),
                "sources": urls[:6],
            },
        )
        extra[field].append((strength, value))

    ctx.facts["extra_candidates"] = {
        field: [v for _, v in sorted(values, key=lambda sv: -sv[0])]
        for field, values in extra.items()
    }
    ctx.facts["research_reference_images"] = [
        {"url": ref.url, "shows": ref.shows, "family": r.family}
        for r in results
        for ref in r.answer.reference_images
    ]
    outside = [r.answer.outside_canton for r in results if r.answer.outside_canton is not None]
    if outside:
        ctx.facts["research_outside_canton"] = all(outside)

    record.model_id = ", ".join(r.model_id for r in results) or None
    record.region = "global"
    record.input_tokens = sum(r.input_tokens for r in results)
    record.output_tokens = sum(r.output_tokens for r in results)
    record.cost_usd = sum(r.cost_usd for r in results)
    record.output = {
        "families": [r.family for r in results],
        "answers": {r.family: r.answer.model_dump() for r in results},
        "verified": {
            f"{r.family}:{f}": page is not None
            for (r, f, _, _), page in zip(claims, pages, strict=True)
        },
        "latency_ms": {r.family: r.latency_ms for r in results},
        # Each family's own bill, so the cost page can split the stage by model.
        "cost_by_model": [
            {
                "model_id": r.model_id,
                "family": r.family,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cost_usd": round(r.cost_usd, 6),
            }
            for r in results
        ],
    }
    record.ended_at = datetime.now(UTC)
