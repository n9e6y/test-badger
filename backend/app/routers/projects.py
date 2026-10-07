from __future__ import annotations

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.browser.guards import GuardError, NetworkGuard, derive_allowed_origins, origin_of
from agent.orchestrator import public_site_url
from app.config import get_settings
from app.db import get_session
from app.models import Finding, Project, Run
from app.schemas.runs import ProjectDetail, ProjectIn, ProjectOut, RunSummary
from app.security import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def visible_project(session: AsyncSession, project_id: str, user_id: str) -> Project:
    project = await session.get(Project, project_id)
    if project is None or not (project.is_demo or project.user_id == user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found.")
    return project


async def run_summaries(session: AsyncSession, runs: list[Run]) -> list[RunSummary]:
    if not runs:
        return []
    ids = [r.id for r in runs]
    counts = dict(
        (
            await session.execute(
                select(Finding.run_id, func.count())
                .where(Finding.run_id.in_(ids))
                .group_by(Finding.run_id)
            )
        ).all()  # fmt: skip
    )
    names = dict(
        (
            await session.execute(
                select(Project.id, Project.name).where(Project.id.in_({r.project_id for r in runs}))
            )
        ).all()  # fmt: skip
    )
    return [
        RunSummary(
            id=r.id,
            project_id=r.project_id,
            project_name=names.get(r.project_id, ""),
            test_type=r.test_type,
            status=r.status,
            overall_verdict=(r.report_json or {}).get("overall_verdict"),
            findings_count=counts.get(r.id, 0),
            cost_usd=round(r.cost_usd, 4),
            created_at=r.created_at,
            parent_run_id=r.parent_run_id,
        )  # fmt: skip
        for r in runs
    ]


def project_out(project: Project, last_run: RunSummary | None = None) -> ProjectOut:
    out = ProjectOut.model_validate(project)
    out.base_url = public_site_url(project)
    out.last_run = last_run
    return out


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: CurrentUser, session: Session) -> list[ProjectOut]:
    projects = (
        await session.scalars(
            select(Project)
            .where(or_(Project.user_id == user.id, Project.is_demo.is_(True)))
            .order_by(Project.is_demo.desc(), Project.created_at.desc())
        )
    ).all()
    result = []
    for p in projects:
        last = await session.scalar(
            select(Run).where(Run.project_id == p.id, Run.user_id == user.id)
            .order_by(Run.created_at.desc()).limit(1)
        )  # fmt: skip
        summary = (await run_summaries(session, [last]))[0] if last else None
        result.append(project_out(p, summary))
    return result


async def _check_reachable(url: str) -> None:
    try:
        await NetworkGuard(exempt_origins=[]).check(url)
    except GuardError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This address points to a private or internal network. Use a public URL.",
        ) from exc
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            await client.get(url, headers={"User-Agent": get_settings().tester_user_agent_suffix})
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "We couldn't reach this site. Check the URL and that the site is online.",
        ) from exc


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectIn, user: CurrentUser, session: Session) -> ProjectOut:
    if not body.authorized:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Please confirm you are authorized to test this site."
        )
    url = str(body.base_url).rstrip("/")
    await _check_reachable(url)
    origins = derive_allowed_origins(url)
    if body.allowed_origins:
        origins = sorted({origin_of(o) for o in body.allowed_origins} | {origin_of(url)})
    project = Project(
        user_id=user.id,
        name=body.name.strip(),
        base_url=url,
        allowed_origins=origins,
        authorized_confirmed=True,
    )
    session.add(project)
    await session.commit()
    return project_out(project)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: str, user: CurrentUser, session: Session) -> ProjectDetail:
    project = await visible_project(session, project_id, user.id)
    runs = (
        await session.scalars(
            select(Run).where(Run.project_id == project.id, Run.user_id == user.id)
            .order_by(Run.created_at.desc()).limit(50)
        )
    ).all()  # fmt: skip
    detail = ProjectDetail(**project_out(project).model_dump())
    detail.runs = await run_summaries(session, list(runs))
    return detail
