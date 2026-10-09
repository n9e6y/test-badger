from __future__ import annotations

import pytest

# Accounts the API tests sign up with get judge rights (D25), so they may use every run mode.
# The public-account rules are tested with other addresses in test_runs.py.
JUDGES = "a@example.com,owner@example.com,other@example.com,one@example.com,two@example.com"


@pytest.fixture(autouse=True)
def _judge_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "judge_emails", JUDGES)
