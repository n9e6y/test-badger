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


def test_own_demo_shop_is_the_only_private_exemption(monkeypatch: pytest.MonkeyPatch) -> None:
    """D36: a user's project pointing at our demo shop may use its private address, nothing else."""
    from agent.orchestrator import own_shop_origins, target_for
    from app.config import get_settings
    from app.models import Project

    monkeypatch.setattr(get_settings(), "demo_shop_url", "http://shop:8100")
    monkeypatch.setattr(get_settings(), "demo_shop_public_url", "https://shop.example.test")
    assert own_shop_origins() == {"http://shop:8100", "https://shop.example.test"}
    shop = Project(
        base_url="https://shop.example.test", allowed_origins=["https://shop.example.test"]
    )
    assert target_for(shop).exempt_origins == ["https://shop.example.test"]
    other = Project(base_url="https://intranet.local", allowed_origins=["https://intranet.local"])
    assert target_for(other).exempt_origins == []


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

    monkeypatch.setattr(get_settings(), "judge_runs_per_day", 2)
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


async def _finish(run_id: str, report: dict[str, Any], plan: dict[str, Any] | None = None) -> None:
    from app.db import get_session
    from app.models import Run

    override = app.dependency_overrides[get_session]
    async for session in override():
        run = await session.get(Run, run_id)
        assert run is not None
        run.status, run.report_json = "COMPLETED", report
        if plan is not None:
            run.plan_json = plan
        await session.commit()


def _report(verdicts: dict[str, str], findings: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "scenarios": [{"id": k, "title": k, "verdict": v} for k, v in verdicts.items()],
        "findings": findings,
    }


async def test_rerun_needs_a_finished_run_with_a_plan(client: AsyncClient) -> None:
    await signup(client)
    run = await start(client)
    r = await client.post(f"/api/runs/{run['id']}/rerun")
    assert r.status_code == 409
    await _finish(run["id"], _report({}, []))  # blocked run: report but no plan
    assert (await client.post(f"/api/runs/{run['id']}/rerun")).status_code == 409


async def test_rerun_reuses_plan_skips_planning_and_compares(client: AsyncClient) -> None:
    from agent.templates.test_data import data_for_run

    await signup(client)
    parent = await start(client, goal_text="note")
    old_email = data_for_run(parent["id"], ["valid_email"])["valid_email"][0]
    plan = {**PLAN, "scenarios": [dict(s) for s in PLAN["scenarios"]]}  # type: ignore[union-attr]
    plan["scenarios"][0]["test_data"] = [{"key": "valid_email", "value": old_email}]
    plan["scenarios"][1]["enabled"] = False
    await _finish(
        parent["id"],
        _report({"R1": "BUG_FOUND"}, [{"scenario_id": "R1", "title": "Signup broken"}]),
        plan,
    )

    r = await client.post(f"/api/runs/{parent['id']}/rerun")
    assert r.status_code == 201, r.text
    child = r.json()
    assert child["parent_run_id"] == parent["id"] and child["goal_text"] == "note"
    assert app.state.queue.jobs[-1] == ("execute_run", child["id"])  # no plan_run
    assert [(s["code"], s["enabled"]) for s in child["scenarios"]] == [("R1", True), ("R3", False)]
    child_email = child["plan"]["scenarios"][0]["test_data"][0]["value"]
    assert child_email != old_email and child["id"].replace("-", "")[:8] in child_email
    assert child["comparison"] is None  # not finished yet

    await _finish(child["id"], _report({"R1": "PASSED"}, []))
    done = (await client.get(f"/api/runs/{child['id']}")).json()
    assert done["comparison"]["parent_run_id"] == parent["id"]
    assert done["comparison"]["counts"] == {"fixed": 1}
    assert done["comparison"]["items"][0]["bug_title"] == "Signup broken"
    recent = (await client.get("/api/runs")).json()
    assert recent[0]["parent_run_id"] == parent["id"]


async def test_rerun_of_someone_elses_run_is_not_found(client: AsyncClient) -> None:
    await signup(client, "owner@example.com")
    run = await start(client)
    await _finish(run["id"], _report({}, []), PLAN)
    client.cookies.clear()
    await signup(client, "other@example.com")
    assert (await client.post(f"/api/runs/{run['id']}/rerun")).status_code == 404


async def test_run_mode_is_stored_listed_and_kept_by_rerun(client: AsyncClient) -> None:
    await signup(client)
    assert (await start(client))["mode"] == "thorough"  # default = Hard
    run = await start(client, mode="quick")
    assert run["mode"] == "quick"
    assert (await client.get("/api/runs")).json()[0]["mode"] == "quick"
    await _finish(run["id"], _report({}, []), PLAN)
    child = (await client.post(f"/api/runs/{run['id']}/rerun")).json()
    assert child["mode"] == "quick"
    r = await client.post(
        f"/api/projects/{await demo_id(client)}/runs",
        json={"test_type": "registration", "mode": "turbo"},
    )
    assert r.status_code == 422


async def test_public_account_easy_only_with_its_own_limit(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """D25: anyone can sign up and run the flow, but only in Easy mode, with a small limit."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "runs_per_user_per_day", 1)
    r = await client.post(
        "/api/auth/signup",
        json={"name": "Pat", "email": "public@example.com", "password": "Secret123!"},
    )
    me = r.json()
    assert me["is_judge"] is False and me["modes"] == ["quick"]
    assert me["runs_per_day"] == 1 and me["runs_left_today"] == 1
    hard = await client.post(
        f"/api/projects/{await demo_id(client)}/runs", json={"test_type": "registration"}
    )
    assert hard.status_code == 403 and "Easy" in hard.json()["detail"]
    assert (await start(client, mode="quick"))["mode"] == "quick"
    assert (await client.get("/api/auth/me")).json()["runs_left_today"] == 0
    r = await client.post(
        f"/api/projects/{await demo_id(client)}/runs",
        json={"test_type": "registration", "mode": "quick"},
    )
    assert r.status_code == 429


async def test_public_runs_switched_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """D34: RUNS_PER_USER_PER_DAY=0 blocks public accounts with a clear message."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "runs_per_user_per_day", 0)
    await client.post(
        "/api/auth/signup",
        json={"name": "Pat", "email": "public0@example.com", "password": "Secret123!"},
    )
    assert (await client.get("/api/auth/me")).json()["runs_per_day"] == 0
    r = await client.post(
        f"/api/projects/{await demo_id(client)}/runs",
        json={"test_type": "registration", "mode": "quick"},
    )
    assert r.status_code == 403 and "reserved for the judges" in r.json()["detail"]


async def test_recorder_account_runs_on_public_key_while_public_runs_are_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """D35: a RECORDER_EMAILS account may run (any mode) on the public tier; others may not."""
    from app.config import get_settings
    from app.services.accounts import policy_for

    monkeypatch.setattr(get_settings(), "runs_per_user_per_day", 0)
    monkeypatch.setattr(get_settings(), "recorder_emails", "Rec@Example.com")
    policy = policy_for("rec@example.com")
    assert policy.key_tier == "public" and not policy.is_judge
    assert policy.modes == ("thorough", "quick") and policy.runs_per_day == 10
    assert policy_for("someone@example.com").runs_per_day == 0
    await client.post(
        "/api/auth/signup",
        json={"name": "Rec", "email": "rec@example.com", "password": "Secret123!"},
    )
    me = (await client.get("/api/auth/me")).json()
    assert me["is_judge"] is False and me["runs_per_day"] == 10
    assert (await start(client, mode="thorough"))["mode"] == "thorough"


async def test_judge_account_is_seeded_and_cannot_be_taken_over(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import get_settings
    from app.db import get_session
    from app.services.accounts import ensure_judge_account

    settings = get_settings()
    monkeypatch.setattr(settings, "judge_email", "judge@test-badger.example.com")
    monkeypatch.setattr(settings, "judge_password", "configured-pass-1")
    # someone signs up with the judge address before the API (re)starts
    r = await client.post(
        "/api/auth/signup",
        json={"name": "Mallory", "email": "judge@test-badger.example.com", "password": "mallory-1"},
    )
    assert r.status_code == 201
    client.cookies.clear()
    async for session in app.dependency_overrides[get_session]():
        await ensure_judge_account(session)
    bad = await client.post(
        "/api/auth/login",
        json={"email": "judge@test-badger.example.com", "password": "mallory-1"},
    )
    assert bad.status_code == 401
    ok = await client.post(
        "/api/auth/login",
        json={"email": "judge@test-badger.example.com", "password": "configured-pass-1"},
    )
    assert ok.status_code == 200
    assert ok.json()["is_judge"] is True and ok.json()["modes"] == ["thorough", "quick"]


async def _set_cost(run_id: str, cost: float, created_at: Any = None) -> None:
    from app.db import get_session
    from app.models import Run

    async for session in app.dependency_overrides[get_session]():
        run = await session.get(Run, run_id)
        assert run is not None
        run.cost_usd = cost
        if created_at is not None:
            run.created_at = created_at
        await session.commit()


async def test_all_public_accounts_share_one_budget(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """D26: every non-judge account spends from one pot; judge spend does not count."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "public_budget_usd", 0.40)
    await signup(client)  # a judge (see conftest)
    judge_run = await start(client)
    await _set_cost(judge_run["id"], 2.0)  # judge spending is a separate pot
    client.cookies.clear()

    r = await client.post(
        "/api/auth/signup",
        json={"name": "P1", "email": "p1@example.com", "password": "Secret123!"},
    )
    assert r.json()["budget_left_usd"] == 0.40
    first = await start(client, mode="quick")
    await _set_cost(first["id"], 0.30)
    client.cookies.clear()

    await client.post(
        "/api/auth/signup",
        json={"name": "P2", "email": "p2@example.com", "password": "Secret123!"},
    )
    me = (await client.get("/api/auth/me")).json()
    assert me["budget_left_usd"] == 0.10  # p1's run used the shared money
    r = await client.post(
        f"/api/projects/{await demo_id(client)}/runs",
        json={"test_type": "registration", "mode": "quick"},
    )
    assert r.status_code == 403 and "budget" in r.json()["detail"]


async def test_budget_start_ignores_older_runs(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import UTC, datetime

    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "public_budget_usd", 0.50)
    await client.post(
        "/api/auth/signup",
        json={"name": "Old", "email": "old@example.com", "password": "Secret123!"},
    )
    old = await start(client, mode="quick")
    await _set_cost(old["id"], 0.50, created_at=datetime(2026, 1, 1, tzinfo=UTC))
    assert (await client.get("/api/auth/me")).json()["budget_left_usd"] == 0.0
    monkeypatch.setattr(settings, "budget_start", "2026-06-01T00:00:00+00:00")
    assert (await client.get("/api/auth/me")).json()["budget_left_usd"] == 0.50
