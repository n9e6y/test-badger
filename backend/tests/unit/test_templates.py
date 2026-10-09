from __future__ import annotations

import pytest

from agent.llm.schema import strict_schema
from agent.models import Report, ReportTexts, SiteRecon, TestPlan, TriageDecision
from agent.templates import REGISTRY, get_template
from agent.templates.test_data import LIBRARY, data_for_run, format_test_data


def test_registry_has_both_mvp_types() -> None:
    assert set(REGISTRY) == {"registration", "store"}
    with pytest.raises(ValueError, match="unknown test type"):
        get_template("booking")


@pytest.mark.parametrize("template", REGISTRY.values(), ids=list(REGISTRY))
def test_template_is_consistent(template) -> None:  # type: ignore[no-untyped-def]
    ids = [s.id for s in template.scenarios]
    assert len(ids) == len(set(ids))
    assert all(i.startswith(template.scenario_prefix) for i in ids)
    for s in template.scenarios:
        assert all(dep in ids[: ids.index(s.id)] for dep in s.depends_on), s.id
        assert set(s.test_data_keys) <= set(template.test_data_keys) | set(LIBRARY), s.id
        assert s.steps_intent and s.expected_result
    assert set(template.test_data_keys) <= set(LIBRARY)
    assert len(template.scenarios) <= 8  # max scenarios per run (03 §9)


def test_ids_match_docs() -> None:
    assert [s.id for s in get_template("registration").scenarios] == [f"R{i}" for i in range(1, 7)]
    assert [s.id for s in get_template("store").scenarios] == [f"ST{i}" for i in range(1, 8)]


def test_test_data_unique_email_per_run() -> None:
    a = data_for_run("1234abcd-0000", ["valid_email", "invalid_emails", "valid_password"])
    b = data_for_run("9999ffff-0000", ["valid_email", "valid_password"])
    assert a["valid_email"] == ["shipcheck+1234abcd@example.com"]
    assert a["valid_email"] != b["valid_email"]
    # per-run password: not a well-known (leaked) one, differs per run, strong
    assert a["valid_password"] == ["Badger!1234abcdQx"]
    assert a["valid_password"] != b["valid_password"]
    assert '"anna@"' in format_test_data(a)


@pytest.mark.parametrize("model", [SiteRecon, TestPlan, TriageDecision, ReportTexts, Report])
def test_llm_models_convert_to_strict_schema(model) -> None:  # type: ignore[no-untyped-def]
    schema = strict_schema(model)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
