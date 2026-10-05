"""Stage 1 — Recon (03 §3): find the pages relevant to the test type without wasting steps."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

from agent.browser.guards import is_allowed_origin
from agent.browser.session import BrowserSession
from agent.browser.snapshot import PageSnapshot, format_snapshot
from agent.browser.tools import BrowserTools
from agent.context import RunContext
from agent.llm.client import LLMClient
from agent.models import SiteRecon
from agent.prompts import load_prompt
from agent.templates.base import TestTemplate

logger = logging.getLogger(__name__)
MAX_PAGE_CHARS = 2_500


@dataclass
class ReconOutcome:
    recon: SiteRecon | None
    blocked: str | None = None


def score_links(
    snap: PageSnapshot, keywords: list[str], allowed_origins: list[str]
) -> list[tuple[int, str]]:
    """Internal links ranked by how many template keywords their label/path contain."""
    seen: dict[str, int] = {}
    for el in snap.elements:
        if el.role != "link" or not el.href or el.href.startswith(("#", "mailto:", "tel:")):
            continue
        url = urljoin(snap.url, el.href).split("#")[0]
        if not is_allowed_origin(url, allowed_origins) or url.rstrip("/") == snap.url.rstrip("/"):
            continue
        hay = f"{el.name} {urlsplit(url).path}".lower().replace("-", " ")
        score = sum(1 for kw in keywords if kw in hay)
        if score:
            seen[url] = max(seen.get(url, 0), score)
    return sorted(((s, u) for u, s in seen.items()), key=lambda x: (-x[0], x[1]))


async def run_recon(
    *,
    base_url: str,
    template: TestTemplate,
    goal_text: str | None,
    session: BrowserSession,
    tools: BrowserTools,
    llm: LLMClient,
    ctx: RunContext,
    max_pages: int,
) -> ReconOutcome:
    await ctx.emit("run.status", {"status": "RECON", "message": "Opening site…"})
    result = await tools.run("navigate", {"url": base_url})
    if not result.ok:
        return ReconOutcome(None, blocked=f"Could not open the site: {result.message}")
    home = await session.snapshot()
    if blocker := session.blocker(home):
        return ReconOutcome(None, blocked=blocker)
    await ctx.emit("recon.page", {"url": home.url, "title": home.title})

    keywords = template.recon_keywords + (goal_text or "").lower().split()[:10]
    candidates = score_links(home, keywords, session.allowed_origins)
    pages = [home]
    for _score, url in candidates[: max(0, max_pages - 1)]:
        visit = await tools.run("navigate", {"url": url})
        if not visit.ok:
            continue
        snap = await session.snapshot()
        if session.blocker(snap):
            snap.text = f"[automation blocker detected: {session.blocker(snap)}] " + snap.text
        pages.append(snap)
        await ctx.emit("recon.page", {"url": snap.url, "title": snap.title})
    session.drain_signals()

    observations = "\n\n".join(
        f"=== PAGE {i + 1} ===\n{format_snapshot(p)[:MAX_PAGE_CHARS]}" for i, p in enumerate(pages)
    )
    user = (
        f"Test type: {template.title} — {template.description}\n"
        f"Owner's goal: {goal_text or '(none)'}\n\n{observations}"
    )
    recon = await llm.structured("recon", load_prompt("recon"), user, SiteRecon)
    logger.info("recon done run=%s pages=%d", ctx.run_id, len(pages))
    return ReconOutcome(recon)
