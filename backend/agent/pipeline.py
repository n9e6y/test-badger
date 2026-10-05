"""The two phases of a run, independent of the DB/queue (the orchestrator persists results).

plan phase:    recon -> plan                       (then the user approves)
execute phase: execute + triage each scenario -> report
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from agent.browser.session import BrowserSession
from agent.browser.tools import BrowserTools
from agent.context import RunContext
from agent.executor import execute_scenario
from agent.llm.client import LLMClient
from agent.models import Report, ScenarioResult, SiteRecon, TestPlan
from agent.planner import make_plan
from agent.recon import run_recon
from agent.reporter import build_report
from agent.templates import get_template
from agent.triage import LoadScreenshot, Triaged, triage_scenario
from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class Target:
    base_url: str
    allowed_origins: list[str]
    exempt_origins: list[str]  # private-network exemption (our demo shop only)


@dataclass
class PlanOutcome:
    recon: SiteRecon | None
    plan: TestPlan | None
    blocked: str | None = None


async def plan_phase(
    *, ctx: RunContext, llm: LLMClient, target: Target, test_type: str, goal_text: str | None,
    has_credentials: bool,
) -> PlanOutcome:  # fmt: skip
    settings = get_settings()
    template = get_template(test_type)
    async with BrowserSession(target.allowed_origins, target.exempt_origins) as session:
        tools = BrowserTools(session)
        outcome = await run_recon(
            base_url=target.base_url, template=template, goal_text=goal_text, session=session,
            tools=tools, llm=llm, ctx=ctx, max_pages=settings.max_recon_pages,
        )  # fmt: skip
    if outcome.recon is None:
        return PlanOutcome(None, None, blocked=outcome.blocked)
    await ctx.emit("run.status", {"status": "PLANNING", "message": "Writing test plan…"})
    plan = await make_plan(
        run_id=ctx.run_id, template=template, recon=outcome.recon, goal_text=goal_text,
        has_credentials=has_credentials, llm=llm, max_scenarios=settings.max_scenarios,
    )  # fmt: skip
    await ctx.emit("plan.ready", {"scenario_count": len(plan.scenarios)})
    return PlanOutcome(outcome.recon, plan)


async def execute_phase(
    *, ctx: RunContext, llm: LLMClient, target: Target, test_type: str, plan: TestPlan,
    secrets: dict[str, str], load_screenshot: LoadScreenshot,
) -> Report:  # fmt: skip
    settings = get_settings()
    template = get_template(test_type)
    started = time.monotonic()
    deadline = started + settings.run_wall_clock_s
    results: dict[str, ScenarioResult] = {}
    triaged: list[Triaged] = []
    limits: list[str] = []

    async with BrowserSession(target.allowed_origins, target.exempt_origins) as session:
        tools = BrowserTools(session, secrets=secrets)
        for scenario in [s for s in plan.scenarios if s.enabled]:
            t_scn = template.scenario(scenario.id)
            missing = [
                d
                for d in (t_scn.depends_on if t_scn else [])
                if not (results.get(d) and results[d].expected_met)
            ]
            if missing:
                result = ScenarioResult(
                    scenario_id=scenario.id,
                    finished="dependency",
                    notes=f"Skipped: depends on {', '.join(missing)}, which did not succeed",
                )
                await ctx.emit(
                    "scenario.started", {"scenario_id": scenario.id, "title": scenario.title}
                )
                await ctx.scenario_finished(result)
            else:
                result = await execute_scenario(
                    scenario=scenario, base_url=target.base_url,
                    clean_state=bool(t_scn and t_scn.clean_state), session=session, tools=tools,
                    llm=llm, ctx=ctx, max_steps=settings.max_steps_per_scenario,
                    deadline=deadline,
                )  # fmt: skip
            results[scenario.id] = result
            if result.finished in ("step_budget", "budget", "loop"):
                limits.append(f"{result.notes or result.finished} on {scenario.id}")
            if result.expected_met is False:
                await ctx.emit(
                    "finding.suspected", {"scenario_id": scenario.id, "title": scenario.title}
                )
            t = await triage_scenario(
                scenario=scenario, template_scenario=t_scn, result=result, llm=llm,
                load_screenshot=load_screenshot, finding_id=f"F{len(triaged) + 1}",
            )  # fmt: skip
            triaged.append(t)
            await ctx.emit(
                "scenario.finished",
                {"scenario_id": scenario.id, "verdict": t.verdict, "reason": t.reason[:200]},
            )
            await ctx.emit(
                "cost.updated",
                {
                    "cost_usd": round(llm.totals.cost_usd, 4),
                    "tokens_in": llm.totals.tokens_in,
                    "tokens_out": llm.totals.tokens_out,
                },
            )

    await ctx.emit("run.status", {"status": "REPORTING", "message": "Writing the report…"})
    return await build_report(
        run_id=ctx.run_id, site_url=target.base_url, test_type=test_type, triaged=triaged,
        duration_s=time.monotonic() - started, llm=llm, limits_hit=limits,
    )  # fmt: skip
