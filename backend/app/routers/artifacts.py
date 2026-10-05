from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import Artifact, Run
from app.security import CurrentUser

router = APIRouter(tags=["artifacts"])


def _safe_path(stored: str, artifacts_dir: str) -> Path | None:
    """Only serve existing files inside the artifacts directory."""
    path, root = Path(stored).resolve(), Path(artifacts_dir).resolve()
    return path if root in path.parents and path.is_file() else None


@router.get("/artifacts/{artifact_id}")
async def get_artifact(
    artifact_id: str, user: CurrentUser, session: Annotated[AsyncSession, Depends(get_session)]
) -> FileResponse:
    art = await session.get(Artifact, artifact_id)
    run = await session.get(Run, art.run_id) if art else None
    if art is None or run is None or run.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screenshot not found.")
    path = await asyncio.to_thread(_safe_path, art.path, get_settings().artifacts_dir)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screenshot not found.")
    return FileResponse(
        path, media_type=art.mime, headers={"Cache-Control": "private, max-age=86400"}
    )
