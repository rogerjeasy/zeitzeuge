"""Model bindings fall back, visibly, when the first choice is refused."""

from __future__ import annotations

from typing import Any

from botocore.exceptions import ClientError

from zeitzeuge_api.investigation.contracts import Challenge
from zeitzeuge_api.investigation.models import HAIKU, OPUS, SONNET, ModelClient, Task


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
        assert reply.model_id == SONNET.model_id
        assert reply.same_family_fallback is False
    # the refusal is remembered: Opus is asked once, not on every call
    assert fake.calls == [OPUS.model_id, SONNET.model_id, SONNET.model_id]


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
    assert first.model_id == SONNET.model_id
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
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {"function": {"name": "answer", "arguments": '{"items": []}'}}
                            ]
                        }
                    }
                ],
                "usage": {"prompt_tokens": 100, "completion_tokens": 20},
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
    assert http.bodies[0]["tool_choice"]["function"]["name"] == "answer"
    assert http.bodies[0]["messages"][1]["content"][0]["image_url"]["url"].startswith("data:image/")


async def test_an_openai_failure_falls_back_and_says_so() -> None:
    fake = FakeBedrock(set())
    client = ModelClient(client=fake, openai_key="sk-test", http=FakeOpenAI(429))  # type: ignore[arg-type]
    reply = await client.ask(Task.CHALLENGE, Challenge, system="s", prompt="p")
    assert reply.model_id == HAIKU.model_id
    assert reply.same_family_fallback is True
