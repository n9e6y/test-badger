"""Job queue used by the API (arq on Redis). Overridable in tests."""

from __future__ import annotations

from typing import Protocol

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings
from fastapi import Request

from app.config import get_settings


class JobQueue(Protocol):
    async def enqueue(self, job: str, run_id: str) -> None: ...


class ArqQueue:
    def __init__(self) -> None:
        self._pool: ArqRedis | None = None

    async def enqueue(self, job: str, run_id: str) -> None:
        if self._pool is None:
            self._pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        # One job id per run+phase: a double click cannot start the same phase twice.
        await self._pool.enqueue_job(job, run_id, _job_id=f"{job}:{run_id}")

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.aclose()


def get_queue(request: Request) -> JobQueue:
    return request.app.state.queue  # type: ignore[no-any-return]
