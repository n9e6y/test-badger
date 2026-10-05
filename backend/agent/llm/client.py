"""LLMClient: the only way the agent talks to a model (invariant 8).

- Picks provider + model per stage from config ("<provider>:<model>").
- Validates every output against a Pydantic model; retries once with the error, then fails.
- Records stage, provider, model, tokens, cost, latency for every call, and enforces the
  per-run cost cap before each call.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from agent.llm.schema import strict_schema
from agent.llm.types import (
    BudgetExceeded,
    LLMError,
    LLMOutputError,
    LLMRequest,
    LLMResponse,
    LLMUnavailable,
    Stage,
    ToolCall,
    ToolSpec,
)
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
Effort = Literal["low", "medium", "high"]

STAGE_EFFORT: dict[str, Effort | None] = {
    "recon": "low",
    "planner": "medium",
    "executor": "low",
    "verifier": "high",
    "reporter": None,
    "spike": "low",
}

# Backoff between full retries of the fallback chain on rate limits / outages.
RETRY_BACKOFF_S: tuple[float, ...] = (4.0, 12.0)

# Output ceilings per stage. Resellers reserve credit for max_tokens, so keep them tight.
STAGE_MAX_TOKENS: dict[str, int] = {
    "recon": 4_000,
    "planner": 8_000,
    "executor": 4_000,
    "verifier": 6_000,
    "reporter": 4_000,
    "spike": 4_000,
}


class Provider(Protocol):
    name: str

    async def generate(self, req: LLMRequest) -> LLMResponse: ...


@dataclass
class LLMCallRecord:
    run_id: str | None
    stage: str
    provider: str
    model: str
    tokens_in: int
    tokens_out: int
    cost_usd: float
    latency_ms: int
    ok: bool
    tokens_cached: int = 0


Recorder = Callable[[LLMCallRecord], Awaitable[None]]


@dataclass
class ToolDef:
    """A tool the model may call, with its arguments as a Pydantic model."""

    name: str
    description: str
    args: type[BaseModel]

    def spec(self) -> ToolSpec:
        return ToolSpec(
            name=self.name, description=self.description, parameters=strict_schema(self.args)
        )


@dataclass
class Totals:
    calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0


def parse_role(value: str) -> tuple[str, str]:
    provider, sep, model = value.partition(":")  # model ids may contain ':' (e.g. ':free')
    if not sep or not model:
        raise ValueError(f"LLM role must be '<provider>:<model>', got {value!r}")
    return provider, model


def build_providers(settings: Settings) -> dict[str, Provider]:
    from agent.llm.providers.anthropic import AnthropicProvider
    from agent.llm.providers.openai_chat import OpenAIChatProvider

    providers: dict[str, Provider] = {}
    if settings.anthropic_api_key:
        providers["anthropic"] = AnthropicProvider(settings.anthropic_api_key)
    if settings.openai_api_key:
        providers["openai"] = OpenAIChatProvider("openai", settings.openai_api_key)
    if settings.environment == "dev":
        from agent.llm.providers.sim import SimProvider

        providers["sim"] = SimProvider()  # dev-only rule-based stand-in, never in prod
    if settings.openai_compat_api_key:
        providers["openai_compat"] = OpenAIChatProvider(
            "openai_compat", settings.openai_compat_api_key, settings.openai_compat_base_url
        )
    return providers


@dataclass
class LLMClient:
    run_id: str | None = None
    recorder: Recorder | None = None
    providers: dict[str, Provider] | None = None
    roles: dict[str, str] | None = None
    cost_cap_usd: float | None = None
    totals: Totals = field(default_factory=Totals)

    def __post_init__(self) -> None:
        settings = get_settings()
        if self.providers is None:
            self.providers = build_providers(settings)
        if self.roles is None:
            self.roles = {
                "recon": settings.llm_planner,
                "planner": settings.llm_planner,
                "executor": settings.llm_executor,
                "verifier": settings.llm_verifier,
                "reporter": settings.llm_reporter,
                "spike": settings.llm_executor,
            }
        if self.cost_cap_usd is None:
            self.cost_cap_usd = settings.run_cost_cap_usd

    # ---------- low level ----------

    def _routes(self, stage: Stage) -> list[tuple[Provider, str]]:
        """A role may list fallbacks: "openai_compat:a|openai_compat:b" (tried in order)."""
        assert self.roles is not None and self.providers is not None
        routes = []
        for part in self.roles[stage].split("|"):
            provider_name, model = parse_role(part.strip())
            provider = self.providers.get(provider_name)
            if provider is None:
                raise LLMError(
                    f"LLM provider '{provider_name}' for stage {stage} is not configured "
                    f"(missing API key?)"
                )
            routes.append((provider, model))
        return routes

    async def call(
        self,
        stage: Stage,
        system: str,
        user_text: str,
        *,
        images: list[bytes] | None = None,
        tools: list[ToolSpec] | None = None,
        json_schema: dict[str, object] | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """One logical call. On rate limits/outages: next fallback model, then back off and
        retry the whole chain (03 §13: retry with backoff, then fail the stage cleanly)."""
        if self.cost_cap_usd is not None and self.totals.cost_usd >= self.cost_cap_usd:
            raise BudgetExceeded(f"LLM cost cap of ${self.cost_cap_usd:.2f} reached")
        routes = self._routes(stage)
        last_error: LLMUnavailable | None = None
        for attempt, delay in enumerate((0.0, *RETRY_BACKOFF_S)):
            if delay:
                logger.warning(
                    "llm unavailable (run=%s stage=%s), retry %d in %.0fs: %s",
                    self.run_id,
                    stage,
                    attempt,
                    delay,
                    last_error,
                )
                await asyncio.sleep(delay)
            for provider, model in routes:
                try:
                    return await self._call_once(
                        stage, provider, model, system, user_text, images=images, tools=tools,
                        json_schema=json_schema, max_tokens=max_tokens,
                    )  # fmt: skip
                except LLMUnavailable as exc:
                    last_error = exc
        assert last_error is not None
        raise last_error

    async def _call_once(
        self,
        stage: Stage,
        provider: Provider,
        model: str,
        system: str,
        user_text: str,
        *,
        images: list[bytes] | None,
        tools: list[ToolSpec] | None,
        json_schema: dict[str, object] | None,
        max_tokens: int | None,
    ) -> LLMResponse:
        req = LLMRequest(
            model=model,
            system=system,
            user_text=user_text,
            images=images or [],
            tools=tools or [],
            json_schema=json_schema,
            max_tokens=max_tokens or STAGE_MAX_TOKENS.get(stage, 4_000),
            effort=STAGE_EFFORT.get(stage),
        )
        started = time.monotonic()
        ok = False
        resp: LLMResponse | None = None
        try:
            resp = await provider.generate(req)
            ok = True
            return resp
        finally:
            latency = int((time.monotonic() - started) * 1000)
            cost = (resp.cost_usd or 0.0) if resp else 0.0
            if resp:
                self.totals.calls += 1
                self.totals.tokens_in += resp.tokens_in
                self.totals.tokens_out += resp.tokens_out
                self.totals.cost_usd += cost
            logger.info(
                "llm call run=%s stage=%s %s:%s ok=%s in=%s (cached %s) out=%s cost=$%.4f %sms",
                self.run_id, stage, provider.name, model, ok, resp.tokens_in if resp else 0,
                resp.tokens_cached if resp else 0, resp.tokens_out if resp else 0, cost, latency,
            )  # fmt: skip
            if self.recorder is not None:
                await self.recorder(
                    LLMCallRecord(
                        run_id=self.run_id,
                        stage=stage,
                        provider=provider.name,
                        model=resp.model if resp and resp.model else model,
                        tokens_in=resp.tokens_in if resp else 0,
                        tokens_out=resp.tokens_out if resp else 0,
                        cost_usd=cost,
                        latency_ms=latency,
                        ok=ok,
                        tokens_cached=resp.tokens_cached if resp else 0,
                    )
                )

    # ---------- validated helpers ----------

    async def structured(
        self,
        stage: Stage,
        system: str,
        user_text: str,
        output: type[T],
        *,
        images: list[bytes] | None = None,
    ) -> T:
        """JSON output validated against `output`; one retry with the validation error."""
        schema = {"name": output.__name__, "schema": strict_schema(output)}
        # Also state the schema in the prompt: some providers ignore response_format.
        user_text = (
            f"{user_text}\n\nRespond with only a JSON object matching this JSON schema "
            f"(every property is required; use null where allowed):\n"
            f"{json.dumps(schema['schema'], separators=(',', ':'))}"
        )
        prompt = user_text
        error = ""
        for _attempt in range(2):
            resp = await self.call(stage, system, prompt, images=images, json_schema=schema)
            try:
                return output.model_validate(json.loads(_strip_fences(resp.text)))
            except (ValidationError, json.JSONDecodeError) as exc:
                error = _short_error(exc)
                logger.warning("invalid %s output (run=%s): %s", stage, self.run_id, error)
                prompt = (
                    f"{user_text}\n\nYour previous answer was invalid: {error}\n"
                    f"Reply again with only JSON matching the schema."
                )
        raise LLMOutputError(f"{stage} output invalid after retry: {error}")

    async def choose_tool(
        self,
        stage: Stage,
        system: str,
        user_text: str,
        tools: list[ToolDef],
        *,
        images: list[bytes] | None = None,
    ) -> tuple[ToolCall, BaseModel, str]:
        """Exactly one valid tool call. Returns (call, validated args, model's text/reasoning)."""
        by_name = {t.name: t for t in tools}
        specs = [t.spec() for t in tools]
        prompt = user_text
        error = ""
        for _attempt in range(2):
            resp = await self.call(stage, system, prompt, images=images, tools=specs)
            if resp.tool_calls:
                call = resp.tool_calls[0]
                tool = by_name.get(call.name)
                if tool is None:
                    error = f"unknown tool '{call.name}'"
                else:
                    try:
                        return call, tool.args.model_validate(call.args), resp.text.strip()
                    except ValidationError as exc:
                        error = f"invalid arguments for {call.name}: {_short_error(exc)}"
            else:
                error = "you did not call a tool"
            logger.warning("bad tool call (run=%s): %s", self.run_id, error)
            prompt = f"{user_text}\n\nProblem with your last reply: {error}. Call exactly one tool."
        raise LLMOutputError(f"{stage}: no valid tool call after retry ({error})")


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _short_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        return "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'root'}: {e['msg']}" for e in exc.errors()[:5]
        )
    return str(exc)[:300]
