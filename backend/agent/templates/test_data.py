"""Fixed test-data library (03 §7.3). The planner picks values from here or from the user's
goal text; it never invents data, so runs are reproducible."""

from __future__ import annotations

import json
from typing import Any

LIBRARY: dict[str, list[str]] = {
    "valid_name": ["Anna Becker"],
    "valid_email": ["shipcheck+{run}@example.com"],
    "invalid_emails": ["anna@", "anna.example.com", "anna@@example.com"],
    "valid_password": ["Secret123!"],
    "weak_passwords": ["123", "password"],
    "mismatch_password": ["Secret999!"],
    "valid_phone": ["+49 30 1234567"],
    "valid_address": ["Torstraße 1"],
    "valid_city": ["Berlin"],
    "valid_postal_codes": ["10115", "10 115"],
    "quantities": ["1", "3", "0", "-2", "999"],
    "coupon_guesses": ["INVALID123"],
}


def data_for_run(run_id: str, keys: list[str]) -> dict[str, list[str]]:
    """Values for the given keys, with per-run uniqueness filled in (e.g. the signup email)."""
    short = run_id.replace("-", "")[:8]
    return {
        key: [v.replace("{run}", short) for v in LIBRARY[key]] for key in keys if key in LIBRARY
    }


def format_test_data(data: dict[str, list[str]]) -> str:
    return "\n".join(
        f"- {key}: " + ", ".join(f'"{v}"' for v in values) for key, values in data.items()
    )


def refresh_plan_data(plan: dict[str, Any], old_run_id: str, new_run_id: str) -> dict[str, Any]:
    """Copy of a stored plan for a re-run (D21), with per-run values swapped for the new run's.

    Without this a re-run would sign up with the parent run's email again and the
    "valid signup" scenario would hit "account already exists".
    """
    old, new = data_for_run(old_run_id, list(LIBRARY)), data_for_run(new_run_id, list(LIBRARY))
    swaps = {a: b for key in LIBRARY for a, b in zip(old[key], new[key], strict=True) if a != b}
    text = json.dumps(plan)
    for a, b in swaps.items():
        text = text.replace(a, b)
    return dict(json.loads(text))
