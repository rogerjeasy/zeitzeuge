"""Model access: task kinds → bindings → Bedrock Converse.

Stages ask for a *task* (`perceive`, `compare`, `challenge`, `adjudicate`), not
for a model. The binding table is the P0 form of `models.yaml` (architecture
§5.5): one place that says which model does what, overridable per environment
with `ZZ_MODEL_<TASK>`, and recorded on every invocation so a run is
reproducible.

The red team must be a different family from the author (I-6). OpenAI models
are on Bedrock only through `global.*` profiles (design note D4). If that call
is refused (the permissions boundary, a missing grant), the challenge falls
back to the fallback binding and the reply says so (`same_family_fallback`),
which the ledger and the workbook print. A silent downgrade would be the one
thing this product cannot afford.

Structured output is a forced tool call whose input schema is the Pydantic
contract's JSON Schema. A reply that does not validate is retried once with the
validation error, then the stage fails and the worker records it.
"""

from __future__ import annotations

import io
import json
import os
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, TypeVar

import anyio
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class Task(StrEnum):
    PERCEIVE = "perceive"
    COMPARE = "compare"
    CHALLENGE = "challenge"
    ADJUDICATE = "adjudicate"


@dataclass(frozen=True, slots=True)
class Binding:
    model_id: str
    family: str
    input_usd_per_mtok: float
    output_usd_per_mtok: float

    @property
    def region(self) -> str:
        return "global" if self.model_id.startswith("global.") else "eu"


OPUS = Binding("eu.anthropic.claude-opus-4-6-v1", "claude-opus", 5.0, 25.0)
SONNET = Binding("eu.anthropic.claude-sonnet-4-6", "claude-sonnet", 3.0, 15.0)
HAIKU = Binding("eu.anthropic.claude-haiku-4-5-20251001-v1:0", "claude-haiku", 1.0, 5.0)
OPENAI = Binding("global.openai.gpt-6.1-sol", "openai", 2.5, 10.0)

_FAMILIES = {
    "anthropic.claude-opus": "claude-opus",
    "anthropic.claude-sonnet": "claude-sonnet",
    "anthropic.claude-haiku": "claude-haiku",
    "openai.": "openai",
}

DEFAULT_BINDINGS: dict[Task, Binding] = {
    Task.PERCEIVE: OPUS,
    Task.COMPARE: OPUS,
    Task.CHALLENGE: OPENAI,
    Task.ADJUDICATE: OPUS,
}
FALLBACKS: dict[Task, Binding] = {
    Task.PERCEIVE: SONNET,
    Task.COMPARE: SONNET,
    Task.CHALLENGE: HAIKU,
    Task.ADJUDICATE: SONNET,
}
"""Used when the first choice is refused (no model access, a policy, a region).
For the challenge the fallback is the same vendor — labelled as same-family
wherever it is used, never silently."""
CHALLENGE_FALLBACK = FALLBACKS[Task.CHALLENGE]
_REFUSED = {"AccessDeniedException", "ResourceNotFoundException", "ValidationException"}
_REFUSAL_TTL_SECONDS = 600.0


def _family_of(model_id: str) -> str:
    for marker, family in _FAMILIES.items():
        if marker in model_id:
            return family
    return "other"


def bindings_from_env() -> dict[Task, Binding]:
    """`ZZ_MODEL_PERCEIVE=eu.anthropic.claude-opus-5-5` swaps one binding."""
    bindings = dict(DEFAULT_BINDINGS)
    for task in Task:
        override = os.environ.get(f"ZZ_MODEL_{task.upper()}")
        if override:
            base = bindings[task]
            bindings[task] = Binding(
                override, _family_of(override), base.input_usd_per_mtok, base.output_usd_per_mtok
            )
    return bindings


@dataclass(frozen=True, slots=True)
class Reply[M: BaseModel]:
    data: M
    model_id: str
    family: str
    region: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    same_family_fallback: bool = False


class ModelError(Exception):
    pass


def prepare_image(raw: bytes, *, long_edge: int = 1568, quality: int = 85) -> bytes:
    """JPEG at the size Claude reads best; also keeps Converse under its byte limit."""
    image = Image.open(io.BytesIO(raw))
    image.thumbnail((long_edge, long_edge))
    out = io.BytesIO()
    image.convert("RGB").save(out, "JPEG", quality=quality)
    return out.getvalue()


class ModelClient:
    def __init__(
        self,
        *,
        region: str = "eu-central-2",
        bindings: dict[Task, Binding] | None = None,
        client: Any | None = None,
    ) -> None:
        self.bindings = bindings or bindings_from_env()
        self._refused: dict[str, float] = {}
        """model id → when it was last refused; skipped for a while instead of re-asked."""
        self._client = client or boto3.session.Session(region_name=region).client(
            "bedrock-runtime",
            config=Config(retries={"max_attempts": 4, "mode": "adaptive"}, read_timeout=180),
        )

    async def ask(
        self,
        task: Task,
        contract: type[T],
        *,
        system: str,
        prompt: str,
        images: list[bytes] | None = None,
        max_tokens: int = 3000,
    ) -> Reply[T]:
        binding = self.bindings[task]
        fallback = FALLBACKS.get(task)
        refused_at = self._refused.get(binding.model_id)
        if refused_at is None or time.monotonic() - refused_at > _REFUSAL_TTL_SECONDS:
            try:
                return await self._ask(binding, contract, system, prompt, images or [], max_tokens)
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code not in _REFUSED or fallback is None or fallback == binding:
                    raise ModelError(f"{binding.model_id}: {code or exc}") from exc
                self._refused[binding.model_id] = time.monotonic()
            except BotoCoreError as exc:
                raise ModelError(f"{binding.model_id}: {exc}") from exc
        if fallback is None:
            raise ModelError(f"{binding.model_id}: refused, and no fallback for {task}")
        try:
            reply = await self._ask(fallback, contract, system, prompt, images or [], max_tokens)
        except (ClientError, BotoCoreError) as exc:
            raise ModelError(f"{fallback.model_id}: {exc}") from exc
        return Reply(**{**_as_dict(reply), "same_family_fallback": task is Task.CHALLENGE})

    async def _ask(
        self,
        binding: Binding,
        contract: type[T],
        system: str,
        prompt: str,
        images: list[bytes],
        max_tokens: int,
    ) -> Reply[T]:
        content: list[dict[str, Any]] = [
            {"image": {"format": "jpeg", "source": {"bytes": image}}} for image in images
        ]
        content.append({"text": prompt})
        messages: list[dict[str, Any]] = [{"role": "user", "content": content}]
        tool = {
            "toolSpec": {
                "name": "answer",
                "description": "Return the answer. This is the only way to reply.",
                "inputSchema": {"json": contract.model_json_schema()},
            }
        }
        input_tokens = output_tokens = 0
        started = time.monotonic()
        last_error = ""

        def _converse(conversation: list[dict[str, Any]]) -> dict[str, Any]:
            return dict(
                self._client.converse(
                    modelId=binding.model_id,
                    system=[{"text": system}],
                    messages=conversation,
                    toolConfig={"tools": [tool], "toolChoice": {"tool": {"name": "answer"}}},
                    # Deterministic sampling: the same photo should get the same reading.
                    inferenceConfig={"maxTokens": max_tokens, "temperature": 0},
                )
            )

        for _attempt in range(2):
            response = await anyio.to_thread.run_sync(_converse, messages)
            usage = response.get("usage", {})
            input_tokens += int(usage.get("inputTokens", 0))
            output_tokens += int(usage.get("outputTokens", 0))
            blocks = response["output"]["message"]["content"]
            payload = _tool_input(blocks)
            try:
                data = contract.model_validate(payload)
            except ValidationError as exc:
                last_error = str(exc)
                messages = [
                    *messages,
                    response["output"]["message"],
                    {
                        "role": "user",
                        "content": [
                            _tool_result(
                                blocks, f"Invalid: {last_error[:1500]}. Call answer again."
                            ),
                        ],
                    },
                ]
                continue
            cost = (
                input_tokens * binding.input_usd_per_mtok
                + output_tokens * binding.output_usd_per_mtok
            ) / 1_000_000
            return Reply(
                data=data,
                model_id=binding.model_id,
                family=binding.family,
                region=binding.region,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=round(cost, 6),
                latency_ms=int((time.monotonic() - started) * 1000),
            )
        raise ModelError(f"{binding.model_id}: reply did not fit {contract.__name__}: {last_error}")


def _tool_input(blocks: list[dict[str, Any]]) -> Any:
    for block in blocks:
        if "toolUse" in block:
            return block["toolUse"].get("input", {})
    for block in blocks:  # a model that answered in text after all
        text = block.get("text", "")
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except ValueError:
                pass
    return {}


def _tool_result(blocks: list[dict[str, Any]], message: str) -> dict[str, Any]:
    for block in blocks:
        if "toolUse" in block:
            return {
                "toolResult": {
                    "toolUseId": block["toolUse"]["toolUseId"],
                    "content": [{"text": message}],
                    "status": "error",
                }
            }
    return {"text": message}


def _as_dict(reply: Reply[Any]) -> dict[str, Any]:
    return {
        "data": reply.data,
        "model_id": reply.model_id,
        "family": reply.family,
        "region": reply.region,
        "input_tokens": reply.input_tokens,
        "output_tokens": reply.output_tokens,
        "cost_usd": reply.cost_usd,
        "latency_ms": reply.latency_ms,
    }
