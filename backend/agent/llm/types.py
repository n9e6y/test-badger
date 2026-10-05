"""Provider-neutral request/response types for the LLM adapter.

Every agent call is a single request (system prompt + one user turn, optional screenshots).
No conversation history is replayed, so there are no thinking blocks to carry between calls.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Stage = Literal["recon", "planner", "executor", "verifier", "reporter", "spike"]


class ToolSpec(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]  # strict JSON schema (see schema.strict_schema)


class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class LLMRequest(BaseModel):
    model: str
    system: str
    user_text: str
    images: list[bytes] = Field(default_factory=list)  # JPEG screenshots
    tools: list[ToolSpec] = Field(default_factory=list)
    json_schema: dict[str, Any] | None = None  # {"name": ..., "schema": {...}}
    max_tokens: int = 16_000
    effort: Literal["low", "medium", "high"] | None = None


class LLMResponse(BaseModel):
    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float | None = None  # set when the provider reports cost (OpenRouter)
    stop_reason: str | None = None
    model: str = ""


class LLMError(Exception):
    """A stage-level LLM failure with a user-safe message."""


class LLMUnavailable(LLMError):
    """Provider unreachable, rate limited or erroring after retries."""


class LLMRefusal(LLMError):
    """The model declined the request (safety classifier)."""


class LLMOutputError(LLMError):
    """The model's output did not validate, even after one retry."""


class BudgetExceeded(LLMError):
    """The run's LLM cost cap was reached."""
