from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.browser.tools import describe_action
from agent.orchestrator import public_site_url, to_public_url
from agent.templates.test_data import refresh_plan_data
from app.db import get_session
from app.events import open_subscription, sse_stream
from app.models import Project, Run, Scenario, Step, User
from app.models.entities import new_id
from app.queue import JobQueue, get_queue
from app.routers.projects import run_summaries, visible_project
from app.schemas.runs import (
    ActivityOut,
    Comparison,
    PlanPatch,
    RunIn,
    RunOut,
    RunSummary,
    ScenarioOut,
    StepOut,
)
from app.security import CurrentUser, encrypt_secret
from app.services.accounts import budget_left, policy_for, run_estimate, runs_today
from app.services.compare import compare_reports
from app.services.runs import ACTIVE, STATUS_MESSAGES, TERMINAL, set_status

router = APIRouter(tags=["runs"])
Session = Annotated[AsyncSession, Depends(get_session)]
Queue = Annotated[JobQueue, Depends(get_queue)]


async def owned_run(session: AsyncSession, run_id: str, user: User) -> Run:
    run = await session.get(Run, run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found.")
    return run


async def run_out(session: AsyncSession, run: Run) -> RunOut:
    project = await session.get(Project, run.project_id)
    assert project is not None
    scenarios = (
        await session.scalars(select(Scenario).where(Scenario.run_id == run.id)
                              .order_by(Scenario.order))
    ).all()  # fmt: skip
    message = run.error_message if run.status == "FAILED" else STATUS_MESSAGES.get(run.status, "")
    return RunOut(
        id=run.id, project_id=run.project_id, project_name=project.name,
        site_url=public_site_url(project), test_type=run.test_type, mode=run.mode,
        goal_text=run.goal_text,
        status=run.status, status_message=message or "", error_message=run.error_message,
        plan=run.plan_json, scenarios=[ScenarioOut.model_validate(s) for s in scenarios],
        report=run.report_json, cost_usd=round(run.cost_usd, 4), tokens_in=run.tokens_in,
        tokens_out=run.tokens_out, created_at=run.created_at, started_at=run.started_at,
        finished_at=run.finished_at, parent_run_id=run.parent_run_id,
        comparison=await comparison_for(session, run),
    )  # fmt: skip


async def comparison_for(session: AsyncSession, run: Run) -> Comparison | None:
    """D21: a finished re-run is shown next to the run it re-ran."""
    if not (run.parent_run_id and run.report_json):
        return None
    parent = await session.get(Run, run.parent_run_id)
    if parent is None or parent.user_id != run.user_id or not parent.report_json:
        return None
    items = compare_reports(parent.report_json, run.report_json)
    counts: dict[str, int] = {}
    for item in items:
        counts[item.status] = counts.get(item.status, 0) + 1
    return Comparison(
        parent_run_id=parent.id, parent_created_at=parent.created_at, items=items, counts=counts
    )


async def check_run_allowed(session: AsyncSession, user: User, mode: str, test_type: str) -> None:
    """D25: the account's allowed modes and daily run limit; D26: the tier's money left."""
    policy = policy_for(user.email)
    if mode not in policy.modes:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Hard mode is only available to the judge account. Please choose Easy mode.",
        )
    if await runs_today(session, user.id) >= policy.runs_per_day:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've reached today's limit of {policy.runs_per_day} test runs. "
            f"Please try again tomorrow.",
        )
    left = await budget_left(session, policy.key_tier)
    if left is not None and left < run_estimate(mode, test_type):
        who = "the judge account" if policy.is_judge else "new accounts on this demo"
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"The AI testing budget for {who} is used up (${left:.2f} left, this test needs "
            f"about ${run_estimate(mode, test_type):.2f}). Please contact the test-badger team.",
        )


@router.post(
    "/projects/{project_id}/runs", response_model=RunOut, status_code=status.HTTP_201_CREATED
)
async def start_run(
    project_id: str, body: RunIn, user: CurrentUser, session: Session, queue: Queue
) -> RunOut:
    project = await visible_project(session, project_id, user.id)
    await check_run_allowed(session, user, body.mode, body.test_type)
    creds = None
    if body.test_email or body.test_password:
        creds = encrypt_secret(
            json.dumps({"email": body.test_email or "", "password": body.test_password or ""})
        )
    run = Run(
        project_id=project.id,
        user_id=user.id,
        test_type=body.test_type,
        mode=body.mode,
        goal_text=(body.goal_text or "").strip() or None,
        credentials_enc=creds,
    )
    session.add(run)
    await session.commit()
    await queue.enqueue("plan_run", run.id)
    return await run_out(session, run)


@router.post("/runs/{run_id}/rerun", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def rerun(run_id: str, user: CurrentUser, session: Session, queue: Queue) -> RunOut:
    """D21: run the same approved plan again (no recon, no planning) to check fixes."""
    parent = await owned_run(session, run_id, user)
    if parent.status != "COMPLETED" or not parent.plan_json:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only a finished run with a test plan can be re-run. Start a new run instead.",
        )
    await check_run_allowed(session, user, parent.mode, parent.test_type)
    child_id = new_id()
    plan = refresh_plan_data(parent.plan_json, parent.id, child_id)
    run = Run(
        id=child_id, project_id=parent.project_id, user_id=user.id,
        parent_run_id=parent.id, test_type=parent.test_type, mode=parent.mode,
        goal_text=parent.goal_text,
        credentials_enc=parent.credentials_enc, recon_json=parent.recon_json, plan_json=plan,
        approved_at=datetime.now(UTC),
    )  # fmt: skip
    session.add(run)
    for order, sc in enumerate(plan["scenarios"]):
        session.add(
            Scenario(
                run_id=child_id,
                code=sc["id"],
                title=sc["title"],
                kind=sc["kind"],
                order=order,
                expected_result=sc["expected_result"],
                enabled=sc.get("enabled", True),
            )  # fmt: skip
        )
    await session.commit()
    await queue.enqueue("execute_run", run.id)
    return await run_out(session, run)


@router.get("/runs", response_model=list[RunSummary])
async def recent_runs(user: CurrentUser, session: Session, limit: int = 10) -> list[RunSummary]:
    runs = (
        await session.scalars(select(Run).where(Run.user_id == user.id)
                              .order_by(Run.created_at.desc()).limit(min(limit, 50)))
    ).all()  # fmt: skip
    return await run_summaries(session, list(runs))


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(run_id: str, user: CurrentUser, session: Session) -> RunOut:
    return await run_out(session, await owned_run(session, run_id, user))


@router.patch("/runs/{run_id}/plan", response_model=RunOut)
async def patch_plan(run_id: str, body: PlanPatch, user: CurrentUser, session: Session) -> RunOut:
    run = await owned_run(session, run_id, user)
    if run.status != "AWAITING_APPROVAL" or run.plan_json is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The plan can only be changed before it is approved."
        )
    wanted = {t.id: t.enabled for t in body.scenarios}
    plan = dict(run.plan_json)
    plan["scenarios"] = [
        {**s, "enabled": wanted.get(s["id"], s.get("enabled", True))} for s in plan["scenarios"]
    ]
    run.plan_json = plan
    for row in (await session.scalars(select(Scenario).where(Scenario.run_id == run.id))).all():
        if row.code in wanted:
            row.enabled = wanted[row.code]
    await session.commit()
    return await run_out(session, run)


@router.post("/runs/{run_id}/approve", response_model=RunOut)
async def approve(run_id: str, user: CurrentUser, session: Session, queue: Queue) -> RunOut:
    run = await owned_run(session, run_id, user)
    if run.status != "AWAITING_APPROVAL" or run.plan_json is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This run is not waiting for approval.")
    if not any(s.get("enabled", True) for s in run.plan_json["scenarios"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Turn on at least one check.")
    run.approved_at = datetime.now(UTC)
    await set_status(session, run, "QUEUED", "Approved — waiting for a free tester…")
    await queue.enqueue("execute_run", run.id)
    return await run_out(session, run)


@router.post("/runs/{run_id}/cancel", response_model=RunOut)
async def cancel(run_id: str, user: CurrentUser, session: Session) -> RunOut:
    run = await owned_run(session, run_id, user)
    if run.status in ACTIVE or run.status == "AWAITING_APPROVAL":
        await set_status(session, run, "CANCELLED")
    return await run_out(session, run)


@router.get("/runs/{run_id}/scenarios/{scenario_id}/steps", response_model=list[StepOut])
async def scenario_steps(
    run_id: str, scenario_id: str, user: CurrentUser, session: Session
) -> list[StepOut]:
    run = await owned_run(session, run_id, user)
    scenario = await session.scalar(
        select(Scenario).where(
            Scenario.run_id == run.id, (Scenario.id == scenario_id) | (Scenario.code == scenario_id)
        )
    )
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scenario not found.")
    steps = (
        await session.scalars(
            select(Step).where(Step.scenario_id == scenario.id).order_by(Step.index)
        )
    ).all()
    project = await session.get(Project, run.project_id)
    assert project is not None
    out = []
    for s in steps:
        item = StepOut.model_validate(s)
        item.description = describe_action(s.action, s.args_json, s.target_label, s.url or "")
        item.url = to_public_url(project, s.url)
        out.append(item)
    return out


@router.get("/runs/{run_id}/activity", response_model=list[ActivityOut])
async def run_activity(
    run_id: str, user: CurrentUser, session: Session, limit: int = 40
) -> list[ActivityOut]:
    """Latest steps across all scenarios, oldest first — seeds the live feed after a reload."""
    run = await owned_run(session, run_id, user)
    project = await session.get(Project, run.project_id)
    assert project is not None
    rows = (await session.execute(
        select(Step, Scenario.code).join(Scenario, Step.scenario_id == Scenario.id)
        .where(Scenario.run_id == run.id)
        .order_by(Step.created_at.desc()).limit(min(limit, 100))
    )).all()  # fmt: skip
    out = []
    for step, code in reversed(rows):
        item = ActivityOut(**StepOut.model_validate(step).model_dump(), scenario_code=code)
        item.description = describe_action(
            step.action, step.args_json, step.target_label, step.url or ""
        )
        item.url = to_public_url(project, step.url)
        out.append(item)
    return out


@router.get("/runs/{run_id}/events")
async def run_events(
    run_id: str, request: Request, user: CurrentUser, session: Session
) -> StreamingResponse:
    """SSE: a `snapshot` event with the full current state, then live events (04 §4.1).
    We subscribe before reading the snapshot so no event can fall in between."""
    run = await owned_run(session, run_id, user)
    pubsub = await open_subscription(run.id)
    snapshot = (await run_out(session, run)).model_dump(mode="json")
    return StreamingResponse(
        sse_stream(
            pubsub,
            snapshot,
            done=snapshot["status"] in TERMINAL,
            is_disconnected=request.is_disconnected,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
