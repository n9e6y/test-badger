"""Test-type template contract (03 §7). Flow knowledge lives only in template files."""

from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, Field

from agent.models import Area, Kind, Severity


class ScenarioTemplate(BaseModel):
    id: str
    title: str
    kind: Kind
    area: Area
    goal: str  # what the scenario checks, in the planner's words
    steps_intent: list[str]
    expected_result: str
    test_data_keys: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)  # e.g. R5/R6 depend on R1
    clean_state: bool = False  # start with a fresh browser context (no cookies/cart/login)
    severity_hint: Severity = "major"


class TestTemplate(BaseModel):
    __test__: ClassVar[bool] = False  # not a pytest test class

    key: str
    title: str
    description: str
    recon_keywords: list[str]
    scenario_prefix: str
    scenarios: list[ScenarioTemplate]
    test_data_keys: list[str]
    planner_notes: str = ""  # flow-specific guidance appended to the generic planner prompt

    def scenario(self, scenario_id: str) -> ScenarioTemplate | None:
        return next((s for s in self.scenarios if s.id == scenario_id), None)
