from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

TestType = Literal["registration", "store"]


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    base_url: HttpUrl
    authorized: bool = Field(description="I own this site or I'm authorized to test it")
    allowed_origins: list[str] | None = None


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    project_name: str = ""
    test_type: str
    status: str
    overall_verdict: str | None = None
    findings_count: int = 0
    cost_usd: float
    created_at: datetime


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    base_url: str
    allowed_origins: list[str]
    is_demo: bool
    created_at: datetime
    last_run: RunSummary | None = None


class ProjectDetail(ProjectOut):
    runs: list[RunSummary] = []


class RunIn(BaseModel):
    test_type: TestType
    goal_text: str | None = Field(default=None, max_length=2000)
    test_email: str | None = Field(default=None, max_length=320)
    test_password: str | None = Field(default=None, max_length=200)


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    title: str
    kind: str
    order: int
    expected_result: str
    enabled: bool
    verdict: str | None
    reason: str | None
    steps_taken: int
    duration_s: float


class RunOut(BaseModel):
    id: str
    project_id: str
    project_name: str
    site_url: str
    test_type: str
    goal_text: str | None
    status: str
    status_message: str
    error_message: str | None
    plan: dict[str, Any] | None
    scenarios: list[ScenarioOut]
    report: dict[str, Any] | None
    cost_usd: float
    tokens_in: int
    tokens_out: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ScenarioToggle(BaseModel):
    id: str = Field(description="scenario code, e.g. R3")
    enabled: bool


class PlanPatch(BaseModel):
    scenarios: list[ScenarioToggle]


class StepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    index: int
    action: str
    description: str = ""
    target_label: str | None
    reasoning: str | None
    result: str | None
    url: str | None
    screenshot_artifact_id: str | None
    console_json: list[Any]
    network_json: list[Any]
    created_at: datetime
