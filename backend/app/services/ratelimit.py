"""In-memory rate limits for the auth endpoints (hardening before the repo goes public).

Per client IP only: a per-account lockout would let anyone lock the judge out. State lives in
the single API process and is lost on restart, which is fine for this purpose.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque


class SlidingWindow:
    """At most `limit` events per key within the last `window_s` seconds."""

    def __init__(self, limit: int, window_s: float) -> None:
        self.limit, self.window_s = limit, window_s
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        events = self._events[key]
        while events and now - events[0] > self.window_s:
            events.popleft()
        return events

    def full(self, key: str) -> bool:
        return len(self._prune(key, time.monotonic())) >= self.limit

    def add(self, key: str) -> None:
        self._prune(key, time.monotonic()).append(time.monotonic())

    def clear(self) -> None:
        self._events.clear()


failed_logins = SlidingWindow(limit=10, window_s=15 * 60)
signups = SlidingWindow(limit=10, window_s=60 * 60)


def reset_all() -> None:
    """For tests."""
    failed_logins.clear()
    signups.clear()
