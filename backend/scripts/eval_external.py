"""Evaluation against an external site (not our demo shop), via the public API.

    EVAL_EMAIL=... EVAL_PASSWORD=... python -m scripts.eval_external --app http://localhost \
        --site https://with-bugs.practicesoftwaretesting.com --plan registration,store --out eval/

Creates (or reuses) a project for --site, runs each test type with the given mode, approves the
plan as proposed, and saves run + report + scenario steps as JSON. Scoring is done by hand against
a fixed answer key, because external sites have no scenario → bug mapping. Uses the real LLM.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}


async def wait_for(
    c: httpx.AsyncClient, run_id: str, statuses: set[str], timeout_s: int
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        run = (await c.get(f"/api/runs/{run_id}")).json()
        if run["status"] in statuses | TERMINAL:
            return dict(run)
        await asyncio.sleep(5)
    raise TimeoutError(f"run {run_id} did not reach {statuses} in {timeout_s}s")


async def project_for(c: httpx.AsyncClient, site: str, name: str) -> str:
    for p in (await c.get("/api/projects")).json():
        if p["base_url"].rstrip("/") == site.rstrip("/"):
            return str(p["id"])
    r = await c.post("/api/projects", json={"name": name, "base_url": site, "authorized": True})
    r.raise_for_status()
    return str(r.json()["id"])


async def one_run(c: httpx.AsyncClient, project_id: str, test_type: str, args: Any) -> dict:
    body: dict[str, Any] = {"test_type": test_type, "mode": args.mode}
    if test_type == "store":
        if args.store_goal:
            body["goal_text"] = args.store_goal
        if args.test_email:
            body["test_email"], body["test_password"] = args.test_email, args.test_password
    t0 = time.monotonic()
    r = await c.post(f"/api/projects/{project_id}/runs", json=body)
    r.raise_for_status()
    run = await wait_for(c, r.json()["id"], {"AWAITING_APPROVAL"}, 600)
    t_plan = time.monotonic() - t0
    if run["status"] == "AWAITING_APPROVAL":
        await c.post(f"/api/runs/{run['id']}/approve")
        run = await wait_for(c, run["id"], set(), 2400)
    steps = {}
    for s in run["scenarios"]:
        if s["enabled"]:
            sr = await c.get(f"/api/runs/{run['id']}/scenarios/{s['id']}/steps")
            steps[s["code"]] = sr.json() if sr.status_code == 200 else []
    return {
        "site": args.site,
        "test_type": test_type,
        "mode": args.mode,
        "run_id": run["id"],
        "status": run["status"],
        "error": run.get("error_message"),
        "plan_s": round(t_plan),
        "total_s": round(time.monotonic() - t0),
        "cost_usd": run["cost_usd"],
        "tokens_in": run["tokens_in"],
        "tokens_out": run["tokens_out"],
        "scenarios": [
            (s["code"], s["title"], s["verdict"], s["reason"])
            for s in run["scenarios"]
            if s["enabled"]
        ],
        "findings": [
            (f["scenario_id"], f["severity"], f["title"])
            for f in (run.get("report") or {}).get("findings", [])
        ],
        "run": run,
        "steps": steps,
    }


async def main(args: argparse.Namespace) -> None:
    out = Path(args.out)
    await asyncio.to_thread(out.mkdir, parents=True, exist_ok=True)
    headers = {"Host": args.host_header} if args.host_header else {}
    async with httpx.AsyncClient(base_url=args.app.rstrip("/"), headers=headers, timeout=30) as c:
        r = await c.post(
            "/api/auth/login",
            json={"email": os.environ["EVAL_EMAIL"], "password": os.environ["EVAL_PASSWORD"]},
        )
        r.raise_for_status()
        project_id = await project_for(c, args.site, args.name)
        for n, test_type in enumerate(args.plan.split(","), 1):
            print(f"[{n}] {args.site} {test_type} ({args.mode}) …", flush=True)
            result = await one_run(c, project_id, test_type, args)
            path = out / f"{args.tag}-{n:02d}-{test_type}.json"
            await asyncio.to_thread(path.write_text, json.dumps(result, indent=2, default=str))
            print(
                f"    {result['status']} findings={len(result['findings'])} "
                f"{result['total_s']}s ${result['cost_usd']:.3f} run={result['run_id']}",
                flush=True,
            )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--app", required=True)
    p.add_argument("--host-header", default="", help="reach a local Caddy by its site name")
    p.add_argument("--site", required=True)
    p.add_argument("--name", default="External benchmark")
    p.add_argument("--plan", default="registration,store")
    p.add_argument("--mode", default="thorough", choices=["thorough", "quick"])
    p.add_argument("--store-goal", default="")
    p.add_argument("--test-email", default="")
    p.add_argument("--test-password", default="")
    p.add_argument("--tag", default=time.strftime("%m%d%H%M"))
    p.add_argument("--out", default="eval")
    asyncio.run(main(p.parse_args()))
