"""Browser tools (03 §5.2): the only code that performs Playwright actions for the agent.

Every call returns a short `ToolResult` that becomes part of the next observation.
Guards run before the browser acts; secrets are substituted here at the last moment.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin, urlsplit

from playwright.async_api import Error, Locator
from playwright.async_api import TimeoutError as PlaywrightTimeout
from pydantic import BaseModel

from agent.browser.guards import GuardError, check_click, is_allowed_origin
from agent.browser.session import BrowserSession
from agent.browser.snapshot import Element

logger = logging.getLogger(__name__)

MASK = "••••••"
_PLACEHOLDER_RE = re.compile(r"\{\{([A-Z_]+)\}\}")
ALLOWED_KEYS = {"Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Backspace", "Space"}
MAX_WAIT_S = 5.0
_DISMISS_NAMES = [
    "accept all",
    "accept",
    "agree",
    "got it",
    "ok",
    "no thanks",
    "close",
    "dismiss",
    "decline",
    "×",
    "x",
    "not now",
    "maybe later",
]
BROWSER_ACTIONS = {
    "navigate",
    "click",
    "type_text",
    "select_option",
    "check",
    "press_key",
    "scroll",
    "wait",
    "dismiss_overlay",
}


class ToolResult(BaseModel):
    ok: bool
    message: str
    url: str = ""
    target_label: str | None = None
    locator: dict[str, str] | None = None
    logged_args: dict[str, Any] = {}


def describe_action(action: str, args: dict[str, Any], target: str | None, url: str) -> str:
    """Human-readable step used in repro steps. Built from recorded data, never by the LLM."""
    label = f'"{target}"' if target else "the element"
    match action:
        case "navigate":
            return f"Open {urlsplit(str(args.get('url', url))).path or '/'}"
        case "click":
            return f"Click {label}"
        case "type_text":
            return f'Type "{args.get("text", "")}" in {label}'
        case "select_option":
            return f'Select "{args.get("value", "")}" in {label}'
        case "check":
            return f"{'Check' if args.get('checked', True) else 'Uncheck'} {label}"
        case "press_key":
            return f"Press {args.get('key')}"
        case "scroll":
            return f"Scroll {args.get('direction', 'down')}"
        case "wait":
            return f'Wait for "{args["for_text"]}"' if args.get("for_text") else "Wait"
        case "dismiss_overlay":
            return "Close the popup / banner"
    return action


class BrowserTools:
    def __init__(self, session: BrowserSession, secrets: dict[str, str] | None = None) -> None:
        self.session = session
        self._secrets = secrets or {}

    @property
    def has_credentials(self) -> bool:
        return bool(self._secrets)

    async def run(self, action: str, args: dict[str, Any]) -> ToolResult:
        if action not in BROWSER_ACTIONS:
            return self._result(False, f"unknown action '{action}'", args)
        handler = getattr(self, f"_{action}")
        try:
            result: ToolResult = await handler(**args)
        except GuardError as exc:
            return self._result(False, str(exc), args)
        except TypeError as exc:
            return self._result(False, f"invalid arguments for {action}: {exc}", args)
        except PlaywrightTimeout:
            return self._result(
                False, f"{action} timed out (element hidden, covered or disabled?)", args
            )
        except Error as exc:
            msg = str(exc).splitlines()[0][:200]
            if "ERR_BLOCKED_BY_CLIENT" in msg:
                msg = "navigation blocked: outside the allowed origins or a private address"
            return self._result(False, f"{action} failed: {msg}", args)
        await self._enforce_origin(result)
        return result

    # ---------- helpers ----------

    def _result(
        self, ok: bool, message: str, args: dict[str, Any], element: Element | None = None
    ) -> ToolResult:
        return ToolResult(
            ok=ok,
            message=message,
            url=self.session.page.url,
            target_label=element.label if element else None,
            locator=element.locator.model_dump() if element else None,
            logged_args=self._mask(args),
        )

    def _mask(self, args: dict[str, Any]) -> dict[str, Any]:
        masked = dict(args)
        if isinstance(masked.get("text"), str) and _PLACEHOLDER_RE.search(masked["text"]):
            masked["text"] = _PLACEHOLDER_RE.sub(MASK, masked["text"])
        return masked

    def _substitute(self, text: str) -> str:
        def repl(m: re.Match[str]) -> str:
            key = m.group(1)
            if key not in self._secrets:
                raise GuardError(f"unknown placeholder {{{{{key}}}}}: no such test credential")
            return self._secrets[key]

        return _PLACEHOLDER_RE.sub(repl, text)

    def _element(self, ref: int | str) -> tuple[Element, Locator]:
        snap = self.session.last_snapshot
        element = snap.element(int(ref)) if snap else None
        if element is None:
            raise GuardError(f"element [{ref}] not found in the latest observation; look again")
        return element, self.session.page.locator(f'[data-sc-ref="{element.ref}"]')

    async def _settle(self) -> None:
        page = self.session.page
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5_000)
        except PlaywrightTimeout:
            pass
        await page.wait_for_timeout(300)

    async def _enforce_origin(self, result: ToolResult) -> None:
        """Backstop for redirects that escape request routing: go back if we left the site."""
        page = self.session.page
        escaped = page.url.startswith(("http://", "https://")) and not is_allowed_origin(
            page.url, self.session.allowed_origins
        )
        # An aborted navigation (our own route guard) leaves Chromium on its error page.
        if escaped or page.url.startswith("chrome-error://"):
            left = page.url if escaped else "the requested page"
            try:
                await page.go_back(wait_until="domcontentloaded")
            except Error:
                logger.warning("go_back after blocked navigation failed")
            result.ok = False
            result.message = (
                f"navigation blocked: {left} is outside the allowed origins or a private address"
            )
            result.url = page.url

    # ---------- tools ----------

    async def _navigate(self, url: str) -> ToolResult:
        target = urljoin(self.session.page.url or url, url)
        if not is_allowed_origin(target, self.session.allowed_origins):
            raise GuardError(f"navigation blocked: {target} is outside the allowed origins")
        await self.session.network.check(target)
        response = await self.session.page.goto(target, wait_until="domcontentloaded")
        await self._settle()
        status = response.status if response else "?"
        return self._result(True, f"opened {target} (HTTP {status})", {"url": target})

    async def _click(self, ref: int) -> ToolResult:
        element, locator = self._element(ref)
        snap = self.session.last_snapshot
        check_click(element.label, bool(snap and snap.payment_fields))
        if element.disabled:
            return self._result(False, f'"{element.label}" is disabled', {"ref": ref}, element)
        await locator.click()
        await self._settle()
        return self._result(True, f'clicked "{element.label}"', {"ref": ref}, element)

    async def _type_text(self, ref: int, text: str, clear: bool = True) -> ToolResult:
        element, locator = self._element(ref)
        value = self._substitute(text)
        if clear:
            await locator.fill(value)
        else:
            await locator.press_sequentially(value)
        shown = self._mask({"text": text})["text"]
        return self._result(
            True, f'typed "{shown}" into "{element.label}"', {"ref": ref, "text": text}, element
        )

    async def _select_option(self, ref: int, value: str) -> ToolResult:
        element, locator = self._element(ref)
        try:
            await locator.select_option(label=value)
        except Error:
            await locator.select_option(value=value)
        await self._settle()
        args = {"ref": ref, "value": value}
        return self._result(True, f'selected "{value}" in "{element.label}"', args, element)

    async def _check(self, ref: int, checked: bool = True) -> ToolResult:
        element, locator = self._element(ref)
        await locator.set_checked(checked)
        state = "checked" if checked else "unchecked"
        return self._result(
            True, f'{state} "{element.label}"', {"ref": ref, "checked": checked}, element
        )

    async def _press_key(self, key: str) -> ToolResult:
        if key not in ALLOWED_KEYS:
            raise GuardError(f"key '{key}' not allowed; use one of {sorted(ALLOWED_KEYS)}")
        snap = self.session.last_snapshot
        if key == "Enter" and snap and snap.payment_fields:
            raise GuardError("Enter refused by payment guard: it could submit the payment form")
        await self.session.page.keyboard.press(key)
        await self._settle()
        return self._result(True, f"pressed {key}", {"key": key})

    async def _scroll(self, direction: str = "down") -> ToolResult:
        delta = {"down": 600, "up": -600}.get(direction)
        if delta is None:
            raise GuardError("direction must be 'up' or 'down'")
        await self.session.page.mouse.wheel(0, delta)
        await self.session.page.wait_for_timeout(300)
        return self._result(True, f"scrolled {direction}", {"direction": direction})

    async def _wait(self, seconds: float = 1.0, for_text: str | None = None) -> ToolResult:
        page = self.session.page
        if for_text:
            try:
                await page.get_by_text(for_text).first.wait_for(timeout=MAX_WAIT_S * 1000)
            except PlaywrightTimeout:
                return self._result(
                    False, f'"{for_text}" did not appear within 5 s', {"for_text": for_text}
                )
            return self._result(True, f'"{for_text}" is visible', {"for_text": for_text})
        seconds = max(0.0, min(float(seconds), MAX_WAIT_S))
        await page.wait_for_timeout(seconds * 1000)
        return self._result(True, f"waited {seconds:g} s", {"seconds": seconds})

    async def _dismiss_overlay(self) -> ToolResult:
        snap = await self.session.snapshot()
        candidates = [e for e in snap.elements if e.in_overlay and e.role == "button"]
        for wanted in _DISMISS_NAMES:
            for element in candidates:
                name = element.name.lower()
                if name == wanted or (len(wanted) > 2 and name.startswith(wanted)):
                    check_click(element.label, snap.payment_fields)
                    await self.session.page.locator(f'[data-sc-ref="{element.ref}"]').click()
                    await self._settle()
                    return self._result(True, f'closed overlay with "{element.label}"', {}, element)
        await self.session.page.keyboard.press("Escape")
        await self.session.page.wait_for_timeout(300)
        found = "no overlay button found" if not candidates else "no close button matched"
        return self._result(True, f"pressed Escape ({found})", {})
