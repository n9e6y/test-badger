"""DEV ONLY: a rule-based stand-in for an LLM, so the full product (worker, DB, SSE, UI) can be
exercised without spending model quota. Enabled only when ENVIRONMENT=dev (see build_providers).

It reads the same observation text the real model gets and follows simple rules: dismiss
overlays, fill inputs from the scenario's test data, click the form's submit button, finish.
It is NOT the agent — never use it for evaluation numbers.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

from agent.llm.types import LLMRequest, LLMResponse, ToolCall

_ELEMENT = re.compile(r'^\s+\[(\d+)\] (\w+) "([^"]*)"(.*)$')
_SUBMIT = re.compile(r"create account|sign up|register|log ?in|submit|apply|continue", re.I)


class SimProvider:
    name = "sim"

    async def generate(self, req: LLMRequest) -> LLMResponse:
        await asyncio.sleep(float(os.environ.get("SIM_DELAY_S", "1.5")))  # feel like a model
        if req.tools:
            return LLMResponse(tool_calls=[self._act(req.user_text)], model="sim")
        schema = (req.json_schema or {}).get("name", "")
        return LLMResponse(
            text=json.dumps(self._structured(str(schema), req.user_text)), model="sim"
        )

    # ---------- executor ----------

    def _act(self, text: str) -> ToolCall:
        obs = text.split("OBSERVATION", 1)[-1]
        history = text.split("RECENT ACTIONS", 1)[-1].split("OBSERVATION", 1)[0]
        data = dict(re.findall(r"^- (\w+): (.+)$", text.split("Expected result")[0], re.M))
        if "OVERLAYS: (none)" not in obs and "Close the popup" not in history[-400:]:
            return ToolCall(name="dismiss_overlay", args={"reason": "Close the banner first"})
        submitted = (
            "Click" in history
            and history.strip().splitlines()[-1].startswith(tuple(str(i) for i in range(1, 30)))
            and '"Create account"' in history.strip().splitlines()[-1]
        )
        if submitted or len(history.splitlines()) > 12:
            page = obs.split("PAGE TEXT:", 1)[-1]
            met = ("Welcome" in page) == ("happy" in text.split("\n", 1)[0])
            return ToolCall(
                name="finish_scenario",
                args={"expected_met": met, "observed": page.strip()[:200], "notes": "simulated"},
            )
        for line in obs.splitlines():
            m = _ELEMENT.match(line)
            if not m or m.group(2) != "textbox" or 'value=""' not in m.group(4):
                continue
            label = m.group(3).lower()
            value = self._value_for(label, data)
            if value is not None:
                return ToolCall(
                    name="type_text",
                    args={
                        "reason": f"Fill {m.group(3)}",
                        "ref": int(m.group(1)),
                        "text": value,
                        "clear": True,
                    },
                )
        for line in obs.splitlines():
            m = _ELEMENT.match(line)
            if m and m.group(2) == "button" and _SUBMIT.search(m.group(3)):
                return ToolCall(
                    name="click", args={"reason": "Submit the form", "ref": int(m.group(1))}
                )
        return ToolCall(
            name="finish_scenario",
            args={"expected_met": False, "observed": "nothing to do", "notes": "simulated"},
        )

    @staticmethod
    def _value_for(label: str, data: dict[str, str]) -> str | None:
        def pick(*keys: str) -> str | None:
            return next((data[k] for k in data if any(x in k for x in keys)), None)

        if "name" in label:
            return pick("name")
        if "email" in label:
            return pick("invalid_email", "email")
        if "confirm" in label:
            return pick("mismatch", "confirm") or pick("password")
        if "password" in label:
            return pick("password")
        return None

    # ---------- structured stages ----------

    def _structured(self, schema: str, text: str) -> dict[str, Any]:
        if schema == "SiteRecon":
            return {
                "site_summary": "A small online store (simulated recon).",
                "pages": [],
                "entry_points": [
                    {"name": "signup", "url": "/signup"},
                    {"name": "cart", "url": "/cart"},
                ],
                "blockers": [],
                "notes": ["cookie banner present"],
            }
        if schema == "TestPlan":
            ids = re.findall(r"^- (\w+\d+) \[(\w+)\] (.+?)(?: \(depends|$)", text, re.M)
            return {
                "summary": "Simulated plan from the template.",
                "estimated_minutes": 3,
                "scenarios": [
                    {
                        "id": i,
                        "title": t,
                        "kind": k,
                        "start_url": "/signup",
                        "steps_intent": ["Fill the form", "Submit"],
                        "test_data": [
                            {"key": "valid_name", "value": "Anna Becker"},
                            {
                                "key": "invalid_email" if i == "R3" else "valid_email",
                                "value": "anna@" if i == "R3" else "sim@example.com",
                            },
                            {"key": "valid_password", "value": "Badger!sim00000Qx"},
                        ],
                        "expected_result": "As described in the template",
                        "enabled": True,
                    }
                    for i, k, t in ids
                ],
            }
        if schema == "TriageDecision":
            return {
                "verdict": "BUG_FOUND",
                "confidence": "medium",
                "reasoning": "Simulated verifier: expected result not met.",
                "is_agent_error": False,
                "finding": {
                    "area": "signup",
                    "severity": "major",
                    "title": "Simulated: expected result not met",
                    "expected": "See scenario",
                    "actual": "See screenshots",
                },
            }
        if schema == "ReportTexts":
            ids = re.findall(r"id=(F\d+)", text)
            return {
                "headline": "Simulated run finished",
                "summaries": [
                    {"finding_id": i, "owner_summary": "Simulated summary."} for i in ids
                ],
            }
        return {}
