"""Orchestrator: runs the pipeline phases for a stored run and persists everything.

Called by the worker jobs `plan_run` and `execute_run`. Each DB write uses its own short
session, so a long browser run never holds a transaction open.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select

from agent.llm.client import LLMCallRecord, LLMClient
from agent.models import ScenarioResult, StepRecord, TestPlan
from agent.pipeline import Target, execute_phase, plan_phase
from agent.reporter import blocked_report
from app.config import get_settings
from app.db import SessionLocal
from app.events import publish
from app.models import Artifact, Finding, LLMCall, Project, Run, Scenario, Step, User
from app.security import decrypt_secret
from app.services.runs import set_status

logger = logging.getLogger(__name__)
_STAGE_STATUSES = {"RECON", "PLANNING", "TRIAGING", "REPORTING"}


class DbRunContext:
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self._dir = Path(get_settings().artifacts_dir) / run_id
        self._scenario_ids: dict[str, str] = {}
        self._project_row: Project | None = None

    async def _project(self) -> Project:
        if self._project_row is None:
            async with SessionLocal() as s:
                run = await s.get(Run, self.run_id)
                assert run is not None
                self._project_row = await s.get(Project, run.project_id)
        assert self._project_row is not None
        return self._project_row

    async def _scenario_db_id(self, code: str) -> str | None:
        if code not in self._scenario_ids:
            async with SessionLocal() as s:
                sid = await s.scalar(
                    select(Scenario.id).where(Scenario.run_id == self.run_id, Scenario.code == code)
                )
            if sid is None:
                return None
            self._scenario_ids[code] = sid
        return self._scenario_ids[code]

    async def emit(self, event: str, payload: dict[str, Any]) -> None:
        if event == "run.status" and payload.get("status") in _STAGE_STATUSES:
            async with SessionLocal() as s:
                run = await s.get(Run, self.run_id)
                if run is not None and run.status not in ("CANCELLED", "FAILED"):
                    await set_status(s, run, payload["status"], payload.get("message"))
            return  # set_status already published it
        if event == "scenario.finished":
            sid = await self._scenario_db_id(payload["scenario_id"])
            if sid:
                async with SessionLocal() as s:
                    row = await s.get(Scenario, sid)
                    if row is not None:
                        row.verdict, row.reason = payload["verdict"], payload["reason"]
                        await s.commit()
        if event == "step" and payload.get("screenshot_id"):
            payload = {**payload, "screenshot_url": f"/api/artifacts/{payload['screenshot_id']}"}
        if event in ("step", "recon.page") and payload.get("url"):
            payload = {**payload, "url": to_public_url(await self._project(), payload["url"])}
        await publish(self.run_id, event, payload)

    async def save_screenshot(self, data: bytes) -> str:
        artifact_id = str(uuid.uuid4())
        path = self._dir / f"{artifact_id}.jpg"
        await asyncio.to_thread(self._write, path, data)
        async with SessionLocal() as s:
            s.add(
                Artifact(id=artifact_id, run_id=self.run_id, path=str(path), size_bytes=len(data))
            )
            await s.commit()
        return artifact_id

    @staticmethod
    def _write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    @property
    def video_dir(self) -> Path:
        return self._dir / "video"

    async def save_video(self, path: Path) -> str:
        size = await asyncio.to_thread(lambda: path.stat().st_size)
        async with SessionLocal() as s:
            art = Artifact(
                run_id=self.run_id, kind="video", path=str(path), mime="video/webm", size_bytes=size
            )
            s.add(art)
            await s.commit()
            return art.id

    async def scenario_video(
        self, scenario_id: str, artifact_id: str, start_s: float, end_s: float
    ) -> None:
        sid = await self._scenario_db_id(scenario_id)
        if sid is None:
            return
        async with SessionLocal() as s:
            row = await s.get(Scenario, sid)
            if row is not None:
                row.video_artifact_id = artifact_id
                row.video_start_s, row.video_end_s = start_s, end_s
                await s.commit()

    async def save_step(self, scenario_id: str, step: StepRecord) -> None:
        sid = await self._scenario_db_id(scenario_id)
        if sid is None:
            return
        async with SessionLocal() as s:
            s.add(Step(
                scenario_id=sid, index=step.index, action=step.action, args_json=step.args,
                locator_json=step.locator, target_label=step.target_label,
                reasoning=step.reasoning, result=step.result, url=step.url,
                screenshot_artifact_id=step.screenshot_id, console_json=step.console_errors,
                network_json=step.http_errors,
            ))  # fmt: skip
            await s.commit()

    async def scenario_finished(self, result: ScenarioResult) -> None:
        sid = await self._scenario_db_id(result.scenario_id)
        if sid is None:
            return
        async with SessionLocal() as s:
            row = await s.get(Scenario, sid)
            if row is not None:
                row.steps_taken, row.duration_s = len(result.steps), result.duration_s
                await s.commit()

    async def is_cancelled(self) -> bool:
        async with SessionLocal() as s:
            return await s.scalar(select(Run.status).where(Run.id == self.run_id)) == "CANCELLED"

    async def load_screenshot(self, artifact_id: str) -> bytes | None:
        async with SessionLocal() as s:
            art = await s.get(Artifact, artifact_id)
        if art is None or art.run_id != self.run_id:
            return None
        return await asyncio.to_thread(Path(art.path).read_bytes)


async def _record_llm_call(rec: LLMCallRecord) -> None:
    async with SessionLocal() as s:
        s.add(
            LLMCall(
                run_id=rec.run_id,
                stage=rec.stage,
                provider=rec.provider,
                model=rec.model,
                tokens_cached=rec.tokens_cached,
                tokens_in=rec.tokens_in,
                tokens_out=rec.tokens_out,
                cost_usd=rec.cost_usd,
                latency_ms=rec.latency_ms,
                ok=rec.ok,
            )
        )
        run = await s.get(Run, rec.run_id) if rec.run_id else None
        if run is not None:
            run.cost_usd += rec.cost_usd
            run.tokens_in += rec.tokens_in
            run.tokens_out += rec.tokens_out
        await s.commit()
    if rec.run_id:
        async with SessionLocal() as s:
            run = await s.get(Run, rec.run_id)
        if run is not None:
            await publish(
                rec.run_id,
                "cost.updated",
                {
                    "cost_usd": round(run.cost_usd, 4),
                    "tokens_in": run.tokens_in,
                    "tokens_out": run.tokens_out,
                },
            )


def target_for(project: Project) -> Target:
    if project.is_demo:
        url = get_settings().demo_shop_url.rstrip("/")
        return Target(base_url=url, allowed_origins=[url], exempt_origins=[url])
    return Target(
        base_url=project.base_url.rstrip("/"),
        allowed_origins=project.allowed_origins,
        exempt_origins=[],
    )


def to_public_url(project: Project, url: str | None) -> str | None:
    """The worker browses the demo shop on its internal address; show users the public one."""
    settings = get_settings()
    public = (settings.demo_shop_public_url or "").rstrip("/")
    internal = settings.demo_shop_url.rstrip("/")
    if url and project.is_demo and public and url.startswith(internal):
        return public + url[len(internal) :]
    return url


def public_site_url(project: Project) -> str:
    settings = get_settings()
    if project.is_demo:
        return (settings.demo_shop_public_url or settings.demo_shop_url).rstrip("/")
    return project.base_url


async def _load(run_id: str) -> tuple[Run, Project]:
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        if run is None:
            raise LookupError(f"run {run_id} not found")
        project = await s.get(Project, run.project_id)
        assert project is not None
        return run, project


async def _llm(run: Run) -> LLMClient:
    """D25: judge accounts use the judge key, everyone else the public key.
    D26: the run's cost cap never exceeds what the owner's tier has left."""
    from app.services.accounts import budget_left, policy_for, run_cost_cap

    async with SessionLocal() as s:
        email = await s.scalar(select(User.email).where(User.id == run.user_id))
        tier = policy_for(email or "").key_tier
        left = await budget_left(s, tier)
    llm = LLMClient(run_id=run.id, recorder=_record_llm_call, mode=run.mode, key_tier=tier)
    llm.cost_cap_usd = run_cost_cap(get_settings().run_cost_cap_usd, left, run.cost_usd)
    llm.totals.cost_usd = run.cost_usd  # the plan phase counts toward the run's cost cap
    return llm


async def _fail(run_id: str, message: str) -> None:
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        if run is not None and run.status not in ("COMPLETED", "CANCELLED"):
            await set_status(s, run, "FAILED", message)
    await publish(run_id, "run.failed", {"message": message})


def _secrets(run: Run) -> dict[str, str]:
    if not run.credentials_enc:
        return {}
    creds = json.loads(decrypt_secret(run.credentials_enc))
    return {
        k: v
        for k, v in (("TEST_EMAIL", creds.get("email")), ("TEST_PASSWORD", creds.get("password")))
        if v
    }


async def plan_run(run_id: str) -> None:
    started = time.monotonic()
    try:
        run, project = await _load(run_id)
        if run.status == "CANCELLED":
            return
        llm = await _llm(run)
        ctx = DbRunContext(run_id)
        outcome = await plan_phase(
            ctx=ctx,
            llm=llm,
            target=target_for(project),
            test_type=run.test_type,
            goal_text=run.goal_text,
            has_credentials=bool(run.credentials_enc),
        )
        async with SessionLocal() as s:
            row = await s.get(Run, run_id)
            assert row is not None
            if row.status == "CANCELLED":
                return
            if outcome.plan is None:
                report = blocked_report(
                    run_id=run_id,
                    site_url=public_site_url(project),
                    test_type=run.test_type,
                    reason=outcome.blocked or "the site could not be opened",
                    llm=llm,
                    duration_s=time.monotonic() - started,
                )
                row.report_json = report.model_dump(mode="json")
                await set_status(s, row, "COMPLETED")
                await publish(run_id, "run.completed", {"overall_verdict": report.overall_verdict})
                return
            row.recon_json = outcome.recon.model_dump(mode="json") if outcome.recon else None
            row.plan_json = outcome.plan.model_dump(mode="json")
            for order, sc in enumerate(outcome.plan.scenarios):
                s.add(
                    Scenario(
                        run_id=run_id,
                        code=sc.id,
                        title=sc.title,
                        kind=sc.kind,
                        order=order,
                        expected_result=sc.expected_result,
                        enabled=True,
                    )
                )
            await set_status(s, row, "AWAITING_APPROVAL")
    except Exception as exc:
        logger.exception("plan_run failed for %s", run_id)
        await _fail(run_id, _user_message(exc))


async def execute_run(run_id: str) -> None:
    try:
        run, project = await _load(run_id)
        if run.status == "CANCELLED" or run.plan_json is None:
            return
        plan = TestPlan.model_validate(run.plan_json)
        async with SessionLocal() as s:
            row = await s.get(Run, run_id)
            assert row is not None
            await set_status(s, row, "RUNNING")
        ctx = DbRunContext(run_id)
        llm = await _llm(run)
        report = await execute_phase(
            ctx=ctx,
            llm=llm,
            target=target_for(project),
            test_type=run.test_type,
            plan=plan,
            secrets=_secrets(run),
            load_screenshot=ctx.load_screenshot,
            video_dir=ctx.video_dir,
        )
        report.site_url = public_site_url(project)
        async with SessionLocal() as s:
            row = await s.get(Run, run_id)
            assert row is not None
            for f in report.findings + report.needs_review:
                sid = await ctx._scenario_db_id(f.scenario_id)
                s.add(
                    Finding(
                        run_id=run_id,
                        scenario_id=sid,
                        severity=f.severity,
                        area=f.area,
                        title=f.title,
                        owner_summary=f.owner_summary,
                        expected=f.expected,
                        actual=f.actual,
                        repro_json=[r.model_dump() for r in f.repro_steps],
                        evidence_json=f.evidence.model_dump(),
                        confidence=f.confidence,
                        confirmed=f.confirmed,
                        fingerprint=f.fingerprint,
                    )
                )
            row.report_json = report.model_dump(mode="json")
            final = "CANCELLED" if row.status == "CANCELLED" else "COMPLETED"
            await set_status(s, row, final)
        await publish(run_id, "run.completed", {"overall_verdict": report.overall_verdict})
    except Exception as exc:
        logger.exception("execute_run failed for %s", run_id)
        await _fail(run_id, _user_message(exc))


def _user_message(exc: Exception) -> str:
    from agent.llm.types import BudgetExceeded, LLMError, OutOfCredits

    if isinstance(exc, BudgetExceeded):
        return "This run reached its AI cost limit (the demo's AI budget is almost used up)."
    if isinstance(exc, OutOfCredits):
        return (
            "The AI testing budget for this demo is used up, so this run had to stop. "
            "Please try again later or contact the test-badger team."
        )
    if isinstance(exc, LLMError):
        return f"The AI model could not complete this run: {exc}"
    return "Something went wrong while testing. Your results so far were saved; please try again."
