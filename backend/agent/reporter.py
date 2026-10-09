"""Stage 5 — Report (06): code computes every fact; the writer LLM only phrases texts."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from agent.llm.client import LLMClient
from agent.llm.types import LLMError
from agent.models import (
    BlockedItem,
    Finding,
    OverallVerdict,
    Report,
    ReportTexts,
    RunStats,
    ScenarioSummary,
)
from agent.prompts import load_prompt
from agent.triage import Triaged, unblock_advice

logger = logging.getLogger(__name__)
_SEVERITY_ORDER = {"critical": 0, "major": 1, "minor": 2}


def dedupe(findings: list[Finding]) -> list[Finding]:
    seen: dict[str, Finding] = {}
    for f in findings:
        if f.fingerprint not in seen:
            seen[f.fingerprint] = f
    return list(seen.values())


def overall_verdict(findings: list[Finding], triaged: list[Triaged]) -> OverallVerdict:
    if triaged and all(t.verdict == "BLOCKED" for t in triaged):
        return "not_testable"
    severities = {f.severity for f in findings}
    if "critical" in severities:
        return "critical"
    if "major" in severities:
        return "problems"
    if "minor" in severities:
        return "minor"
    if triaged and all(t.verdict == "PASSED" for t in triaged):
        return "all_passed"
    # No bugs, but not every check finished: never green (06 §2.1).
    return "incomplete" if triaged else "not_testable"


def default_headline(verdict: OverallVerdict, n_findings: int) -> str:
    return {
        "critical": "Not ready to release — critical problems found",
        "problems": f"{n_findings} problem{'s' if n_findings != 1 else ''} need fixing before "
                    f"release",
        "minor": "Minor issues found — safe to release with care",
        "all_passed": "All tested flows work",
        "incomplete": "No bugs found, but not every check could be completed",
        "not_testable": "We couldn't test this site — see how to unblock",
    }[verdict]  # fmt: skip


async def build_report(
    *,
    run_id: str,
    site_url: str,
    test_type: str,
    triaged: list[Triaged],
    duration_s: float,
    llm: LLMClient,
    limits_hit: list[str],
) -> Report:
    confirmed_or_sure = [t.finding for t in triaged if t.finding and not t.needs_review]
    review = [t.finding for t in triaged if t.finding and t.needs_review]
    findings = sorted(dedupe(confirmed_or_sure), key=lambda f: _SEVERITY_ORDER[f.severity])
    needs_review = dedupe(review)
    verdict = overall_verdict(findings, triaged)

    counts = {"passed": 0, "bug_found": 0, "blocked": 0, "inconclusive": 0}
    for t in triaged:
        counts[t.verdict.lower()] += 1
    incomplete = counts["blocked"] + counts["inconclusive"]
    coverage = (
        f"{incomplete} of {len(triaged)} checks could not be completed." if incomplete else None
    )

    headline = default_headline(verdict, len(findings))
    texts: dict[str, str] = {}
    if findings or needs_review:
        payload = "\n".join(
            f"- id={f.id} [{f.severity} · {f.area}] {f.title}\n  expected: {f.expected}\n"
            f"  actual: {f.actual}"
            for f in findings + needs_review
        )
        user = f"Verdict: {verdict}. Counts: {counts}.\nFINDINGS\n{payload}"
        try:
            out = await llm.structured("reporter", load_prompt("reporter"), user, ReportTexts)
            headline = out.headline.strip() or headline
            texts = {s.finding_id: s.owner_summary for s in out.summaries}
        except LLMError as exc:
            logger.warning("report writer failed (run=%s): %s; using defaults", run_id, exc)
    for f in findings + needs_review:
        f.owner_summary = texts.get(f.id) or f"{f.actual}. Expected: {f.expected}."

    totals = llm.totals
    return Report(
        run_id=run_id,
        site_url=site_url,
        test_type=test_type,
        created_at=datetime.now(UTC),
        overall_verdict=verdict,
        headline=headline,
        coverage_note=coverage,
        counts=counts,
        findings=findings,
        needs_review=needs_review,
        scenarios=[
            ScenarioSummary(
                id=t.scenario.id,
                title=t.scenario.title,
                verdict=t.verdict,
                reason=t.reason[:300],
                steps_taken=len(t.result.steps),
                duration_s=t.result.duration_s,
            )
            for t in triaged
        ],
        blocked=[t.blocked for t in triaged if t.blocked],
        stats=RunStats(
            duration_s=round(duration_s, 1),
            llm_calls=totals.calls,
            tokens_in=totals.tokens_in,
            tokens_out=totals.tokens_out,
            cost_usd=round(totals.cost_usd, 4),
            limits_hit=limits_hit,
        ),
    )


def blocked_report(
    *, run_id: str, site_url: str, test_type: str, reason: str, llm: LLMClient, duration_s: float
) -> Report:
    """The site blocked us at the very first page: a successful run with one Blocked result."""
    totals = llm.totals
    return Report(
        run_id=run_id,
        site_url=site_url,
        test_type=test_type,
        created_at=datetime.now(UTC),
        overall_verdict="not_testable",
        headline=default_headline("not_testable", 0),
        coverage_note="No checks could be completed.",
        counts={"passed": 0, "bug_found": 0, "blocked": 1, "inconclusive": 0},
        findings=[],
        needs_review=[],
        scenarios=[
            ScenarioSummary(
                id="ENTRY",
                title="Open the site",
                verdict="BLOCKED",
                reason=reason,
                steps_taken=1,
                duration_s=duration_s,
            )
        ],
        blocked=[
            BlockedItem(scenario_id="ENTRY", reason=reason, how_to_unblock=unblock_advice(reason))
        ],
        stats=RunStats(
            duration_s=round(duration_s, 1),
            llm_calls=totals.calls,
            tokens_in=totals.tokens_in,
            tokens_out=totals.tokens_out,
            cost_usd=round(totals.cost_usd, 4),
            limits_hit=[],
        ),
    )
