"""Spike: a real LLM looks at a real page snapshot and picks one browser action.

Proves the API key, the provider adapter, tool calling, and cost tracking end to end.

    python -m scripts.spike_llm --base-url http://localhost:8100
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from pydantic import BaseModel, Field

from agent.browser.session import BrowserSession
from agent.browser.snapshot import format_snapshot
from agent.browser.tools import BrowserTools
from agent.llm.client import LLMClient, ToolDef

SYSTEM = (
    "You are a careful QA tester operating a web browser through tools. "
    "Each turn you get the current page as text. Use element refs like [3] from it. "
    "Call exactly one tool per turn. Briefly say why before calling it."
)
GOAL = "Goal: start testing the signup form with an INVALID email address 'anna@'."


class ClickArgs(BaseModel):
    ref: int = Field(description="Element ref from the observation, e.g. 7 for [7]")


class TypeArgs(BaseModel):
    ref: int = Field(description="Ref of the input field")
    text: str = Field(description="Text to type")


TOOLS = [
    ToolDef("click", "Click an element by ref.", ClickArgs),
    ToolDef("type_text", "Clear an input and type text into it.", TypeArgs),
]


async def main(base_url: str) -> None:
    llm = LLMClient(run_id="spike")
    async with BrowserSession([base_url], exempt_origins=[base_url]) as session:
        tools = BrowserTools(session)
        await tools.run("navigate", {"url": f"{base_url}/signup"})
        await tools.run("dismiss_overlay", {})
        snap = await session.snapshot()
        observation = format_snapshot(snap, session.drain_signals().summary())
        print(observation, "\n")
        call, args, reasoning = await llm.choose_tool(
            "spike", SYSTEM, f"{GOAL}\n\nOBSERVATION:\n{observation}", TOOLS
        )
        print(f"LLM reasoning: {reasoning or '(none)'}")
        print(f"LLM action:    {call.name} {args.model_dump()}")
        result = await tools.run(call.name, args.model_dump())
        print(f"Tool result:   {result.message}")
    t = llm.totals
    print(
        f"\nLLM calls: {t.calls}  tokens in/out: {t.tokens_in}/{t.tokens_out}  "
        f"cost: ${t.cost_usd:.4f}"
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8100")
    asyncio.run(main(parser.parse_args().base_url.rstrip("/")))
