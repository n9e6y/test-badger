"""Evaluation procedure (doc 05 §6) against a deployed ShipCheck + demo shop, via the public API.

    python -m scripts.eval_demo --app https://app.<ip>.sslip.io --shop https://shop.<ip>.sslip.io \
        --admin-token $SHOP_ADMIN_TOKEN --plan reg,reg,store,clean-reg --out eval/

Plan items: reg | store | clean-reg | clean-store ("clean" = all bugs switched off).
Every run is saved as JSON (run, report, timing) for the evaluation log. Uses the real LLM.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path
from typing import Any

import httpx

# Answer key (doc 05 §3): which planted bug each scenario is designed to catch.
BUG_FOR_SCENARIO = {
    "R2": "B4", "R3": "B1", "R4": "B2", "R5": "B3",
    "ST2": "B6", "ST3": "B5", "ST4": "B7", "ST5": "B8", "ST6": "B9",
}  # fmt: skip
BUGS_FOR_TYPE = {
    "registration": {"B1", "B2", "B3", "B4"},
    "store": {"B5", "B6", "B7", "B8", "B9"},
}
STORE_GOAL = "Valid coupon is WELCOME10, expired coupon is SUMMER24"
TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}


async def set_bugs(shop: str, token: str, on: bool) -> None:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{shop}/__admin",
            params={"token": token},
            data={"action": "all_bugs" if on else "clean"},
        )
        if r.status_code >= 400:  # the admin panel answers a successful POST with 303
            raise RuntimeError(f"shop admin returned {r.status_code}")


async def wait_for(
    c: httpx.AsyncClient, run_id: str, statuses: set[str], timeout_s: int
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        run = (await c.get(f"/api/runs/{run_id}")).json()
        if run["status"] in statuses | TERMINAL:
            return dict(run)
        await asyncio.sleep(3)
    raise TimeoutError(f"run {run_id} did not reach {statuses} in {timeout_s}s")


def score(test_type: str, report: dict[str, Any] | None, clean: bool) -> dict[str, Any]:
    found, false = set(), []
    for f in (report or {}).get("findings", []) + (report or {}).get("needs_review", []):
        bug = BUG_FOR_SCENARIO.get(f["scenario_id"])
        if not clean and bug in BUGS_FOR_TYPE[test_type]:
            found.add(bug)
        else:
            false.append(f"{f['scenario_id']}: {f['title']}")
    return {
        "bugs_found": sorted(found),
        "false_findings": false,
        "recall": None if clean else f"{len(found)}/{len(BUGS_FOR_TYPE[test_type])}",
    }


async def one_run(app: str, shop: str, token: str, item: str, email: str) -> dict[str, Any]:
    clean = item.startswith("clean-")
    test_type = "registration" if item.endswith("reg") else "store"
    await set_bugs(shop, token, on=not clean)
    async with httpx.AsyncClient(base_url=app, timeout=30) as c:
        r = await c.post("/api/auth/login", json={"email": email, "password": "Secret123!"})
        if r.status_code != 200:
            await c.post(
                "/api/auth/signup",
                json={"name": "Eval Bot", "email": email, "password": "Secret123!"},
            )
        demo = next(p for p in (await c.get("/api/projects")).json() if p["is_demo"])
        body: dict[str, Any] = {"test_type": test_type}
        if test_type == "store":
            body["goal_text"] = STORE_GOAL
        t0 = time.monotonic()
        run = (await c.post(f"/api/projects/{demo['id']}/runs", json=body)).json()
        run = await wait_for(c, run["id"], {"AWAITING_APPROVAL"}, 300)
        t_plan = time.monotonic() - t0
        if run["status"] == "AWAITING_APPROVAL":
            await c.post(f"/api/runs/{run['id']}/approve")
            run = await wait_for(c, run["id"], set(), 1500)
        t_total = time.monotonic() - t0
    return {
        "item": item,
        "test_type": test_type,
        "clean": clean,
        "run_id": run["id"],
        "status": run["status"],
        "error": run.get("error_message"),
        "plan_s": round(t_plan),
        "total_s": round(t_total),
        "scenarios": [
            (s["code"], s["verdict"], (s["reason"] or "")[:160])
            for s in run["scenarios"]
            if s["enabled"]
        ],
        "cost_usd": run["cost_usd"],
        "tokens_in": run["tokens_in"],
        "tokens_out": run["tokens_out"],
        **score(test_type, run.get("report"), clean),
        "report": run.get("report"),
    }


async def main(args: argparse.Namespace) -> None:
    out = Path(args.out)
    await asyncio.to_thread(out.mkdir, parents=True, exist_ok=True)
    for n, item in enumerate(args.plan.split(","), 1):
        email = f"eval{n % 2}+{args.tag}@example.com"  # two users: stay under the runs/day limit
        print(f"[{n}] {item} …", flush=True)
        result = await one_run(
            args.app.rstrip("/"), args.shop.rstrip("/"), args.admin_token, item, email
        )
        result["tag"] = args.tag
        path = out / f"{args.tag}-{n:02d}-{item}.json"
        await asyncio.to_thread(path.write_text, json.dumps(result, indent=2))
        print(
            f"    {result['status']} recall={result['recall']} "
            f"false={len(result['false_findings'])}"
            f" {result['total_s']}s ${result['cost_usd']:.3f}",
            flush=True,
        )
    await set_bugs(args.shop.rstrip("/"), args.admin_token, on=True)  # leave the demo in bug mode


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--app", required=True)
    p.add_argument("--shop", required=True)
    p.add_argument("--admin-token", required=True)
    p.add_argument("--plan", default="reg,reg,reg,store,store,store,clean-reg,clean-store")
    p.add_argument("--tag", default=time.strftime("%m%d%H%M"))
    p.add_argument("--out", default="eval")
    asyncio.run(main(p.parse_args()))
