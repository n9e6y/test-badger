from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.browser.tools import describe_action
from agent.orchestrator import public_site_url, to_public_url
from app.config import get_settings
from app.db import get_session
from app.models import Project, Run, Scenario, Step, User
from app.queue import JobQueue, get_queue
from app.routers.projects import run_summaries, visible_project
from app.schemas.runs import PlanPatch, RunIn, RunOut, RunSummary, ScenarioOut, StepOut
from app.security import CurrentUser, encrypt_secret
from app.services.runs import ACTIVE, STATUS_MESSAGES, set_status

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
        site_url=public_site_url(project), test_type=run.test_type, goal_text=run.goal_text,
        status=run.status, status_message=message or "", error_message=run.error_message,
        plan=run.plan_json, scenarios=[ScenarioOut.model_validate(s) for s in scenarios],
        report=run.report_json, cost_usd=round(run.cost_usd, 4), tokens_in=run.tokens_in,
        tokens_out=run.tokens_out, created_at=run.created_at, started_at=run.started_at,
        finished_at=run.finished_at,
    )  # fmt: skip


@router.post(
    "/projects/{project_id}/runs", response_model=RunOut, status_code=status.HTTP_201_CREATED
)
async def start_run(
    project_id: str, body: RunIn, user: CurrentUser, session: Session, queue: Queue
) -> RunOut:
    project = await visible_project(session, project_id, user.id)
    settings = get_settings()
    since = datetime.now(UTC) - timedelta(days=1)
    today = await session.scalar(
        select(func.count()).select_from(Run).where(Run.user_id == user.id, Run.created_at >= since)
    )
    if (today or 0) >= settings.runs_per_user_per_day:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've reached today's limit of {settings.runs_per_user_per_day} test runs. "
            f"Please try again tomorrow.",
        )
    creds = None
    if body.test_email or body.test_password:
        creds = encrypt_secret(
            json.dumps({"email": body.test_email or "", "password": body.test_password or ""})
        )
    run = Run(
        project_id=project.id,
        user_id=user.id,
        test_type=body.test_type,
        goal_text=(body.goal_text or "").strip() or None,
        credentials_enc=creds,
    )
    session.add(run)
    await session.commit()
    await queue.enqueue("plan_run", run.id)
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
