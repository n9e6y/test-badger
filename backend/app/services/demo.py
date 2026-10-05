"""The shared demo project (Pine & Pebble), visible to every user."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Project

DEMO_NAME = "Pine & Pebble (demo shop)"


async def ensure_demo_project(session: AsyncSession) -> Project:
    settings = get_settings()
    url = (settings.demo_shop_public_url or settings.demo_shop_url).rstrip("/")
    project = await session.scalar(select(Project).where(Project.is_demo.is_(True)))
    if project is None:
        project = Project(
            user_id=None,
            name=DEMO_NAME,
            base_url=url,
            allowed_origins=[url],
            authorized_confirmed=True,
            is_demo=True,
        )
        session.add(project)
    else:
        project.base_url, project.allowed_origins = url, [url]
    await session.commit()
    return project
