"""arq worker entry point. The worker owns the browser; the API only enqueues jobs.

Jobs: `plan_run` (recon + plan) and `execute_run` (execute + triage + report).
"""

from __future__ import annotations

import logging
from typing import Any

from arq.connections import RedisSettings
from sqlalchemy import select

from agent.orchestrator import execute_run as _execute_run
from agent.orchestrator import plan_run as _plan_run
from app.config import get_settings
from app.db import SessionLocal
from app.models import Run
from app.services.runs import set_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
for noisy in ("httpx", "httpx2", "openai._base_client"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
settings = get_settings()

# Statuses that mean "a worker was in the middle of this run".
IN_FLIGHT = ("RECON", "PLANNING", "RUNNING", "TRIAGING", "REPORTING")


async def ping(ctx: dict[str, Any]) -> str:
    return "pong"


async def plan_run(ctx: dict[str, Any], run_id: str) -> None:
    await _plan_run(run_id)


async def execute_run(ctx: dict[str, Any], run_id: str) -> None:
    await _execute_run(run_id)


async def on_startup(ctx: dict[str, Any]) -> None:
    """Runs a crashed worker was executing can never finish: fail them with a clear message."""
    async with SessionLocal() as s:
        orphans = (await s.scalars(select(Run).where(Run.status.in_(IN_FLIGHT)))).all()
        for run in orphans:
            await set_status(
                s, run, "FAILED", "The tester restarted during this run. Please start it again."
            )
    if orphans:
        logger.warning("marked %d interrupted runs as FAILED", len(orphans))


class WorkerSettings:
    functions = [ping, plan_run, execute_run]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.max_concurrent_runs
    job_timeout = settings.run_wall_clock_s + 180
    max_tries = 1  # never re-run a half-finished browser run automatically
