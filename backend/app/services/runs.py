"""Run state changes. Status changes go only through `set_status` (it also publishes)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.events import publish
from app.models import Run

logger = logging.getLogger(__name__)

STATUS_MESSAGES = {
    "QUEUED": "Waiting for a free tester…",
    "RECON": "Opening site…",
    "PLANNING": "Writing test plan…",
    "AWAITING_APPROVAL": "Test plan ready for review",
    "RUNNING": "Testing in the browser…",
    "TRIAGING": "Double-checking possible problems…",
    "REPORTING": "Writing the report…",
    "COMPLETED": "Report ready",
    "FAILED": "The run failed",
    "CANCELLED": "Run cancelled",
}
TERMINAL = {"COMPLETED", "FAILED", "CANCELLED"}
ACTIVE = {"QUEUED", "RECON", "PLANNING", "RUNNING", "TRIAGING", "REPORTING"}


async def set_status(
    session: AsyncSession, run: Run, status: str, message: str | None = None
) -> None:
    run.status = status
    now = datetime.now(UTC)
    if status == "RUNNING" and run.started_at is None:
        run.started_at = now
    if status in TERMINAL:
        run.finished_at = now
    if status == "FAILED" and message:
        run.error_message = message
    await session.commit()
    await publish(
        run.id,
        "run.status",
        {"status": status, "message": message or STATUS_MESSAGES.get(status, "")},
    )
    logger.info("run %s -> %s", run.id, status)
