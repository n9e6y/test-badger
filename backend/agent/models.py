"""Pydantic models for every agent stage's input/output (03 §3–6) and the Report (06 §5).

LLM-produced models (SiteRecon, TestPlan, TriageDecision, ReportTexts) are kept flat and
fully specified so they convert to strict JSON schemas for every provider.
"""

from __future__ import annotations

from datetime import datetime
from typing import ClassVar, Literal

from pydantic import BaseModel, Field

Kind = Literal["happy_path", "negative", "edge_case"]
Verdict = Literal["PASSED", "BUG_FOUND", "BLOCKED", "INCONCLUSIVE"]
Confidence = Literal["high", "medium", "low"]
Severity = Literal["critical", "major", "minor"]
Area = Literal["signup", "login", "catalog", "cart", "coupon", "stock", "checkout", "other"]
OverallVerdict = Literal["critical", "problems", "minor", "all_passed", "not_testable"]

# ---------- Stage 1: recon ----------


class PageInfo(BaseModel):
    url: str
    title: str
    purpose: str = Field(description='e.g. "signup form", "product page", "cart"')
    key_elements: list[str] = Field(description='e.g. "email input", "Add to cart button"')


class EntryPoint(BaseModel):
    name: str = Field(description='e.g. "signup", "cart", "checkout"')
    url: str


class SiteRecon(BaseModel):
    site_summary: str
    pages: list[PageInfo]
    entry_points: list[EntryPoint]
    blockers: list[str] = Field(description="anything that may block testing")
    notes: list[str] = Field(description='e.g. "cookie banner present"')


# ---------- Stage 2: plan ----------


class TestDatum(BaseModel):
    __test__: ClassVar[bool] = False  # not a pytest test class

    key: str
    value: str


class Scenario(BaseModel):
    id: str = Field(description='template id, e.g. "R3" or "ST4"')
    title: str
    kind: Kind
    start_url: str
    steps_intent: list[str] = Field(description="human-readable intentions, not selectors")
    test_data: list[TestDatum]
    expected_result: str = Field(description="what SHOULD happen, observable on screen")
    enabled: bool = True


class TestPlan(BaseModel):
    __test__: ClassVar[bool] = False  # not a pytest test class

    summary: str
    scenarios: list[Scenario]
    estimated_minutes: int


# ---------- Stage 3: execute ----------


class StepRecord(BaseModel):
    """One executed browser action, filled by code from the tool layer (never by the LLM)."""

    index: int
    action: str
    args: dict[str, object] = Field(default_factory=dict)  # secrets already masked
    description: str  # 'Type "SUMMER24" in "Coupon code"'
    target_label: str | None = None
    locator: dict[str, str] | None = None
    reasoning: str = ""
    ok: bool = True
    result: str = ""
    url: str = ""
    screenshot_id: str | None = None
    console_errors: list[str] = Field(default_factory=list)
    http_errors: list[str] = Field(default_factory=list)


class ScenarioResult(BaseModel):
    scenario_id: str
    finished: Literal[
        "finish_scenario", "report_blocked", "step_budget", "loop", "error", "dependency", "budget"
    ]
    expected_met: bool | None = None
    observed: str = ""
    notes: str = ""
    blocked_reason: str | None = None
    steps: list[StepRecord] = Field(default_factory=list)
    duration_s: float = 0.0


# ---------- Stage 4: triage ----------


class FindingDraft(BaseModel):
    """The verifier's description of a bug. Repro steps and evidence are added by code."""

    area: Area
    severity: Severity
    title: str = Field(description="short, max ~60 chars")
    expected: str
    actual: str


class TriageDecision(BaseModel):
    verdict: Verdict
    confidence: Confidence
    reasoning: str
    is_agent_error: bool = Field(description="did the tester itself do something wrong?")
    finding: FindingDraft | None = Field(description="only when verdict is BUG_FOUND")


# ---------- Report (06 §5) ----------


class Evidence(BaseModel):
    screenshot_ids: list[str]
    console_errors: list[str]
    failed_requests: list[str]
    page_url: str


class ReproStep(BaseModel):
    order: int
    action: str
    url: str


class Finding(BaseModel):
    id: str
    scenario_id: str
    area: Area
    severity: Severity
    title: str
    owner_summary: str
    expected: str
    actual: str
    repro_steps: list[ReproStep]
    evidence: Evidence
    confidence: Confidence
    confirmed: bool
    fingerprint: str


class ScenarioSummary(BaseModel):
    id: str
    title: str
    verdict: Verdict
    reason: str
    steps_taken: int
    duration_s: float


class BlockedItem(BaseModel):
    scenario_id: str
    reason: str
    how_to_unblock: str


class RunStats(BaseModel):
    duration_s: float
    llm_calls: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    limits_hit: list[str]


class Report(BaseModel):
    run_id: str
    site_url: str
    test_type: str
    created_at: datetime
    overall_verdict: OverallVerdict
    headline: str
    coverage_note: str | None
    counts: dict[str, int]
    findings: list[Finding]
    needs_review: list[Finding]
    scenarios: list[ScenarioSummary]
    blocked: list[BlockedItem]
    stats: RunStats


class OwnerSummary(BaseModel):
    finding_id: str
    owner_summary: str = Field(description="1-2 plain sentences on business impact")


class ReportTexts(BaseModel):
    """The only part of the report the writer LLM produces (06 §6)."""

    headline: str
    summaries: list[OwnerSummary]
