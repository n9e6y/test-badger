"""Day 2 checkpoint: drive the demo shop signup through the tools layer, no LLM.

Hard-codes scenario R3 ("signup rejects an invalid email") to prove the browser layer works.
With bug B1 on, the shop accepts "anna@" and the script reports it.

    python -m scripts.drive_signup [--base-url URL] [--email anna@]
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import time
from pathlib import Path

from agent.browser.session import BrowserSession
from agent.browser.snapshot import format_snapshot
from agent.browser.tools import BrowserTools, describe_action
from app.config import get_settings

logger = logging.getLogger("drive_signup")


async def main(base_url: str, email: str, out_dir: Path) -> int:
    steps: list[str] = []
    async with BrowserSession(allowed_origins=[base_url], exempt_origins=[base_url]) as session:
        tools = BrowserTools(session)

        async def act(action: str, **args: object) -> None:
            label = None
            if "name" in args:
                snap = session.last_snapshot or await session.snapshot()
                element = snap.find(str(args.pop("name")), role=args.pop("role", None))  # type: ignore[arg-type]
                if element is None:
                    raise SystemExit(f"element not found for {action}")
                args["ref"], label = element.ref, element.label
            result = await tools.run(action, dict(args))
            line = describe_action(action, result.logged_args, label, result.url)
            steps.append(line)
            print(f"{'✓' if result.ok else '✗'} {line:<45} → {result.message}")
            snap = await session.snapshot()
            n = len(steps)
            await session.screenshot(out_dir / f"step_{n:02d}.jpg")
            if blocker := session.blocker(snap):
                raise SystemExit(f"blocked: {blocker}")

        await act("navigate", url=f"{base_url}/signup")
        if session.last_snapshot and session.last_snapshot.overlays:
            await act("dismiss_overlay")
        await act("type_text", name="Full name", role="textbox", text="Anna Becker")
        await act("type_text", name="Email", role="textbox", text=email)
        await act("type_text", name="Password", role="textbox", text="Secret123!")
        await act("type_text", name="Confirm password", role="textbox", text="Secret123!")
        await act("click", name="Create account", role="button")

        snap = session.last_snapshot
        assert snap is not None
        signals = session.drain_signals()
        print("\n--- final observation ---")
        print(format_snapshot(snap, signals.summary()))
        accepted = "Welcome!" in snap.text
        print("\n--- verdict (hard-coded, R3) ---")
        if accepted:
            print(f'BUG: the shop accepted the invalid email "{email}" (matches planted bug B1)')
        else:
            errors = [m.text for m in snap.messages if m.kind != "heading"]
            print(f"PASSED: invalid email rejected with {errors}")
        print("\nRepro steps:\n" + "\n".join(f"  {i}. {s}" for i, s in enumerate(steps, 1)))
        print(f"Screenshots: {out_dir}")
        return 1 if accepted else 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=get_settings().demo_shop_url)
    parser.add_argument("--email", default="anna@")
    args = parser.parse_args()
    out = Path(get_settings().artifacts_dir) / "drive_signup" / time.strftime("%Y%m%d-%H%M%S")
    raise SystemExit(asyncio.run(main(args.base_url.rstrip("/"), args.email, out)))
