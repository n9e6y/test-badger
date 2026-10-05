"""arq worker entry point. The worker owns the browser; the API only enqueues jobs.

Jobs `plan_run` and `execute_run` arrive on Day 2–3; `ping` lets us check the queue end to end.
"""

from __future__ import annotations

import logging
from typing import Any

from arq.connections import RedisSettings

from app.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()


async def ping(ctx: dict[str, Any]) -> str:
    logger.info("ping job received")
    return "pong"


class WorkerSettings:
    functions = [ping]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.max_concurrent_runs
    job_timeout = settings.run_wall_clock_s + 60
