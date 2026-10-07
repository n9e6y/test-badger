"""Compare a re-run with the run it re-ran (D21).

Both runs used the same plan, so scenarios match by id (R3, ST4…). Matching by finding title
would not work: titles are written by the model and change between runs. The rules are
deliberately conservative: a scenario that ended Inconclusive or Blocked is never "fixed".
"""

from __future__ import annotations

from typing import Any

from app.schemas.runs import CompareItem, CompareStatus

_UNCLEAR = {"INCONCLUSIVE", "BLOCKED", None}


def compare_status(before: str | None, after: str | None) -> CompareStatus:
    if after == "BUG_FOUND":
        return "still_broken" if before == "BUG_FOUND" else "new_bug"
    if after in _UNCLEAR:
        return "unclear"
    # after == PASSED
    return "fixed" if before == "BUG_FOUND" else "passing"


def compare_reports(parent: dict[str, Any], child: dict[str, Any]) -> list[CompareItem]:
    before = {s["id"]: s for s in parent.get("scenarios", [])}
    bug_titles: dict[str, dict[str, str]] = {"parent": {}, "child": {}}
    for side, report in (("parent", parent), ("child", child)):
        for f in report.get("findings", []):
            bug_titles[side].setdefault(f["scenario_id"], f["title"])
    items = []
    for s in child.get("scenarios", []):
        prev = before.get(s["id"])
        prev_verdict = prev["verdict"] if prev else None
        status = compare_status(prev_verdict, s["verdict"])
        title = (
            bug_titles["parent"].get(s["id"])
            if status == "fixed"
            else bug_titles["child"].get(s["id"])
        )
        items.append(
            CompareItem(
                scenario_id=s["id"],
                title=s["title"],
                before=prev_verdict,
                after=s["verdict"],
                status=status,
                bug_title=title,
            )
        )
    return items
