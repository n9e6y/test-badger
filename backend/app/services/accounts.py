"""D25: who may run what, and on which AI key.

Judge accounts (JUDGE_EMAIL plus JUDGE_EMAILS) get every run mode, a higher daily limit and
the judge key. Every other account can still sign up and finish the full flow, with the
modes in PUBLIC_MODES, RUNS_PER_USER_PER_DAY runs a day and the public key.
D35: accounts in RECORDER_EMAILS stay on the public key and budget, but get every run mode
and RECORDER_RUNS_PER_DAY runs, even when public runs are switched off (D34).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.models import Run, User
from app.security import hash_password, verify_password

logger = logging.getLogger(__name__)

ALL_MODES = ("thorough", "quick")
KeyTier = Literal["judge", "public"]


@dataclass(frozen=True)
class AccountPolicy:
    is_judge: bool
    modes: tuple[str, ...]
    runs_per_day: int
    key_tier: KeyTier


def _split(value: str) -> list[str]:
    return [v.strip().lower() for v in value.split(",") if v.strip()]


def judge_emails(settings: Settings) -> set[str]:
    return set(_split(settings.judge_emails)) | set(_split(settings.judge_email))


def policy_for(email: str) -> AccountPolicy:
    settings = get_settings()
    if email.lower() in judge_emails(settings):
        return AccountPolicy(True, ALL_MODES, settings.judge_runs_per_day, "judge")
    if email.lower() in set(_split(settings.recorder_emails)):
        return AccountPolicy(False, ALL_MODES, settings.recorder_runs_per_day, "public")
    modes = tuple(m for m in _split(settings.public_modes) if m in ALL_MODES) or ("quick",)
    return AccountPolicy(False, modes, settings.runs_per_user_per_day, "public")


async def ensure_judge_account(session: AsyncSession) -> None:
    """Create the judge account, or reset its password to the configured one.

    Resetting on every start means nobody can take the address over by signing up first.
    """
    settings = get_settings()
    email, password = settings.judge_email.strip().lower(), settings.judge_password
    if not email or not password:
        return
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        session.add(User(email=email, name="Judge", password_hash=hash_password(password)))
        logger.info("judge account created")
    elif not verify_password(user.password_hash, password):
        user.password_hash, user.name = hash_password(password), "Judge"
        logger.info("judge account password reset from configuration")
    await session.commit()


async def runs_today(session: AsyncSession, user_id: str) -> int:
    from datetime import timedelta

    since = datetime.now(UTC) - timedelta(days=1)
    count = await session.scalar(
        select(func.count()).select_from(Run).where(Run.user_id == user_id, Run.created_at >= since)
    )
    return count or 0


# D26: estimated AI cost of one run, from the evaluation (09). Used to decide whether a
# tier still has enough money left to start a run.
RUN_ESTIMATE_USD: dict[str, dict[str, float]] = {
    "thorough": {"registration": 0.30, "store": 0.45},
    "quick": {"registration": 0.15, "store": 0.26},
}


def run_estimate(mode: str, test_type: str) -> float:
    return RUN_ESTIMATE_USD.get(mode, RUN_ESTIMATE_USD["thorough"]).get(test_type, 0.45)


def tier_budget(tier: KeyTier) -> float | None:
    """USD the tier may spend in total, or None for no limit."""
    settings = get_settings()
    amount = settings.judge_budget_usd if tier == "judge" else settings.public_budget_usd
    return amount if amount > 0 else None


def _budget_start() -> datetime | None:
    raw = get_settings().budget_start.strip()
    if not raw:
        return None
    start = datetime.fromisoformat(raw)
    return start if start.tzinfo else start.replace(tzinfo=UTC)


async def tier_spent(session: AsyncSession, tier: KeyTier) -> float:
    """AI cost of every run by an account in this tier since BUDGET_START."""
    judges = judge_emails(get_settings())
    query = select(func.coalesce(func.sum(Run.cost_usd), 0.0)).join(User, User.id == Run.user_id)
    if judges:
        query = query.where(
            User.email.in_(judges) if tier == "judge" else User.email.not_in(judges)
        )
    elif tier == "judge":
        return 0.0
    start = _budget_start()
    if start is not None:
        query = query.where(Run.created_at >= start)
    return float(await session.scalar(query) or 0.0)


async def budget_left(session: AsyncSession, tier: KeyTier) -> float | None:
    budget = tier_budget(tier)
    if budget is None:
        return None
    return max(0.0, budget - await tier_spent(session, tier))


def run_cost_cap(setting_cap: float, left: float | None, spent_on_this_run: float) -> float:
    """Per-run cost cap: never more than what the tier has left (this run's spend is part of
    the tier's spend, so it is added back)."""
    if left is None:
        return setting_cap
    return min(setting_cap, spent_on_this_run + left)
