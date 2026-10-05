from __future__ import annotations

from typing import Literal

import pytest
from pydantic import BaseModel

from agent.llm.client import LLMCallRecord, LLMClient, ToolDef, parse_role
from agent.llm.schema import strict_schema
from agent.llm.types import BudgetExceeded, LLMError, LLMOutputError, LLMUnavailable, ToolCall
from tests.agent.fake_llm import FakeLLM


class Inner(BaseModel):
    url: str
    note: str | None = None


class Plan(BaseModel):
    summary: str
    kind: Literal["happy_path", "negative"]
    pages: list[Inner]


class ClickArgs(BaseModel):
    ref: int


CLICK = ToolDef("click", "Click an element", ClickArgs)


def test_strict_schema_inlines_refs_and_requires_all() -> None:
    s = strict_schema(Plan)
    assert "$defs" not in str(s)
    assert s["additionalProperties"] is False and set(s["required"]) == {"summary", "kind", "pages"}
    item = s["properties"]["pages"]["items"]
    assert item["additionalProperties"] is False and set(item["required"]) == {"url", "note"}
    assert "title" not in s and "default" not in str(item)


def test_strict_schema_keeps_fields_named_like_keywords() -> None:
    class Page(BaseModel):
        title: str
        default: str
        examples: list[str]

    s = strict_schema(Page)
    assert set(s["properties"]) == {"title", "default", "examples"}
    assert set(s["required"]) == {"title", "default", "examples"}


def test_parse_role_keeps_colons_in_model() -> None:
    assert parse_role("openai_compat:qwen/qwen3.8-27b:free") == (
        "openai_compat",
        "qwen/qwen3.8-27b:free",
    )
    with pytest.raises(ValueError):
        parse_role("claude-sonnet")


async def test_structured_valid_first_try() -> None:
    fake = FakeLLM(
        {"planner": [{"summary": "s", "kind": "negative", "pages": [{"url": "/a", "note": None}]}]}
    )
    plan = await fake.client().structured("planner", "sys", "go", Plan)
    assert plan.pages[0].url == "/a"
    assert fake.requests["planner"][0].json_schema["name"] == "Plan"  # type: ignore[index]


async def test_structured_retries_once_with_error_then_succeeds() -> None:
    fake = FakeLLM(
        {
            "planner": [
                {"summary": "s", "kind": "WRONG", "pages": []},
                '```json\n{"summary": "s", "kind": "happy_path", "pages": []}\n```',
            ]
        }
    )
    plan = await fake.client().structured("planner", "sys", "go", Plan)
    assert plan.kind == "happy_path"
    assert "previous answer was invalid" in fake.requests["planner"][1].user_text
    assert "kind" in fake.requests["planner"][1].user_text


async def test_structured_fails_cleanly_after_two_bad_answers() -> None:
    fake = FakeLLM({"planner": ["not json", "still not json"]})
    with pytest.raises(LLMOutputError):
        await fake.client().structured("planner", "sys", "go", Plan)


async def test_choose_tool_validates_and_retries() -> None:
    fake = FakeLLM(
        {
            "executor": [
                "I think I should click",
                ToolCall(name="click", args={"ref": "x"}),
                ToolCall(name="click", args={"ref": 7}),
            ]
        }
    )
    client = fake.client()
    with pytest.raises(LLMOutputError):  # text only, then invalid args -> gives up after 1 retry
        await client.choose_tool("executor", "sys", "obs", [CLICK])
    call, args, _ = await client.choose_tool("executor", "sys", "obs", [CLICK])
    assert call.name == "click" and isinstance(args, ClickArgs) and args.ref == 7
    tool_spec = fake.requests["executor"][0].tools[0]
    assert tool_spec.parameters["additionalProperties"] is False


async def test_costs_recorded_and_budget_enforced() -> None:
    records: list[LLMCallRecord] = []

    async def recorder(r: LLMCallRecord) -> None:
        records.append(r)

    fake = FakeLLM({"executor": [ToolCall(name="click", args={"ref": 1})] * 5}, cost_per_call=0.4)
    client = fake.client(run_id="run-1", recorder=recorder, cost_cap_usd=1.0)
    for _ in range(3):
        await client.choose_tool("executor", "s", "o", [CLICK])
    assert client.totals.calls == 3 and client.totals.cost_usd == pytest.approx(1.2)
    with pytest.raises(BudgetExceeded):
        await client.choose_tool("executor", "s", "o", [CLICK])
    assert [r.stage for r in records] == ["executor"] * 3 and records[0].run_id == "run-1"
    assert records[0].tokens_in == 100 and records[0].ok


async def test_failed_call_is_recorded_as_not_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    import agent.llm.client as client_mod

    monkeypatch.setattr(client_mod, "RETRY_BACKOFF_S", (0.0, 0.0))
    records: list[LLMCallRecord] = []

    async def recorder(r: LLMCallRecord) -> None:
        records.append(r)

    fake = FakeLLM({"executor": [LLMUnavailable("down")] * 3})
    with pytest.raises(LLMUnavailable):
        await fake.client(recorder=recorder).call("executor", "s", "o")
    assert len(records) == 3 and not any(r.ok for r in records)  # first try + 2 backoff retries


async def test_unconfigured_provider_is_a_clear_error() -> None:
    client = LLMClient(providers={}, roles={"planner": "anthropic:claude-sonnet-5-5"})
    with pytest.raises(LLMError, match="not configured"):
        await client.call("planner", "s", "u")


async def test_fallback_model_then_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    import agent.llm.client as client_mod

    monkeypatch.setattr(client_mod, "RETRY_BACKOFF_S", (0.0, 0.0))

    class Flaky:
        name = "flaky"

        def __init__(self) -> None:
            self.calls: list[str] = []

        async def generate(self, req):  # type: ignore[no-untyped-def]
            from agent.llm.types import LLMResponse

            self.calls.append(req.model)
            if req.model == "primary" or len(self.calls) < 4:
                raise LLMUnavailable("429")
            return LLMResponse(text="ok", model=req.model)

    flaky = Flaky()
    client = LLMClient(
        providers={"p": flaky}, roles={"executor": "p:primary|p:backup"}, cost_cap_usd=1.0
    )
    resp = await client.call("executor", "s", "u")
    assert resp.model == "backup"
    assert flaky.calls == ["primary", "backup", "primary", "backup"]

    always_down = LLMClient(
        providers={"p": Flaky()}, roles={"executor": "p:primary"}, cost_cap_usd=1.0
    )
    with pytest.raises(LLMUnavailable):
        await always_down.call("executor", "s", "u")
