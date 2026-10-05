"""Live run events over Redis pub/sub (04 §4.1). The worker publishes; the API's SSE endpoint
(Day 4) subscribes. Publishing never breaks a run: errors are logged and dropped."""

from __future__ import annotations

import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.config import get_settings

logger = logging.getLogger(__name__)
_redis: Redis | None = None


def channel(run_id: str) -> str:
    return f"run:{run_id}:events"


def redis_client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def publish(run_id: str, event: str, payload: dict[str, Any]) -> None:
    try:
        await redis_client().publish(
            channel(run_id), json.dumps({"event": event, "data": payload}, default=str)
        )
    except Exception:  # noqa: BLE001 - live events are best effort
        logger.warning("could not publish %s for run %s", event, run_id, exc_info=True)
