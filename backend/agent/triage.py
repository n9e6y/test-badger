"""Stage 4 — Triage & verify (03 §6): raw scenario results -> trustworthy verdicts.

Fast paths need no LLM. Everything else goes to a separate, skeptical verifier call that sees
the step log, signals and the last screenshots. Repro steps and evidence are built by code.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from agent.llm.client import LLMClient
from agent.llm.types import BudgetExceeded, LLMError, OutOfCredits
from agent.models import (
    BlockedItem,
    Confidence,
    Evidence,
    Finding,
    ReproStep,
    Scenario,
    ScenarioResult,
    StepRecord,
    TriageDecision,
    Verdict,
)
from agent.prompts import load_prompt
from agent.templates.base import ScenarioTemplate

logger = logging.getLogger(__name__)
LoadScreenshot = Callable[[str], Awaitable[bytes | None]]

_NOISE_ACTIONS = {"wait", "scroll", "dismiss_overlay"}
UNBLOCK_ADVICE = [
    (re.compile(r"captcha|robot", re.I),
     "Disable CAPTCHA on your staging site, or allowlist our tester's IP address."),
    (re.compile(r"403|access denied|bot|challenge|forbidden|429|rate", re.I),
     "Add a firewall rule allowing our tester's user agent (test-badger) or IP on staging."),
    (re.compile(r"log ?in|sign ?in|credential|account required", re.I),
     "Add a test account in the run settings."),
    (re.compile(r"verif|email code|sms|otp", re.I),
     "Disable email/SMS verification on staging, or provide a pre-verified test account."),
]  # fmt: skip


@dataclass
class Triaged:
    scenario: Scenario
    result: ScenarioResult
    verdict: Verdict
    confidence: Confidence
    reason: str
    finding: Finding | None = None
    needs_review: bool = False
    blocked: BlockedItem | None = None


def serious_signals(steps: list[StepRecord]) -> list[str]:
    out = []
    for s in steps:
        out += [e for e in s.http_errors if re.search(r"→ 5\d\d", e)]
        out += [e for e in s.console_errors if e.startswith("Uncaught") or "Error" in e]
    return out


def unblock_advice(reason: str) -> str:
    return next(
        (advice for rx, advice in UNBLOCK_ADVICE if rx.search(reason)),
        "Make the page reachable for automated testing on your staging site.",
    )


def repro_steps(steps: list[StepRecord]) -> list[ReproStep]:
    useful = [s for s in steps if s.ok and s.action not in _NOISE_ACTIONS]
    return [ReproStep(order=i, action=s.description, url=s.url) for i, s in enumerate(useful, 1)]


def fingerprint(page_url: str, area: str, title: str) -> str:
    norm = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
    return f"{urlsplit(page_url).path or '/'}|{area}|{norm}"[:200]


def step_log(steps: list[StepRecord]) -> str:
    lines = []
    for s in steps:
        sig = ""
        if s.console_errors or s.http_errors:
            sig = f" [signals: {'; '.join(s.console_errors + s.http_errors)[:300]}]"
        lines.append(
            f"{s.index}. {s.description} → {'ok' if s.ok else 'FAILED'}: {s.result} "
            f"(url {s.url}){sig}"
        )
    return "\n".join(lines) or "(no steps)"


async def triage_scenario(
    *,
    scenario: Scenario,
    template_scenario: ScenarioTemplate | None,
    result: ScenarioResult,
    llm: LLMClient,
    load_screenshot: LoadScreenshot,
    finding_id: str,
    related: str = "",
) -> Triaged:
    signals = serious_signals(result.steps)

    # ---- fast paths (no LLM) ----
    if result.finished == "report_blocked":
        reason = result.blocked_reason or "the site blocked automated testing"
        return Triaged(
            scenario,
            result,
            "BLOCKED",
            "high",
            reason,
            blocked=BlockedItem(
                scenario_id=scenario.id, reason=reason, how_to_unblock=unblock_advice(reason)
            ),
        )
    if result.finished == "dependency":
        return Triaged(scenario, result, "INCONCLUSIVE", "high", result.notes)
    if result.finished == "finish_scenario" and result.expected_met and not signals:
        return Triaged(scenario, result, "PASSED", "high", result.observed[:300] or "As expected")
    if result.finished in ("step_budget", "loop", "error", "budget") and not signals:
        return Triaged(
            scenario,
            result,
            "INCONCLUSIVE",
            "medium",
            result.notes or "The tester could not finish this check",
        )

    # ---- verifier ----
    shots = [s.screenshot_id for s in result.steps if s.screenshot_id][-3:]
    images = [img for img in [await load_screenshot(i) for i in shots] if img]
    user = (
        f"SCENARIO {scenario.id}: {scenario.title}\nExpected result: {scenario.expected_result}\n"
        f"Severity hint from the test template: "
        f"{template_scenario.severity_hint if template_scenario else 'major'}\n\n"
        f"TESTER'S CONCLUSION: finished via {result.finished}; expected_met={result.expected_met}"
        f"\nObserved: {result.observed or '(none)'}\nNotes: {result.notes or '(none)'}\n\n"
        f"STEP LOG\n{step_log(result.steps)}\n\n"
        f"SERIOUS SIGNALS: {'; '.join(signals) or 'none'}\n"
        f"RELATED SCENARIOS (this one depends on them): {related or 'none'}\n"
        f"The {len(images)} attached screenshots are the last steps, in order."
    )
    try:
        decision = await llm.structured(
            "verifier", load_prompt("verifier"), user, TriageDecision, images=images
        )
    except BudgetExceeded:
        return Triaged(scenario, result, "INCONCLUSIVE", "low", "Not verified: cost cap reached")
    except OutOfCredits:
        raise  # D25: empty key ends the run with a clear message
    except LLMError as exc:
        logger.warning("verifier failed for %s: %s", scenario.id, exc)
        return Triaged(scenario, result, "INCONCLUSIVE", "low", "Not verified: verifier error")

    verdict, confidence = decision.verdict, decision.confidence
    if verdict == "BUG_FOUND" and (decision.is_agent_error or decision.finding is None):
        verdict, confidence = "INCONCLUSIVE", "low"  # our own mistake is never the site's bug
    triaged = Triaged(scenario, result, verdict, confidence, decision.reasoning[:500])
    if verdict == "BLOCKED":
        triaged.blocked = BlockedItem(
            scenario_id=scenario.id,
            reason=decision.reasoning[:200],
            how_to_unblock=unblock_advice(decision.reasoning),
        )
    if verdict == "BUG_FOUND" and decision.finding is not None:
        draft = decision.finding
        last_url = next((s.url for s in reversed(result.steps) if s.url), "")
        triaged.finding = Finding(
            id=finding_id,
            scenario_id=scenario.id,
            area=draft.area,
            severity=draft.severity,
            title=draft.title[:80],
            owner_summary="",
            expected=draft.expected,
            actual=draft.actual,
            repro_steps=repro_steps(result.steps),
            evidence=Evidence(
                screenshot_ids=shots,
                console_errors=sorted({e for s in result.steps for e in s.console_errors})[:10],
                failed_requests=sorted({e for s in result.steps for e in s.http_errors})[:10],
                page_url=last_url,
            ),
            confidence=confidence,
            confirmed=False,
            fingerprint=fingerprint(last_url, draft.area, draft.title),
        )
        triaged.needs_review = confidence == "low"
    return triaged
