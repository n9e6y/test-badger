"""FakeLLM: a scripted provider so agent tests are deterministic and free.

fake = FakeLLM({"planner": [{"summary": ...}], "executor": [ToolCall(...), ...]})
client = fake.client()
"""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from agent.llm.client import LLMClient
from agent.llm.types import LLMRequest, LLMResponse, ToolCall

Scripted = ToolCall | dict[str, Any] | str | Exception


class FakeLLM:
    name = "fake"

    def __init__(self, script: dict[str, list[Scripted]], cost_per_call: float = 0.01) -> None:
        self.script = {stage: list(items) for stage, items in script.items()}
        self.cost_per_call = cost_per_call
        self.requests: dict[str, list[LLMRequest]] = defaultdict(list)

    def client(self, **kwargs: Any) -> LLMClient:
        roles = {
            s: f"fake:{s}"
            for s in ("recon", "planner", "executor", "verifier", "reporter", "spike")
        }
        return LLMClient(providers={"fake": self}, roles=roles, **kwargs)

    async def generate(self, req: LLMRequest) -> LLMResponse:
        stage = req.model  # fake roles map stage -> model name
        self.requests[stage].append(req)
        if not self.script.get(stage):
            raise AssertionError(f"FakeLLM: no scripted response left for stage {stage!r}")
        item = self.script[stage].pop(0)
        if isinstance(item, Exception):
            raise item
        resp = LLMResponse(tokens_in=100, tokens_out=20, cost_usd=self.cost_per_call, model=stage)
        if isinstance(item, ToolCall):
            resp.tool_calls = [item]
        elif isinstance(item, dict):
            resp.text = json.dumps(item)
        else:
            resp.text = item
        return resp
