"""Agent stages with FakeLLM (deterministic, free) against local fixture pages."""

from __future__ import annotations

import time

from agent.browser.session import BrowserSession
from agent.browser.tools import BrowserTools
from agent.context import MemoryContext
from agent.executor import execute_scenario
from agent.llm.types import ToolCall
from agent.models import EntryPoint, Scenario, ScenarioResult, SiteRecon, StepRecord, TestPlan
from agent.planner import normalize_plan
from agent.reporter import build_report, overall_verdict
from agent.templates import get_template
from agent.triage import Triaged, triage_scenario
from tests.agent.fake_llm import FakeLLM

RECON = SiteRecon(
    site_summary="shop",
    pages=[],
    entry_points=[EntryPoint(name="signup", url="/signup")],
    blockers=[],
    notes=[],
)


def scenario(sid: str = "R2", start: str = "/form.html") -> Scenario:
    return Scenario(
        id=sid,
        title="t",
        kind="negative",
        start_url=start,
        steps_intent=["x"],
        test_data=[],
        expected_result="error shown",
    )


def tc(name: str, **args: object) -> ToolCall:
    return ToolCall(
        name=name, args={"reason": "because", **args} if name not in ("finish_scenario",) else args
    )


def test_normalize_plan_restores_mandatory_and_limits_extras() -> None:
    t = get_template("registration")
    plan = TestPlan(
        summary="s",
        estimated_minutes=60,
        scenarios=[
            scenario("R3", "https://shop.example/signup?x=1"),
            scenario("R9"),
            scenario("R10"),
            scenario("R11"),
            scenario("X1"),
        ],
    )
    out = normalize_plan(plan, t, RECON, max_scenarios=8, has_goal=True)
    ids = [s.id for s in out.scenarios]
    assert ids[:6] == ["R1", "R2", "R3", "R4", "R5", "R6"] and ids[6:] == ["R9", "R10"]
    assert out.scenarios[2].start_url == "/signup?x=1"
    assert out.scenarios[0].start_url == "/signup"  # fallback from recon entry point
    assert out.estimated_minutes <= 16
    no_goal = normalize_plan(plan, t, RECON, max_scenarios=8, has_goal=False)
    assert len(no_goal.scenarios) == 6


async def test_executor_records_steps_and_finishes(session: BrowserSession, site: str) -> None:
    fake = FakeLLM(
        {
            "executor": [
                tc("dismiss_overlay"),
                tc("click", ref=6),  # "Create account" button on form.html (see snapshot order)
                ToolCall(
                    name="finish_scenario",
                    args={"expected_met": True, "observed": "Name error shown", "notes": ""},
                ),
            ]
        }
    )
    ctx = MemoryContext(run_id="t1")
    result = await execute_scenario(
        scenario=scenario(),
        base_url=site,
        clean_state=True,
        session=session,
        tools=BrowserTools(session),
        llm=fake.client(),
        ctx=ctx,
        max_steps=10,
        deadline=time.monotonic() + 60,
    )
    assert result.finished == "finish_scenario" and result.expected_met is True
    assert [s.action for s in result.steps] == ["navigate", "dismiss_overlay", "click"]
    assert all(s.screenshot_id in ctx.screenshots for s in result.steps)
    assert result.steps[2].reasoning == "because"
    first_obs = fake.requests["executor"][0].user_text
    assert "SCENARIO R2" in first_obs and "OBSERVATION" in first_obs
    assert [e for e, _ in ctx.events].count("step") == 3


async def test_executor_loop_detector(session: BrowserSession, site: str) -> None:
    fake = FakeLLM({"executor": [tc("scroll", direction="down")] * 6})
    result = await execute_scenario(
        scenario=scenario(),
        base_url=site,
        clean_state=False,
        session=session,
        tools=BrowserTools(session),
        llm=fake.client(),
        ctx=MemoryContext(),
        max_steps=20,
        deadline=time.monotonic() + 60,
    )
    assert result.finished == "loop"
    assert "repeated the same action 3 times" in fake.requests["executor"][3].user_text


async def test_executor_step_budget(session: BrowserSession, site: str) -> None:
    fake = FakeLLM({"executor": [tc("scroll", direction="down"), tc("scroll", direction="up")]})
    result = await execute_scenario(
        scenario=scenario(),
        base_url=site,
        clean_state=False,
        session=session,
        tools=BrowserTools(session),
        llm=fake.client(),
        ctx=MemoryContext(),
        max_steps=3,
        deadline=time.monotonic() + 60,
    )
    assert result.finished == "step_budget" and len(result.steps) == 3


async def no_shots(_: str) -> bytes | None:
    return None


async def test_triage_fast_paths_need_no_llm() -> None:
    fake = FakeLLM({})
    ok = ScenarioResult(
        scenario_id="R1", finished="finish_scenario", expected_met=True, observed="Welcome page"
    )
    t = await triage_scenario(
        scenario=scenario("R1"),
        template_scenario=None,
        result=ok,
        llm=fake.client(),
        load_screenshot=no_shots,
        finding_id="F1",
    )
    assert t.verdict == "PASSED"
    blocked = ScenarioResult(
        scenario_id="R1", finished="report_blocked", blocked_reason="CAPTCHA on /partners/apply"
    )
    t = await triage_scenario(
        scenario=scenario("R1"),
        template_scenario=None,
        result=blocked,
        llm=fake.client(),
        load_screenshot=no_shots,
        finding_id="F1",
    )
    assert t.verdict == "BLOCKED" and t.blocked and "CAPTCHA" in t.blocked.how_to_unblock


async def test_triage_5xx_goes_to_verifier_even_if_executor_passed() -> None:
    step = StepRecord(
        index=1,
        action="click",
        description='Click "Create account"',
        http_errors=["POST /signup → 500"],
        url="http://s/signup",
    )
    res = ScenarioResult(
        scenario_id="R2", finished="finish_scenario", expected_met=True, steps=[step]
    )
    fake = FakeLLM(
        {
            "verifier": [
                {
                    "verdict": "BUG_FOUND",
                    "confidence": "high",
                    "reasoning": "500 on empty name",
                    "is_agent_error": False,
                    "finding": {
                        "area": "signup",
                        "severity": "critical",
                        "title": "Empty name crashes",
                        "expected": "Name is required",
                        "actual": "Internal Server Error",
                    },
                }
            ]
        }
    )
    t = await triage_scenario(
        scenario=scenario(),
        template_scenario=None,
        result=res,
        llm=fake.client(),
        load_screenshot=no_shots,
        finding_id="F1",
    )
    assert t.verdict == "BUG_FOUND" and t.finding is not None
    assert t.finding.evidence.failed_requests == ["POST /signup → 500"]
    assert [r.action for r in t.finding.repro_steps] == ['Click "Create account"']
    assert t.finding.fingerprint == "/signup|signup|empty name crashes"


async def test_agent_error_is_never_a_site_bug() -> None:
    res = ScenarioResult(scenario_id="R3", finished="finish_scenario", expected_met=False)
    fake = FakeLLM(
        {
            "verifier": [
                {
                    "verdict": "BUG_FOUND",
                    "confidence": "high",
                    "reasoning": "typed wrong field",
                    "is_agent_error": True,
                    "finding": {
                        "area": "signup",
                        "severity": "major",
                        "title": "x",
                        "expected": "e",
                        "actual": "a",
                    },
                }
            ]
        }
    )
    t = await triage_scenario(
        scenario=scenario("R3"),
        template_scenario=None,
        result=res,
        llm=fake.client(),
        load_screenshot=no_shots,
        finding_id="F1",
    )
    assert t.verdict == "INCONCLUSIVE" and t.finding is None


async def test_report_counts_verdict_and_writer_fallback() -> None:
    res = ScenarioResult(scenario_id="R1", finished="finish_scenario", expected_met=True)
    triaged = [
        Triaged(scenario("R1"), res, "PASSED", "high", "ok"),
        Triaged(scenario("R2"), res, "INCONCLUSIVE", "medium", "lost"),
    ]
    assert overall_verdict([], triaged) == "all_passed"
    report = await build_report(
        run_id="r",
        site_url="http://s",
        test_type="registration",
        triaged=triaged,
        duration_s=10,
        llm=FakeLLM({}).client(),
        limits_hit=[],
    )
    assert report.headline == "All tested flows work"
    assert report.coverage_note == "1 of 2 checks could not be completed."
    assert report.counts == {"passed": 1, "bug_found": 0, "blocked": 0, "inconclusive": 1}


async def test_executor_sees_errors_caused_by_last_action(
    session: BrowserSession, site: str
) -> None:
    probe = BrowserTools(session)
    await probe.run("navigate", {"url": f"{site}/form.html"})
    await probe.run("dismiss_overlay", {})
    broken = (await session.snapshot()).find("Broken")
    assert broken is not None
    fake = FakeLLM(
        {
            "executor": [
                tc("dismiss_overlay"),
                tc("click", ref=broken.ref),
                ToolCall(
                    name="finish_scenario",
                    args={"expected_met": False, "observed": "JS error", "notes": ""},
                ),
            ]
        }
    )
    await execute_scenario(
        scenario=scenario(),
        base_url=site,
        clean_state=True,
        session=session,
        tools=BrowserTools(session),
        llm=fake.client(),
        ctx=MemoryContext(),
        max_steps=10,
        deadline=time.monotonic() + 60,
    )
    after_click = fake.requests["executor"][2].user_text
    assert "console error: Uncaught ReferenceError: undefinedFn is not defined" in after_click
