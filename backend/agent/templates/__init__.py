"""Template registry. Adding a flow type = adding one template file and listing it here."""

from __future__ import annotations

from agent.templates.base import ScenarioTemplate, TestTemplate
from agent.templates.registration import REGISTRATION
from agent.templates.store import STORE

REGISTRY: dict[str, TestTemplate] = {t.key: t for t in (REGISTRATION, STORE)}


def get_template(key: str) -> TestTemplate:
    try:
        return REGISTRY[key]
    except KeyError:
        raise ValueError(f"unknown test type {key!r}; choose one of {sorted(REGISTRY)}") from None


__all__ = ["REGISTRY", "ScenarioTemplate", "TestTemplate", "get_template"]
