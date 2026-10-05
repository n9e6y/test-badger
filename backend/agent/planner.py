"""Stage 2 — Plan (03 §4): mandatory template scenarios adapted to the real site."""

from __future__ import annotations

import logging
import re
from urllib.parse import urlsplit

from agent.llm.client import LLMClient
from agent.models import Scenario, SiteRecon, TestDatum, TestPlan
from agent.prompts import load_prompt
from agent.templates.base import ScenarioTemplate, TestTemplate
from agent.templates.test_data import data_for_run, format_test_data

logger = logging.getLogger(__name__)
MAX_EXTRA = 2


def _template_block(template: TestTemplate) -> str:
    lines = [f"Test type: {template.title} — {template.description}", "Mandatory scenarios:"]
    for s in template.scenarios:
        deps = f" (depends on {', '.join(s.depends_on)})" if s.depends_on else ""
        lines.append(
            f"- {s.id} [{s.kind}] {s.title}{deps}\n  goal: {s.goal}\n"
            f"  steps: {' / '.join(s.steps_intent)}\n  expected: {s.expected_result}\n"
            f"  test data keys: {', '.join(s.test_data_keys) or '(none)'}"
        )
    if template.planner_notes:
        lines.append(f"Notes: {template.planner_notes}")
    return "\n".join(lines)


def _recon_block(recon: SiteRecon) -> str:
    pages = "\n".join(
        f"- {p.url} — {p.title}: {p.purpose} ({', '.join(p.key_elements)})" for p in recon.pages
    )
    entries = ", ".join(f"{e.name} -> {e.url}" for e in recon.entry_points)
    return (
        f"Site: {recon.site_summary}\nPages:\n{pages}\nEntry points: {entries}\n"
        f"Blockers: {'; '.join(recon.blockers) or 'none'}\n"
        f"Notes: {'; '.join(recon.notes) or 'none'}"
    )


def _to_path(url: str) -> str:
    parts = urlsplit(url)
    path = parts.path or "/"
    return path + (f"?{parts.query}" if parts.query else "")


def _fallback_scenario(t: ScenarioTemplate, recon: SiteRecon) -> Scenario:
    start = next(
        (e.url for e in recon.entry_points if e.name.lower() in t.title.lower() + t.area), "/"
    )
    return Scenario(
        id=t.id, title=t.title, kind=t.kind, start_url=_to_path(start),
        steps_intent=t.steps_intent, test_data=[], expected_result=t.expected_result,
    )  # fmt: skip


def normalize_plan(
    plan: TestPlan, template: TestTemplate, recon: SiteRecon, max_scenarios: int, has_goal: bool
) -> TestPlan:
    """Code enforces the plan contract: every mandatory scenario exactly once, in template order,
    at most 2 goal-driven extras, paths only, and the scenario cap."""
    by_id = {s.id: s for s in plan.scenarios}
    scenarios: list[Scenario] = []
    for t in template.scenarios:
        s = by_id.get(t.id)
        if s is None:
            logger.warning("planner dropped %s; adding it from the template", t.id)
            s = _fallback_scenario(t, recon)
        s.kind = t.kind
        scenarios.append(s)
    extra_re = re.compile(rf"^{re.escape(template.scenario_prefix)}\d+$")
    known = {t.id for t in template.scenarios}
    extras = [s for s in plan.scenarios if s.id not in known and extra_re.match(s.id)]
    if has_goal:
        scenarios += extras[:MAX_EXTRA]
    for s in scenarios:
        s.start_url = _to_path(s.start_url)
        s.enabled = True
    plan.scenarios = scenarios[:max_scenarios]
    plan.estimated_minutes = max(1, min(plan.estimated_minutes, len(plan.scenarios) * 2))
    return plan


async def make_plan(
    *,
    run_id: str,
    template: TestTemplate,
    recon: SiteRecon,
    goal_text: str | None,
    has_credentials: bool,
    llm: LLMClient,
    max_scenarios: int,
) -> TestPlan:
    data = data_for_run(run_id, template.test_data_keys)
    creds = (
        "A test account exists: use {{TEST_EMAIL}} / {{TEST_PASSWORD}} where a login is needed."
        if has_credentials
        else "No existing test account was provided."
    )
    user = (
        f"{_template_block(template)}\n\nRECON\n{_recon_block(recon)}\n\n"
        f"ALLOWED TEST DATA\n{format_test_data(data)}\n{creds}\n\n"
        f"OWNER'S GOAL: {goal_text or '(none)'}"
    )
    plan = await llm.structured("planner", load_prompt("planner"), user, TestPlan)
    return normalize_plan(plan, template, recon, max_scenarios, has_goal=bool(goal_text))


def scenario_data_text(scenario: Scenario) -> str:
    return "\n".join(f"- {d.key}: {d.value}" for d in scenario.test_data) or "(none)"


__all__ = ["TestDatum", "make_plan", "normalize_plan", "scenario_data_text"]
