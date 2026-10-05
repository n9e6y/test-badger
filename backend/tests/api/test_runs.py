from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from app.main import app

PLAN = {
    "summary": "s",
    "estimated_minutes": 3,
    "scenarios": [
        {
            "id": "R1",
            "title": "Valid signup",
            "kind": "happy_path",
            "start_url": "/signup",
            "steps_intent": ["a"],
            "test_data": [],
            "expected_result": "ok",
            "enabled": True,
        },
        {
            "id": "R3",
            "title": "Invalid email",
            "kind": "negative",
            "start_url": "/signup",
            "steps_intent": ["a"],
            "test_data": [],
            "expected_result": "error",
            "enabled": True,
        },
    ],
}


async def signup(client: AsyncClient, email: str = "a@example.com") -> None:
    r = await client.post(
        "/api/auth/signup", json={"name": "Ann", "email": email, "password": "Secret123!"}
    )
    assert r.status_code == 201


async def demo_id(client: AsyncClient) -> str:
    projects = (await client.get("/api/projects")).json()
    demo = [p for p in projects if p["is_demo"]]
    assert len(demo) == 1
    return str(demo[0]["id"])


async def start(client: AsyncClient, **body: Any) -> dict[str, Any]:
    r = await client.post(
        f"/api/projects/{await demo_id(client)}/runs", json={"test_type": "registration", **body}
    )
    assert r.status_code == 201, r.text
    return dict(r.json())


async def test_projects_require_login(client: AsyncClient) -> None:
    assert (await client.get("/api/projects")).status_code == 401


async def test_demo_project_visible_and_run_enqueued(client: AsyncClient) -> None:
    await signup(client)
    run = await start(client, goal_text="valid coupon WELCOME10")
    assert run["status"] == "QUEUED" and run["goal_text"] == "valid coupon WELCOME10"
    assert app.state.queue.jobs == [("plan_run", run["id"])]
    assert (await client.get(f"/api/runs/{run['id']}")).json()["project_name"].startswith("Pine")
    recent = (await client.get("/api/runs")).json()
    assert recent[0]["id"] == run["id"]


async def test_runs_are_private_even_on_shared_demo(client: AsyncClient) -> None:
    await signup(client, "owner@example.com")
    run = await start(client)
    client.cookies.clear()
    await signup(client, "other@example.com")
    assert (await client.get(f"/api/runs/{run['id']}")).status_code == 404
    assert (await client.get("/api/runs")).json() == []
    demo = (await client.get(f"/api/projects/{await demo_id(client)}")).json()
    assert demo["runs"] == []


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1:8000", "http://169.254.169.254/latest", "http://localhost"]
)
async def test_project_rejects_private_addresses(client: AsyncClient, url: str) -> None:
    await signup(client)
    r = await client.post("/api/projects", json={"name": "x", "base_url": url, "authorized": True})
    assert r.status_code == 400 and "private" in r.json()["detail"]


async def test_project_requires_authorization_checkbox(client: AsyncClient) -> None:
    await signup(client)
    r = await client.post(
        "/api/projects", json={"name": "x", "base_url": "https://example.com", "authorized": False}
    )
    assert r.status_code == 400 and "authorized" in r.json()["detail"]


async def _set_plan(run_id: str) -> None:
    from sqlalchemy import select

    from app.db import get_session
    from app.models import Run, Scenario

    override = app.dependency_overrides[get_session]
    async for session in override():
        run = await session.get(Run, run_id)
        assert run is not None
        run.plan_json, run.status = PLAN, "AWAITING_APPROVAL"
        for i, s in enumerate(PLAN["scenarios"]):  # type: ignore[arg-type]
            session.add(
                Scenario(
                    run_id=run_id,
                    code=s["id"],
                    title=s["title"],
                    kind=s["kind"],
                    order=i,
                    expected_result=s["expected_result"],
                )
            )
        await session.commit()
        assert (await session.scalars(select(Scenario))).all()


async def test_plan_toggle_and_approve(client: AsyncClient) -> None:
    await signup(client)
    run = await start(client)
    assert (await client.post(f"/api/runs/{run['id']}/approve")).status_code == 409
    await _set_plan(run["id"])
    r = await client.patch(
        f"/api/runs/{run['id']}/plan", json={"scenarios": [{"id": "R1", "enabled": False}]}
    )
    body = r.json()
    assert [s["enabled"] for s in body["plan"]["scenarios"]] == [False, True]
    assert [s["enabled"] for s in body["scenarios"]] == [False, True]
    r = await client.post(f"/api/runs/{run['id']}/approve")
    assert r.status_code == 200 and r.json()["status"] == "QUEUED"
    assert app.state.queue.jobs[-1] == ("execute_run", run["id"])
    late = await client.patch(
        f"/api/runs/{run['id']}/plan", json={"scenarios": [{"id": "R3", "enabled": False}]}
    )
    assert late.status_code == 409


async def test_cannot_approve_with_everything_off(client: AsyncClient) -> None:
    await signup(client)
    run = await start(client)
    await _set_plan(run["id"])
    await client.patch(
        f"/api/runs/{run['id']}/plan",
        json={"scenarios": [{"id": "R1", "enabled": False}, {"id": "R3", "enabled": False}]},
    )
    assert (await client.post(f"/api/runs/{run['id']}/approve")).status_code == 400


async def test_cancel_and_daily_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "runs_per_user_per_day", 2)
    await signup(client)
    run = await start(client)
    assert (await client.post(f"/api/runs/{run['id']}/cancel")).json()["status"] == "CANCELLED"
    await start(client)
    r = await client.post(
        f"/api/projects/{await demo_id(client)}/runs", json={"test_type": "registration"}
    )
    assert r.status_code == 429


async def test_credentials_are_encrypted_not_returned(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from cryptography.fernet import Fernet

    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "fernet_key", Fernet.generate_key().decode())
    await signup(client)
    run = await start(client, test_email="t@example.com", test_password="hunter2-secret")
    assert "hunter2" not in str(run)


async def test_activity_feed_lists_recent_steps(client: AsyncClient) -> None:
    from app.db import get_session
    from app.models import Scenario, Step

    await signup(client)
    run = await start(client)
    override = app.dependency_overrides[get_session]
    async for session in override():
        sc = Scenario(
            run_id=run["id"], code="R1", title="t", kind="happy_path", order=0, expected_result="e"
        )
        session.add(sc)
        await session.flush()
        session.add_all(
            [
                Step(
                    scenario_id=sc.id,
                    index=1,
                    action="navigate",
                    args_json={"url": "/signup"},
                    url="http://localhost:8100/signup",
                ),
                Step(
                    scenario_id=sc.id,
                    index=2,
                    action="click",
                    args_json={"ref": 3},
                    target_label="Create account",
                    url="http://localhost:8100/signup",
                ),
            ]
        )
        await session.commit()
    feed = (await client.get(f"/api/runs/{run['id']}/activity")).json()
    assert [f["description"] for f in feed] == ["Open /signup", 'Click "Create account"']
    assert feed[0]["scenario_code"] == "R1"
