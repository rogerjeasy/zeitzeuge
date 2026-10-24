"""Model bindings fall back, visibly, when the first choice is refused."""

from __future__ import annotations

from typing import Any

from botocore.exceptions import ClientError

from zeitzeuge_api.investigation.contracts import Challenge
from zeitzeuge_api.investigation.models import HAIKU, OPUS, OPUS_45, ModelClient, Task


class FakeBedrock:
    def __init__(self, refuse: set[str]) -> None:
        self.refuse = refuse
        self.calls: list[str] = []

    def converse(self, **kwargs: Any) -> dict[str, Any]:
        model = kwargs["modelId"]
        self.calls.append(model)
        if model in self.refuse:
            raise ClientError(
                {"Error": {"Code": "ResourceNotFoundException", "Message": "use case"}},
                "Converse",
            )
        return {
            "usage": {"inputTokens": 10, "outputTokens": 5},
            "output": {
                "message": {
                    "role": "assistant",
                    "content": [{"toolUse": {"toolUseId": "t1", "input": {"items": []}}}],
                }
            },
        }


async def test_a_refused_model_falls_back_and_is_then_skipped() -> None:
    fake = FakeBedrock(refuse={OPUS.model_id})
    client = ModelClient(client=fake)
    for _ in range(2):
        reply = await client.ask(Task.ADJUDICATE, Challenge, system="s", prompt="p")
        assert reply.model_id == OPUS_45.model_id
        assert reply.same_family_fallback is False
    # the refusal is remembered: Opus 4.6 is asked once, not on every call
    assert fake.calls == [OPUS.model_id, OPUS_45.model_id, OPUS_45.model_id]


async def test_the_red_team_fallback_says_it_is_same_family() -> None:
    fake = FakeBedrock(refuse={"global.openai.gpt-6.1-sol"})
    reply = await ModelClient(client=fake).ask(Task.CHALLENGE, Challenge, system="s", prompt="p")
    assert reply.model_id == HAIKU.model_id
    assert reply.same_family_fallback is True


async def test_the_first_choice_answers_when_it_can() -> None:
    fake = FakeBedrock(refuse=set())
    reply = await ModelClient(client=fake).ask(Task.PERCEIVE, Challenge, system="s", prompt="p")
    assert reply.model_id == OPUS.model_id


async def test_one_rejected_request_does_not_demote_the_next() -> None:
    class Flaky(FakeBedrock):
        def converse(self, **kwargs: Any) -> dict[str, Any]:
            if kwargs["modelId"] == OPUS.model_id and not self.calls:
                self.calls.append(kwargs["modelId"])
                raise ClientError(
                    {"Error": {"Code": "ValidationException", "Message": "too large"}}, "Converse"
                )
            return super().converse(**kwargs)

    fake = Flaky(refuse=set())
    client = ModelClient(client=fake)
    first = await client.ask(Task.PERCEIVE, Challenge, system="s", prompt="p")
    second = await client.ask(Task.PERCEIVE, Challenge, system="s", prompt="p")
    assert first.model_id == OPUS_45.model_id
    assert second.model_id == OPUS.model_id


class FakeOpenAI:
    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.bodies: list[dict[str, Any]] = []

    async def post(self, url: str, **kwargs: Any):
        json = kwargs["json"]
        import httpx

        self.bodies.append(json)
        payload = (
            {
                "output": [
                    {"type": "reasoning", "summary": []},
                    {"type": "function_call", "name": "answer", "arguments": '{"items": []}'},
                ],
                "usage": {"input_tokens": 100, "output_tokens": 20},
            }
            if self.status == 200
            else {"error": {"code": "rate_limit_exceeded", "message": "echo of the prompt"}}
        )
        return httpx.Response(self.status, json=payload, request=httpx.Request("POST", url))


async def test_the_red_team_is_openai_when_a_key_is_present() -> None:
    http = FakeOpenAI()
    client = ModelClient(client=FakeBedrock(set()), openai_key="sk-test", http=http)  # type: ignore[arg-type]
    reply = await client.ask(Task.CHALLENGE, Challenge, system="s", prompt="p", images=[b"x"])
    assert reply.model_id == "openai/gpt-6.1-sol"
    assert reply.family == "openai" and reply.region == "external"
    assert reply.same_family_fallback is False
    assert http.bodies[0]["tool_choice"] == {"type": "function", "name": "answer"}
    assert http.bodies[0]["input"][0]["content"][0]["image_url"].startswith("data:image/")


async def test_an_openai_failure_falls_back_and_says_so() -> None:
    fake = FakeBedrock(set())
    client = ModelClient(client=fake, openai_key="sk-test", http=FakeOpenAI(429))  # type: ignore[arg-type]
    reply = await client.ask(Task.CHALLENGE, Challenge, system="s", prompt="p")
    assert reply.model_id == HAIKU.model_id
    assert reply.same_family_fallback is True


class ThrottlingBedrock(FakeBedrock):
    """Opus is busy for the first `busy` calls (or always), everything else answers."""

    def __init__(self, busy: int | None) -> None:
        super().__init__(set())
        self.busy = busy

    def converse(self, **kwargs: Any) -> dict[str, Any]:
        model = kwargs["modelId"]
        throttled = sum(1 for m in self.calls if m == OPUS.model_id)
        if model == OPUS.model_id and (self.busy is None or throttled < self.busy):
            self.calls.append(model)
            raise ClientError(
                {"Error": {"Code": "ThrottlingException", "Message": "Too many requests"}},
                "Converse",
            )
        return super().converse(**kwargs)


async def test_a_throttled_model_is_retried_not_failed(monkeypatch) -> None:
    from zeitzeuge_api.investigation import models

    monkeypatch.setattr(models, "_BACKOFF_SECONDS", (0.0, 0.0, 0.0))
    fake = ThrottlingBedrock(busy=2)
    reply = await ModelClient(client=fake).ask(Task.PERCEIVE, Challenge, system="s", prompt="p")
    assert reply.model_id == OPUS.model_id
    assert fake.calls == [OPUS.model_id] * 3


async def test_a_model_that_stays_busy_falls_back_for_this_call_only(monkeypatch) -> None:
    from zeitzeuge_api.investigation import models

    monkeypatch.setattr(models, "_BACKOFF_SECONDS", (0.0, 0.0))
    fake = ThrottlingBedrock(busy=None)
    client = ModelClient(client=fake)
    reply = await client.ask(Task.PERCEIVE, Challenge, system="s", prompt="p")
    assert reply.model_id == OPUS_45.model_id
    # Busy is not refused: the next call asks Opus 4.6 again.
    assert OPUS.model_id not in client._refused


async def test_the_pacer_spaces_requests_evenly() -> None:
    import time

    from zeitzeuge_api.investigation.models import _Pacer

    pacer = _Pacer(per_minute=600)  # one every 0.1 s
    started = time.monotonic()
    for _ in range(4):
        await pacer.wait()
    assert time.monotonic() - started >= 0.29


async def test_a_dropped_connection_is_retried(monkeypatch) -> None:
    from botocore.exceptions import SSLError

    from zeitzeuge_api.investigation import models

    monkeypatch.setattr(models, "_BACKOFF_SECONDS", (0.0,))

    class Dropping(FakeBedrock):
        def converse(self, **kwargs: Any) -> dict[str, Any]:
            if not self.calls:
                self.calls.append(kwargs["modelId"])
                raise SSLError(endpoint_url="https://bedrock", error="UNEXPECTED_EOF_WHILE_READING")
            return super().converse(**kwargs)

    fake = Dropping(refuse=set())
    reply = await ModelClient(client=fake).ask(Task.PERCEIVE, Challenge, system="s", prompt="p")
    assert reply.model_id == OPUS.model_id
    assert fake.calls == [OPUS.model_id, OPUS.model_id]


async def test_a_connection_that_keeps_dropping_falls_back(monkeypatch) -> None:
    from botocore.exceptions import ConnectionClosedError

    from zeitzeuge_api.investigation import models

    monkeypatch.setattr(models, "_BACKOFF_SECONDS", (0.0,))

    class AlwaysDropping(FakeBedrock):
        def converse(self, **kwargs: Any) -> dict[str, Any]:
            if kwargs["modelId"] == OPUS.model_id:
                self.calls.append(kwargs["modelId"])
                raise ConnectionClosedError(endpoint_url="https://bedrock")
            return super().converse(**kwargs)

    fake = AlwaysDropping(refuse=set())
    reply = await ModelClient(client=fake).ask(Task.ADJUDICATE, Challenge, system="s", prompt="p")
    assert reply.model_id == OPUS_45.model_id
