"""D21 re-run comparison + test-data refresh, D22 video slicing."""

from __future__ import annotations

from pathlib import Path

import pytest

from agent.browser.session import RecordedVideo
from agent.pipeline import video_slices
from agent.templates.test_data import data_for_run, refresh_plan_data
from app.services.compare import compare_reports, compare_status


@pytest.mark.parametrize(
    ("before", "after", "expected"),
    [
        ("BUG_FOUND", "PASSED", "fixed"),
        ("BUG_FOUND", "BUG_FOUND", "still_broken"),
        ("PASSED", "BUG_FOUND", "new_bug"),
        (None, "BUG_FOUND", "new_bug"),
        ("PASSED", "PASSED", "passing"),
        ("INCONCLUSIVE", "PASSED", "passing"),
        # never claim "fixed" when the re-run could not check it
        ("BUG_FOUND", "INCONCLUSIVE", "unclear"),
        ("BUG_FOUND", "BLOCKED", "unclear"),
    ],
)
def test_compare_status(before: str | None, after: str, expected: str) -> None:
    assert compare_status(before, after) == expected


def test_compare_reports_uses_old_title_for_fixed_and_new_title_otherwise() -> None:
    parent = {
        "scenarios": [
            {"id": "R1", "title": "Valid signup", "verdict": "PASSED"},
            {"id": "R3", "title": "Invalid email", "verdict": "BUG_FOUND"},
            {"id": "R4", "title": "Password mismatch", "verdict": "BUG_FOUND"},
        ],
        "findings": [
            {"scenario_id": "R3", "title": "Invalid email accepted"},
            {"scenario_id": "R4", "title": "Mismatch accepted"},
        ],
    }
    child = {
        "scenarios": [
            {"id": "R1", "title": "Valid signup", "verdict": "PASSED"},
            {"id": "R3", "title": "Invalid email", "verdict": "PASSED"},
            {"id": "R4", "title": "Password mismatch", "verdict": "BUG_FOUND"},
        ],
        "findings": [{"scenario_id": "R4", "title": "Passwords that differ are accepted"}],
    }
    items = {i.scenario_id: i for i in compare_reports(parent, child)}
    assert items["R1"].status == "passing" and items["R1"].bug_title is None
    assert items["R3"].status == "fixed" and items["R3"].bug_title == "Invalid email accepted"
    assert items["R4"].status == "still_broken"
    assert items["R4"].bug_title == "Passwords that differ are accepted"


def test_refresh_plan_data_swaps_per_run_values_only() -> None:
    old_id, new_id = "aaaaaaaa-0000-0000-0000-000000000000", "bbbbbbbb-0000-0000-0000-000000000000"
    old_email = data_for_run(old_id, ["valid_email"])["valid_email"][0]
    plan = {
        "scenarios": [
            {
                "id": "R1",
                "test_data": [{"key": "valid_email", "value": old_email}],
                "expected_result": f"Account {old_email} is created",
            },
            {"id": "R3", "test_data": [{"key": "invalid_emails", "value": "anna@"}]},
        ]
    }
    fresh = refresh_plan_data(plan, old_id, new_id)
    new_email = data_for_run(new_id, ["valid_email"])["valid_email"][0]
    assert old_email not in str(fresh) and new_email in str(fresh)
    assert fresh["scenarios"][1]["test_data"][0]["value"] == "anna@"
    assert plan["scenarios"][0]["test_data"][0]["value"] == old_email  # input untouched


def test_video_slices_pick_the_video_a_scenario_overlaps_most() -> None:
    videos = [
        RecordedVideo(Path("a.webm"), started=100.0, ended=160.0),
        # a clean-state scenario starts at 160 and its new context opens 0.3 s later
        RecordedVideo(Path("b.webm"), started=160.3, ended=200.0),
    ]
    spans = {"R1": (101.0, 130.0), "R2": (130.0, 160.0), "R5": (160.0, 190.0)}
    out = video_slices(videos, spans)
    assert out["R1"] == (0, 1.0, 30.0)
    assert out["R2"] == (0, 30.0, 60.0)
    assert out["R5"] == (1, 0.0, 29.7)


def test_video_slices_without_videos_is_empty() -> None:
    assert video_slices([], {"R1": (0.0, 5.0)}) == {}
