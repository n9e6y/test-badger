"""Stage 3 — Execute (03 §5): the step loop for one scenario.

The LLM decides one action per step; code validates it, runs it through the guarded tool
layer, records evidence (screenshot, URL, console/network signals) and enforces budgets.
"""

from __future__ import annotations

import logging
import time
from typing import Literal

from pydantic import BaseModel, Field

from agent.browser.session import BrowserSession
from agent.browser.snapshot import format_snapshot
from agent.browser.tools import BrowserTools, describe_action
from agent.context import RunContext
from agent.llm.client import LLMClient, ToolDef
from agent.llm.types import BudgetExceeded, LLMError
from agent.models import Scenario, ScenarioResult, StepRecord
from agent.planner import scenario_data_text
from agent.prompts import load_prompt

logger = logging.getLogger(__name__)

HISTORY_SIZE = 6
LOOP_WARN = 3
LOOP_STOP = 4

# ---------- tool argument models (every tool carries a one-line reason for the live feed) ----

Reason = Field(description="One short sentence: why this action now")


class NavigateArgs(BaseModel):
    reason: str = Reason
    url: str = Field(description="URL or path on this site, e.g. /cart")


class RefArgs(BaseModel):
    reason: str = Reason
    ref: int = Field(description="Element ref from the latest observation, e.g. 7 for [7]")


class TypeArgs(BaseModel):
    reason: str = Reason
    ref: int = Field(description="Ref of the input field")
    text: str = Field(description="Exact text to type (use {{TEST_PASSWORD}} for secrets)")
    clear: bool = Field(description="Clear the field first (normally true)")


class SelectArgs(BaseModel):
    reason: str = Reason
    ref: int
    value: str = Field(description="Visible option text")


class CheckArgs(BaseModel):
    reason: str = Reason
    ref: int
    checked: bool


class KeyArgs(BaseModel):
    reason: str = Reason
    key: Literal["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Backspace", "Space"]


class ScrollArgs(BaseModel):
    reason: str = Reason
    direction: Literal["up", "down"]


class WaitArgs(BaseModel):
    reason: str = Reason
    seconds: float = Field(description="Seconds to wait, at most 5")
    for_text: str | None = Field(description="Wait until this text is visible, or null")


class ReasonOnly(BaseModel):
    reason: str = Reason


class FinishArgs(BaseModel):
    expected_met: bool = Field(description="Did the expected result happen?")
    observed: str = Field(description="What you observed, factually (quote messages/totals)")
    notes: str = Field(description="Anything else relevant, or empty")


class BlockedArgs(BaseModel):
    reason: str = Field(description="What blocks testing, e.g. 'CAPTCHA on /partners/apply'")


EXECUTOR_TOOLS = [
    ToolDef("navigate", "Open a URL or path on this site.", NavigateArgs),
    ToolDef("click", "Click an element by ref.", RefArgs),
    ToolDef("type_text", "Type text into an input (clears it first when clear=true).", TypeArgs),
    ToolDef("select_option", "Choose an option in a select box.", SelectArgs),
    ToolDef("check", "Check or uncheck a checkbox or radio button.", CheckArgs),
    ToolDef("press_key", "Press a keyboard key.", KeyArgs),
    ToolDef("scroll", "Scroll the page.", ScrollArgs),
    ToolDef("wait", "Wait a few seconds or until a text appears.", WaitArgs),
    ToolDef("dismiss_overlay", "Close a cookie banner, popup or modal.", ReasonOnly),
    ToolDef("finish_scenario", "End the scenario with your conclusion.", FinishArgs),
    ToolDef("report_blocked", "End the scenario: the site blocks testing.", BlockedArgs),
]


class LoopDetector:
    def __init__(self) -> None:
        self.last: tuple[str, str] | None = None
        self.count = 0

    def see(self, action: str, args: dict[str, object]) -> int:
        key = (action, repr(sorted((k, v) for k, v in args.items() if k != "reason")))
        self.count = self.count + 1 if key == self.last else 1
        self.last = key
        return self.count


def _history_text(steps: list[StepRecord]) -> str:
    if not steps:
        return "(no actions yet)"
    older = len(steps) - HISTORY_SIZE
    lines = [f"({older} earlier actions not shown)"] if older > 0 else []
    for s in steps[-HISTORY_SIZE:]:
        lines.append(f"{s.index}. {s.description} → {'ok' if s.ok else 'FAILED'}: {s.result}")
    return "\n".join(lines)


def _signals_line(step: StepRecord) -> str:
    """What the browser reported after the last action (console errors, failed requests)."""
    parts = [f"console error: {e}" for e in step.console_errors[:3]]
    parts += [f"failed request: {e}" for e in step.http_errors[:3]]
    return "; ".join(parts) if parts else "no console errors or failed requests"


def _scenario_text(s: Scenario) -> str:
    steps = "\n".join(f"  {i}. {x}" for i, x in enumerate(s.steps_intent, 1))
    return (
        f"SCENARIO {s.id}: {s.title} ({s.kind})\nStart page: {s.start_url}\n"
        f"Intended steps:\n{steps}\nTest data:\n{scenario_data_text(s)}\n"
        f"Expected result: {s.expected_result}"
    )


async def execute_scenario(
    *,
    scenario: Scenario,
    base_url: str,
    clean_state: bool,
    session: BrowserSession,
    tools: BrowserTools,
    llm: LLMClient,
    ctx: RunContext,
    max_steps: int,
    deadline: float,
) -> ScenarioResult:
    started = time.monotonic()
    steps: list[StepRecord] = []
    result = ScenarioResult(scenario_id=scenario.id, finished="step_budget")
    await ctx.emit("scenario.started", {"scenario_id": scenario.id, "title": scenario.title})

    if clean_state:
        await session.reset_context()

    async def record(action: str, args: dict[str, object], reasoning: str) -> StepRecord:
        clean_args = {k: v for k, v in args.items() if k != "reason"}
        tool_result = await tools.run(action, clean_args)
        signals = session.drain_signals()
        shot = await ctx.save_screenshot(await _jpeg(session))
        step = StepRecord(
            index=len(steps) + 1,
            action=action,
            args=tool_result.logged_args,
            description=describe_action(
                action, tool_result.logged_args, tool_result.target_label, tool_result.url
            ),
            target_label=tool_result.target_label,
            locator=tool_result.locator,
            reasoning=reasoning,
            ok=tool_result.ok,
            result=tool_result.message,
            url=tool_result.url,
            screenshot_id=shot,
            console_errors=signals.console_errors,
            http_errors=signals.http_errors,
        )
        steps.append(step)
        await ctx.save_step(scenario.id, step)
        await ctx.emit("step", {
            "scenario_id": scenario.id, "index": step.index, "action": action,
            "description": step.description, "reasoning": reasoning, "ok": step.ok,
            "url": step.url, "screenshot_id": shot,
        })  # fmt: skip
        for kind, items in (
            ("console_error", step.console_errors),
            ("http_error", step.http_errors),
        ):
            for text in items:
                await ctx.emit("signal", {"scenario_id": scenario.id, "kind": kind, "text": text})
        return step

    start = scenario.start_url if "://" in scenario.start_url else base_url + scenario.start_url
    await record("navigate", {"url": start}, "Open the scenario's start page")

    loop = LoopDetector()
    warning = ""
    system = load_prompt("executor")
    while len(steps) < max_steps:
        if await ctx.is_cancelled():
            result.finished, result.notes = "budget", "run cancelled"
            break
        if time.monotonic() > deadline:
            result.finished, result.notes = "budget", "run time limit reached"
            break
        snap = await session.snapshot()
        if blocker := session.blocker(snap):
            result.finished, result.blocked_reason = "report_blocked", blocker
            break
        signals_line = _signals_line(steps[-1]) if steps else ""
        observation = format_snapshot(snap, signals_line)
        images: list[bytes] = []
        if len(snap.elements) < 3 or (len(steps) >= 2 and not steps[-1].ok and not steps[-2].ok):
            images = [await _jpeg(session)]  # vision fallback (03 §5.1)
        user = (
            f"{_scenario_text(scenario)}\n\nRECENT ACTIONS\n{_history_text(steps)}\n\n"
            f"{warning}OBSERVATION (step {len(steps) + 1} of max {max_steps})\n{observation}"
        )
        try:
            call, args_model, text = await llm.choose_tool(
                "executor", system, user, EXECUTOR_TOOLS, images=images
            )
        except BudgetExceeded:
            result.finished, result.notes = "budget", "LLM cost cap reached"
            break
        except LLMError as exc:
            result.finished, result.notes = "error", f"agent error: {exc}"
            break
        args = args_model.model_dump()
        if call.name == "finish_scenario":
            result.finished = "finish_scenario"
            result.expected_met = bool(args["expected_met"])
            result.observed, result.notes = str(args["observed"]), str(args["notes"])
            break
        if call.name == "report_blocked":
            result.finished, result.blocked_reason = "report_blocked", str(args["reason"])
            break
        repeats = loop.see(call.name, args)
        if repeats >= LOOP_STOP:
            result.finished, result.notes = "loop", "the same action was repeated 4 times"
            break
        warning = (
            "WARNING: you repeated the same action 3 times and it is not working. "
            "Try another approach or finish the scenario.\n\n"
            if repeats >= LOOP_WARN
            else ""
        )
        await record(call.name, args, str(args.get("reason") or text))
    else:
        result.notes = f"step budget of {max_steps} reached"

    result.steps = steps
    result.duration_s = round(time.monotonic() - started, 1)
    await ctx.scenario_finished(result)
    logger.info(
        "scenario %s finished=%s met=%s steps=%d run=%s",
        scenario.id,
        result.finished,
        result.expected_met,
        len(steps),
        ctx.run_id,
    )
    return result


async def _jpeg(session: BrowserSession) -> bytes:
    return await session.page.screenshot(
        type="jpeg",
        quality=60,
        mask=[session.page.locator("input[type=password]")],
        mask_color="#9ca3af",
    )
