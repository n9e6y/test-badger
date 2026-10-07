"""Playwright browser session: one context per run, guarded network, signal collection.

Only the worker creates sessions (invariant 7: the API never launches a browser).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import Any, Self

from playwright.async_api import (
    Browser,
    BrowserContext,
    ConsoleMessage,
    Error,
    Page,
    Playwright,
    Request,
    Response,
    Route,
    async_playwright,
)

from agent.browser.guards import NetworkGuard, detect_blocker, is_allowed_origin
from agent.browser.snapshot import SNAPSHOT_JS, PageSnapshot, parse_snapshot
from app.config import get_settings

logger = logging.getLogger(__name__)

VIEWPORT = {"width": 1280, "height": 800}
_TRACKED_TYPES = {"document", "xhr", "fetch"}


@dataclass
class Signals:
    """Automatically collected evidence (03 §5.4). Drained once per step."""

    console_errors: list[str] = field(default_factory=list)
    http_errors: list[str] = field(default_factory=list)
    blocked_requests: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"console errors: {len(self.console_errors)}, failed requests: {len(self.http_errors)}"
            + (f", blocked requests: {len(self.blocked_requests)}" if self.blocked_requests else "")
        )

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "console_errors": self.console_errors,
            "http_errors": self.http_errors,
            "blocked_requests": self.blocked_requests,
        }


@dataclass
class RecordedVideo:
    """One WebM per browser context (D22). Times are time.monotonic() values."""

    path: Path
    started: float
    ended: float


class BrowserSession:
    def __init__(
        self,
        allowed_origins: list[str],
        exempt_origins: list[str] | None = None,
        video_dir: Path | None = None,
    ) -> None:
        self.allowed_origins = allowed_origins
        self.network = NetworkGuard(exempt_origins or [])
        self.settings = get_settings()
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._signals = Signals()
        self.last_status: int | None = None
        self.last_snapshot: PageSnapshot | None = None
        self._user_agent: str | None = None
        self.video_dir = video_dir  # None = no recording (recon, tests)
        self.videos: list[RecordedVideo] = []
        self._video_started = 0.0

    # ---------- lifecycle ----------

    async def __aenter__(self) -> Self:
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=self.settings.browser_headless)
        await self.reset_context()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.close()

    async def close(self) -> None:
        await self._close_context()
        if self._browser is not None:
            try:
                await self._browser.close()
            except Error:
                logger.warning("browser close failed", exc_info=True)
        if self._pw is not None:
            await self._pw.stop()
        self._context = self._browser = self._pw = self._page = None

    async def reset_context(self) -> None:
        """Fresh cookies/storage (scenarios that need a clean state)."""
        assert self._browser is not None
        await self._close_context()
        ua = await self._default_user_agent()
        video: dict[str, Any] = {}
        if self.video_dir is not None:
            await asyncio.to_thread(self.video_dir.mkdir, parents=True, exist_ok=True)
            video = {
                "record_video_dir": str(self.video_dir),
                "record_video_size": {
                    "width": self.settings.video_width,
                    "height": self.settings.video_height,
                },
            }
        self._context = await self._browser.new_context(
            viewport=VIEWPORT,
            user_agent=f"{ua} {self.settings.tester_user_agent_suffix}",
            locale="en-US",
            service_workers="block",  # SW requests would bypass routing
            **video,
        )
        self._context.set_default_timeout(self.settings.browser_action_timeout_ms)
        self._context.set_default_navigation_timeout(self.settings.browser_nav_timeout_ms)
        await self._context.route("**/*", self._guard_route)
        self._page = await self._context.new_page()
        self._video_started = time.monotonic()
        self._attach_listeners(self._page)
        self._context.on("page", self._on_popup)
        self._signals = Signals()
        self.last_status = None
        self.last_snapshot = None

    async def _close_context(self) -> None:
        """Close the current context; its video file is complete only after this."""
        if self._context is None:
            return
        video_path: str | None = None
        if self.video_dir is not None and self._page is not None and self._page.video:
            try:
                video_path = await self._page.video.path()
            except Error:
                logger.warning("video path unavailable", exc_info=True)
        try:
            await self._context.close()
        except Error:
            logger.warning("context close failed", exc_info=True)
        if video_path and await asyncio.to_thread(Path(video_path).is_file):
            self.videos.append(
                RecordedVideo(Path(video_path), self._video_started, time.monotonic())
            )
        self._context = None
        self._page = None

    async def _default_user_agent(self) -> str:
        if self._user_agent is None:
            assert self._browser is not None
            probe = await self._browser.new_page()
            ua = await probe.evaluate("navigator.userAgent")
            await probe.close()
            self._user_agent = str(ua).replace("HeadlessChrome", "Chrome")
        return self._user_agent

    @property
    def page(self) -> Page:
        assert self._page is not None, "session not started"
        return self._page

    # ---------- guards & listeners ----------

    async def _guard_route(self, route: Route, request: Request) -> None:
        url = request.url
        is_top_nav = request.is_navigation_request() and request.frame.parent_frame is None
        if is_top_nav and not is_allowed_origin(url, self.allowed_origins):
            self._signals.blocked_requests.append(f"navigation outside allowed origins: {url}")
            await route.abort("blockedbyclient")
            return
        if not await self.network.is_safe(url):
            self._signals.blocked_requests.append(f"private network address: {url}")
            await route.abort("blockedbyclient")
            return
        await route.continue_()

    def _attach_listeners(self, page: Page) -> None:
        page.on("console", self._on_console)
        page.on(
            "pageerror",
            lambda exc: self._signals.console_errors.append(
                f"Uncaught {exc.name}: {exc.message}"[:300] if exc.name else f"Uncaught {exc}"[:300]
            ),
        )
        page.on("response", self._on_response)
        page.on("requestfailed", self._on_request_failed)

    def _on_console(self, msg: ConsoleMessage) -> None:
        if msg.type == "error":
            self._signals.console_errors.append(msg.text[:300])

    def _on_response(self, response: Response) -> None:
        req = response.request
        if req.is_navigation_request() and req.frame.parent_frame is None:
            self.last_status = response.status
        if response.status >= 400 and req.resource_type in _TRACKED_TYPES:
            path = response.url.split("?")[0]
            self._signals.http_errors.append(f"{req.method} {path} → {response.status}")

    def _on_request_failed(self, request: Request) -> None:
        failure = request.failure or ""
        if "BLOCKED_BY_CLIENT" in failure or request.resource_type not in _TRACKED_TYPES:
            return  # our own guard blocks are already recorded
        self._signals.http_errors.append(f"{request.method} {request.url} failed: {failure}")

    async def _on_popup(self, popup: Page) -> None:
        """Keep the agent in one tab: new tabs/windows are closed and noted."""
        if popup is not self._page:
            self._signals.blocked_requests.append(f"popup window closed: {popup.url}")
            await popup.close()

    def drain_signals(self) -> Signals:
        signals, self._signals = self._signals, Signals()
        return signals

    # ---------- observation ----------

    async def snapshot(self) -> PageSnapshot:
        raw: dict[str, Any] = await self.page.evaluate(SNAPSHOT_JS)
        self.last_snapshot = parse_snapshot(raw)
        return self.last_snapshot

    def blocker(self, snap: PageSnapshot) -> str | None:
        return detect_blocker(self.last_status, snap.title, snap.frames, snap.text)

    async def screenshot(self, path: Path, *, full_page: bool = False) -> int:
        """JPEG screenshot with password fields masked (03 §10). Returns size in bytes."""
        path.parent.mkdir(parents=True, exist_ok=True)
        data = await self.page.screenshot(
            path=str(path),
            type="jpeg",
            quality=70,
            full_page=full_page,
            mask=[self.page.locator("input[type=password]")],
            mask_color="#9ca3af",
        )
        return len(data)
