"""Dev only: run the full agent pipeline in memory (no DB/queue) against a site.

    python -m scripts.dev_run --type registration --only R3 --base-url http://localhost:8100

Uses the real LLM configured in the environment (keep --only small on free tiers).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import time
from pathlib import Path

from agent.context import MemoryContext
from agent.llm.client import LLMClient
from agent.pipeline import Target, execute_phase, plan_phase


async def main(base_url: str, test_type: str, only: list[str], goal: str | None) -> None:
    run_id = f"dev-{int(time.time())}"
    out = Path("artifacts") / "dev_run" / run_id
    ctx = MemoryContext(run_id=run_id, out_dir=out, verbose=True)
    llm = LLMClient(run_id=run_id)
    target = Target(base_url=base_url, allowed_origins=[base_url], exempt_origins=[base_url])

    print(f"== PLAN ({test_type}) ==")
    planned = await plan_phase(
        ctx=ctx, llm=llm, target=target, test_type=test_type, goal_text=goal, has_credentials=False
    )
    if planned.plan is None:
        print("BLOCKED at entry:", planned.blocked)
        return
    for s in planned.plan.scenarios:
        s.enabled = not only or s.id in only
        print(f"  {'[x]' if s.enabled else '[ ]'} {s.id} {s.title} @ {s.start_url}")
        if s.enabled:
            print(f"      data: {[(d.key, d.value) for d in s.test_data]}")

    print("\n== EXECUTE ==")

    async def load(artifact_id: str) -> bytes | None:
        return ctx.screenshots.get(artifact_id)

    report = await execute_phase(
        ctx=ctx,
        llm=llm,
        target=target,
        test_type=test_type,
        plan=planned.plan,
        secrets={},
        load_screenshot=load,
    )
    print("\n== REPORT ==")
    print(f"{report.overall_verdict.upper()}: {report.headline}")
    for sc in report.scenarios:
        print(f"  {sc.id:4} {sc.verdict:12} {sc.reason[:110]}")
    for f in report.findings + report.needs_review:
        print(f"\n  [{f.severity}] {f.title} ({f.confidence})\n    {f.owner_summary}")
        print(f"    expected: {f.expected}\n    actual:   {f.actual}")
        for r in f.repro_steps:
            print(f"      {r.order}. {r.action}")
    s = report.stats
    print(
        f"\n{s.llm_calls} LLM calls, {s.tokens_in}/{s.tokens_out} tokens, ${s.cost_usd}, "
        f"{s.duration_s}s. Screenshots: {out}"
    )
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(report.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    for noisy in ("httpx", "httpx2", "openai._base_client"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://localhost:8100")
    p.add_argument("--type", default="registration")
    p.add_argument("--only", default="", help="comma-separated scenario ids, e.g. R1,R3")
    p.add_argument("--goal", default=None)
    a = p.parse_args()
    only = [x.strip() for x in a.only.split(",") if x.strip()]
    asyncio.run(main(a.base_url.rstrip("/"), a.type, only, a.goal))
