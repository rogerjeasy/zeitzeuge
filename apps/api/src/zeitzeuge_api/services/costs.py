"""What the investigation costs, from the recorded model calls (cost page).

Every model call is an `agent_invocations` row with its model, tokens, cost and
duration; the cost is the provider's list price applied to the tokens the call
reported (`investigation/models.py`, `tools/research.py`). This module only
aggregates those rows for the tenant: per Swiss day and vendor, per model, per
stage, per batch, and a projection from the measured cost per photo.

What is *not* in the rows is said, not estimated: Google Cloud Vision, Places,
Street View and SerpApi run inside their free monthly quotas and are not
metered per call.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from zeitzeuge_api.db.models import AgentInvocation, Asset, Run, UploadBatch

ZONE = ZoneInfo("Europe/Zurich")
UNMETERED = ("google_cloud_vision", "google_places", "google_street_view", "serpapi_lens")

# Model id prefix → (vendor, label, USD per 1M input, USD per 1M output).
# The same list prices the pipeline uses to price each call.
MODELS: tuple[tuple[str, str, str, float, float], ...] = (
    ("eu.anthropic.claude-opus-4-6", "anthropic", "Claude Opus 4.6", 5.0, 25.0),
    ("eu.anthropic.claude-opus-4-5", "anthropic", "Claude Opus 4.5", 5.0, 25.0),
    ("eu.anthropic.claude-sonnet-4-6", "anthropic", "Claude Sonnet 4.6", 3.0, 15.0),
    ("eu.anthropic.claude-haiku-4-5", "anthropic", "Claude Haiku 4.5", 1.0, 5.0),
    ("global.openai.", "openai", "OpenAI (Bedrock)", 2.5, 10.0),
    ("gpt-5.5", "openai", "GPT-5.5 + Websuche", 5.0, 30.0),
    ("openai/gpt-6.1-sol", "openai", "GPT-6.1 Sol (Red Team)", 2.5, 10.0),
    ("gpt-6.1-sol", "openai", "GPT-6.1 Sol (Red Team)", 2.5, 10.0),
    ("gpt-6", "openai", "GPT-6", 2.5, 10.0),
    ("gemini-4-argon", "google", "Gemini 4 Argon + Google Search", 2.0, 12.0),
    ("gemini", "google", "Gemini", 2.0, 12.0),
)


def describe(model_id: str) -> tuple[str, str, float | None, float | None]:
    for prefix, vendor, label, price_in, price_out in MODELS:
        if model_id.startswith(prefix):
            return vendor, label, price_in, price_out
    vendor = (
        "anthropic"
        if "anthropic" in model_id or "claude" in model_id
        else "openai"
        if "gpt" in model_id or "openai" in model_id
        else "google"
        if "gemini" in model_id
        else "other"
    )
    return vendor, model_id, None, None


def _calls(row: AgentInvocation) -> list[dict[str, Any]]:
    """One invocation, split per model where the stage recorded that (research)."""
    split = (row.output or {}).get("cost_by_model") if isinstance(row.output, dict) else None
    if split:
        return [
            {
                "model_id": str(part.get("model_id") or ""),
                "input_tokens": int(part.get("input_tokens") or 0),
                "output_tokens": int(part.get("output_tokens") or 0),
                "cost": float(part.get("cost_usd") or 0.0),
            }
            for part in split
        ]
    return [
        {
            "model_id": row.model_id or "",
            "input_tokens": row.input_tokens or 0,
            "output_tokens": row.output_tokens or 0,
            "cost": float(row.cost_usd or 0),
        }
    ]


async def cost_report(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    days: int | None,
    show_withdrawn: bool = False,
) -> dict[str, Any]:
    """RLS scopes the session already; `org_id` is applied too (defence in depth).

    Withdrawn batches belong to the Papierkorb: only approvers see them by name
    (`show_withdrawn`); for everyone else their cost is one unnamed row, so the
    totals stay complete without disclosing what was removed.
    """
    now = datetime.now(UTC)
    since = now - timedelta(days=days) if days else None
    query = select(AgentInvocation).where(
        AgentInvocation.org_id == org_id, AgentInvocation.model_id.is_not(None)
    )
    if since is not None:
        query = query.where(AgentInvocation.started_at >= since)
    rows = list(await session.scalars(query))

    by_day: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    by_model: dict[str, dict[str, Any]] = {}
    by_stage: dict[str, dict[str, Any]] = {}
    run_cost: dict[uuid.UUID, float] = defaultdict(float)
    totals = {"cost": 0.0, "input": 0, "output": 0, "calls": 0}
    for row in rows:
        if row.started_at is None:
            continue
        day = row.started_at.astimezone(ZONE).date()
        stage = by_stage.setdefault(row.stage, {"calls": 0, "cost": 0.0, "ms": 0, "timed": 0})
        stage["calls"] += 1
        if row.ended_at and row.started_at:
            stage["ms"] += int((row.ended_at - row.started_at).total_seconds() * 1000)
            stage["timed"] += 1
        for call in _calls(row):
            vendor, label, price_in, price_out = describe(call["model_id"])
            # A research row from before the per-model split names both families.
            if "," in call["model_id"]:
                vendor, label, price_in, price_out = (
                    "mixed",
                    "Websuche-Recherche (beide Familien)",
                    None,
                    None,
                )
            model = by_model.setdefault(
                label,
                {
                    "label": label,
                    "vendor": vendor,
                    "model_ids": set(),
                    "calls": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cost_usd": 0.0,
                    "price_in": price_in,
                    "price_out": price_out,
                },
            )
            model["model_ids"].add(call["model_id"])
            model["calls"] += 1
            model["input_tokens"] += call["input_tokens"]
            model["output_tokens"] += call["output_tokens"]
            model["cost_usd"] += call["cost"]
            by_day[day][vendor] += call["cost"]
            stage["cost"] += call["cost"]
            run_cost[row.run_id] += call["cost"]
            totals["cost"] += call["cost"]
            totals["input"] += call["input_tokens"]
            totals["output"] += call["output_tokens"]
            totals["calls"] += 1

    runs = (
        {
            r.id: r
            for r in await session.scalars(
                select(Run).where(Run.org_id == org_id, Run.id.in_(list(run_cost)))
            )
        }
        if run_cost
        else {}
    )
    finished = [
        r for r in runs.values() if r.finished_at is not None and r.status.value != "failed"
    ]
    photos = len({r.asset_id for r in finished})
    finished_cost = sum(run_cost[r.id] for r in finished)
    per_photo = finished_cost / len(finished) if finished else None

    batch_ids = {r.batch_id for r in runs.values() if r.batch_id}
    batches = (
        {
            b.id: b
            for b in await session.scalars(
                select(UploadBatch).where(
                    UploadBatch.org_id == org_id, UploadBatch.id.in_(batch_ids)
                )
            )
        }
        if batch_ids
        else {}
    )
    batch_rows: dict[uuid.UUID, dict[str, Any]] = {}
    for run in runs.values():
        if not run.batch_id:
            continue
        slot = batch_rows.setdefault(
            run.batch_id, {"cost": 0.0, "photos": set(), "failed": 0, "runs": 0}
        )
        slot["cost"] += run_cost[run.id]
        slot["runs"] += 1
        if run.status.value == "failed":
            slot["failed"] += 1
        elif run.finished_at is not None:
            slot["photos"].add(run.asset_id)
    live_assets = await session.scalar(
        select(func.count())
        .select_from(Asset)
        .where(Asset.org_id == org_id, Asset.deleted_at.is_(None))
    )

    first_day = min(by_day) if by_day else None
    span = (
        [
            first_day + timedelta(days=i)
            for i in range((now.astimezone(ZONE).date() - first_day).days + 1)
        ]
        if first_day
        else []
    )
    vendors = ("anthropic", "openai", "google", "mixed", "other")
    total = totals["cost"] or 1.0
    return {
        "currency": "USD",
        "period": {
            "days": days,
            "from": (
                since
                or (datetime.combine(first_day, datetime.min.time(), ZONE) if first_day else now)
            ).isoformat(),
            "to": now.isoformat(),
        },
        "totals": {
            "cost_usd": round(totals["cost"], 4),
            "calls": totals["calls"],
            "runs": len(runs),
            "photos": photos,
            "failed_runs": sum(1 for r in runs.values() if r.status.value == "failed"),
            "input_tokens": totals["input"],
            "output_tokens": totals["output"],
            "cost_per_photo": round(per_photo, 4) if per_photo is not None else None,
            "live_photos": live_assets or 0,
        },
        "by_day": [
            {
                "day": d.isoformat(),
                "total": round(sum(by_day[d].values()), 4) if d in by_day else 0.0,
                **{v: round(by_day[d].get(v, 0.0), 4) if d in by_day else 0.0 for v in vendors},
            }
            for d in span
        ],
        "by_model": sorted(
            (
                {
                    "label": m["label"],
                    "vendor": m["vendor"],
                    "model_ids": sorted(m["model_ids"]),
                    "calls": m["calls"],
                    "input_tokens": m["input_tokens"],
                    "output_tokens": m["output_tokens"],
                    "cost_usd": round(m["cost_usd"], 4),
                    "share": round(m["cost_usd"] / total, 4),
                    "price_in_per_mtok": m["price_in"],
                    "price_out_per_mtok": m["price_out"],
                    "cost_per_call": round(m["cost_usd"] / m["calls"], 4) if m["calls"] else None,
                }
                for m in by_model.values()
            ),
            key=lambda m: -m["cost_usd"],
        ),
        "by_stage": sorted(
            (
                {
                    "stage": name,
                    "calls": s["calls"],
                    "cost_usd": round(s["cost"], 4),
                    "share": round(s["cost"] / total, 4),
                    "avg_seconds": round(s["ms"] / s["timed"] / 1000, 1) if s["timed"] else None,
                }
                for name, s in by_stage.items()
            ),
            key=lambda s: -s["cost_usd"],
        ),
        "by_batch": _batch_rows(batch_rows, batches, show_withdrawn),
        "projection": {
            "cost_per_photo": round(per_photo, 4) if per_photo is not None else None,
            "prio1_set": round(per_photo * 50, 2) if per_photo is not None else None,
            "delivery_600": round(per_photo * 600, 2) if per_photo is not None else None,
            "collection_200000": round(per_photo * 200_000, 0) if per_photo is not None else None,
        },
        "unmetered": list(UNMETERED),
    }


def _batch_rows(
    rows: dict[uuid.UUID, dict[str, Any]],
    batches: dict[uuid.UUID, UploadBatch],
    show_withdrawn: bool,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    hidden = {"cost": 0.0, "photos": 0, "runs": 0, "failed": 0}
    for bid, b in rows.items():
        batch = batches.get(bid)
        withdrawn = bool(batch and batch.deleted_at)
        if withdrawn and not show_withdrawn:
            hidden["cost"] += b["cost"]
            hidden["photos"] += len(b["photos"])
            hidden["runs"] += b["runs"]
            hidden["failed"] += b["failed"]
            continue
        out.append(
            {
                "batch_id": str(bid),
                "label": batch.label if batch else None,
                "withdrawn": withdrawn,
                "runs": b["runs"],
                "photos": len(b["photos"]),
                "failed_runs": b["failed"],
                "cost_usd": round(b["cost"], 4),
                "cost_per_photo": round(b["cost"] / len(b["photos"]), 4) if b["photos"] else None,
                "created_at": batch.created_at.isoformat() if batch else None,
            }
        )
    out.sort(key=lambda r: r["created_at"] or "", reverse=True)
    if hidden["runs"]:
        out.append(
            {
                "batch_id": None,
                "label": None,
                "withdrawn": True,
                "runs": hidden["runs"],
                "photos": hidden["photos"],
                "failed_runs": hidden["failed"],
                "cost_usd": round(hidden["cost"], 4),
                "cost_per_photo": round(hidden["cost"] / hidden["photos"], 4)
                if hidden["photos"]
                else None,
                "created_at": None,
            }
        )
    return out
