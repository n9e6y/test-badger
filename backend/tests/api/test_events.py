from __future__ import annotations

import asyncio
import json

import fakeredis
import pytest
from httpx import AsyncClient

from app import events
from tests.api.test_runs import signup, start


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> fakeredis.aioredis.FakeRedis:
    r = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(events, "_redis", r)
    return r


def parse(body: str) -> list[tuple[str, dict]]:  # type: ignore[type-arg]
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if not line.startswith(":"))
        if "event" in lines:
            out.append((lines["event"], json.loads(lines["data"])))
    return out


async def test_sse_sends_snapshot_then_live_events_until_completed(client: AsyncClient) -> None:
    await signup(client)
    run = await start(client)

    async def worker() -> None:
        await asyncio.sleep(0.3)  # after the endpoint has subscribed
        await events.publish(run["id"], "step", {"scenario_id": "R1", "index": 1})
        await events.publish(run["id"], "run.status", {"status": "RUNNING", "message": "x"})
        await events.publish(run["id"], "run.completed", {"overall_verdict": "problems"})

    task = asyncio.create_task(worker())
    r = await client.get(f"/api/runs/{run['id']}/events")
    await task
    assert r.headers["content-type"].startswith("text/event-stream")
    got = parse(r.text)
    assert [e for e, _ in got] == ["snapshot", "step", "run.status", "run.completed"]
    assert got[0][1]["id"] == run["id"] and got[0][1]["status"] == "QUEUED"


async def test_sse_finished_run_sends_only_snapshot(client: AsyncClient) -> None:
    await signup(client)
    run = await start(client)
    await client.post(f"/api/runs/{run['id']}/cancel")
    r = await client.get(f"/api/runs/{run['id']}/events")
    assert [e for e, _ in parse(r.text)] == ["snapshot"]


async def test_sse_is_owner_only(client: AsyncClient) -> None:
    await signup(client, "one@example.com")
    run = await start(client)
    client.cookies.clear()
    await signup(client, "two@example.com")
    assert (await client.get(f"/api/runs/{run['id']}/events")).status_code == 404
