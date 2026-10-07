"""RunContext: how the agent core talks to the outside world (events, artifacts, progress).

The orchestrator provides a DB + Redis implementation; tests and dev scripts use MemoryContext.
Keeping this boundary means the stages never import the database or the queue.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from agent.models import ScenarioResult, StepRecord


class RunContext(Protocol):
    run_id: str

    async def emit(self, event: str, payload: dict[str, Any]) -> None: ...

    async def save_screenshot(self, data: bytes) -> str:
        """Store a JPEG and return its artifact id."""
        ...

    async def save_step(self, scenario_id: str, step: StepRecord) -> None: ...

    async def save_video(self, path: Path) -> str:
        """Register a finished WebM recording (D22) and return its artifact id."""
        ...

    async def scenario_video(
        self, scenario_id: str, artifact_id: str, start_s: float, end_s: float
    ) -> None:
        """Which part of which video shows this scenario."""
        ...

    async def scenario_finished(self, result: ScenarioResult) -> None: ...

    async def is_cancelled(self) -> bool: ...


@dataclass
class MemoryContext:
    """In-memory context for tests and dev scripts. Screenshots go to `out_dir` if given."""

    run_id: str = "dev-run"
    out_dir: Path | None = None
    verbose: bool = False
    events: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    screenshots: dict[str, bytes] = field(default_factory=dict)
    steps: dict[str, list[StepRecord]] = field(default_factory=dict)
    results: list[ScenarioResult] = field(default_factory=list)
    videos: dict[str, Path] = field(default_factory=dict)
    scenario_videos: dict[str, tuple[str, float, float]] = field(default_factory=dict)
    cancel: bool = False

    async def emit(self, event: str, payload: dict[str, Any]) -> None:
        self.events.append((event, payload))
        if self.verbose:
            print(f"  [{event}] {payload}")

    async def save_screenshot(self, data: bytes) -> str:
        artifact_id = uuid.uuid4().hex
        self.screenshots[artifact_id] = data
        if self.out_dir is not None:
            self.out_dir.mkdir(parents=True, exist_ok=True)
            (self.out_dir / f"{len(self.screenshots):03d}_{artifact_id[:8]}.jpg").write_bytes(data)
        return artifact_id

    async def save_step(self, scenario_id: str, step: StepRecord) -> None:
        self.steps.setdefault(scenario_id, []).append(step)

    async def save_video(self, path: Path) -> str:
        artifact_id = uuid.uuid4().hex
        self.videos[artifact_id] = path
        return artifact_id

    async def scenario_video(
        self, scenario_id: str, artifact_id: str, start_s: float, end_s: float
    ) -> None:
        self.scenario_videos[scenario_id] = (artifact_id, start_s, end_s)

    async def scenario_finished(self, result: ScenarioResult) -> None:
        self.results.append(result)

    async def is_cancelled(self) -> bool:
        return self.cancel
