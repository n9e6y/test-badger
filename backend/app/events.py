"""Live run events over Redis pub/sub (04 §4.1). The worker publishes; the API's SSE endpoint
(Day 4) subscribes. Publishing never breaks a run: errors are logged and dropped."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from redis.asyncio import Redis
from redis.asyncio.client import PubSub

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


FINAL_EVENTS = {"run.completed", "run.failed"}
HEARTBEAT_S = 15.0


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


async def open_subscription(run_id: str) -> PubSub:
    pubsub = redis_client().pubsub()
    await pubsub.subscribe(channel(run_id))
    return pubsub


async def sse_stream(
    pubsub: PubSub,
    snapshot: dict[str, Any],
    *,
    done: bool,
    is_disconnected: Callable[[], Awaitable[bool]],
) -> AsyncIterator[str]:
    try:
        yield sse("snapshot", snapshot)
        while not done and not await is_disconnected():
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=HEARTBEAT_S)
            if msg is None:
                yield ": ping\n\n"  # keeps proxies and the browser connection alive
                continue
            data = json.loads(msg["data"])
            yield sse(data["event"], data["data"])
            status = data["data"].get("status") if data["event"] == "run.status" else None
            done = data["event"] in FINAL_EVENTS or status in ("COMPLETED", "FAILED", "CANCELLED")
    finally:
        await pubsub.unsubscribe()
        await pubsub.aclose()
