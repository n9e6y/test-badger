"""Anthropic Messages API (native SDK)."""

from __future__ import annotations

import base64
import json
from typing import Any

import anthropic

from agent.llm.prices import estimate_cost
from agent.llm.types import LLMRefusal, LLMRequest, LLMResponse, LLMUnavailable, ToolCall

# Models that run adaptive thinking and accept output_config.effort.
_EFFORT_MODELS = ("claude-opus-5", "claude-sonnet-5", "claude-fable-5")
# Models with server-side refusal fallbacks (`fallbacks: "default"`, Claude API only).
_FALLBACK_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"}
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, *, fallbacks: bool = True) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key or None, max_retries=2)
        self._fallbacks = fallbacks

    async def generate(self, req: LLMRequest) -> LLMResponse:
        content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.standard_b64encode(img).decode(),
                },
            }
            for img in req.images
        ]
        content.append({"type": "text", "text": req.user_text})
        params: dict[str, Any] = {
            "model": req.model,
            "max_tokens": req.max_tokens,
            "system": req.system,
            "messages": [{"role": "user", "content": content}],
        }
        if req.tools:
            # Forced tool_choice is rejected on current models: auto + strict + prompt steering.
            params["tools"] = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                    "strict": True,
                }
                for t in req.tools
            ]
            params["tool_choice"] = {"type": "auto", "disable_parallel_tool_use": True}
        output_config: dict[str, Any] = {}
        if req.json_schema:
            output_config["format"] = {"type": "json_schema", "schema": req.json_schema["schema"]}
        if req.effort and req.model.startswith(_EFFORT_MODELS):
            output_config["effort"] = req.effort
        if output_config:
            params["output_config"] = output_config

        try:
            if self._fallbacks and req.model in _FALLBACK_MODELS:
                msg = await self._client.beta.messages.create(
                    **params, betas=[_FALLBACK_BETA], fallbacks="default"
                )
            else:
                msg = await self._client.messages.create(**params)
        except (anthropic.RateLimitError, anthropic.APIConnectionError) as exc:
            raise LLMUnavailable(f"Anthropic unavailable: {exc}") from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code in (401, 403):
                raise LLMUnavailable(f"Anthropic rejected the API key ({exc.status_code})") from exc
            if exc.status_code == 402:
                raise LLMUnavailable("Anthropic account is out of credits (402)") from exc
            if exc.status_code >= 500:
                raise LLMUnavailable(f"Anthropic server error {exc.status_code}") from exc
            raise

        if msg.stop_reason == "refusal":
            raise LLMRefusal("the model declined this request")
        text = "".join(b.text for b in msg.content if b.type == "text")
        calls = [
            ToolCall(
                name=b.name, args=b.input if isinstance(b.input, dict) else json.loads(b.input)
            )
            for b in msg.content
            if b.type == "tool_use"
        ]
        tokens_in = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens or 0)
        tokens_out = msg.usage.output_tokens
        return LLMResponse(
            text=text,
            tool_calls=calls,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=await estimate_cost(msg.model, tokens_in, tokens_out),
            stop_reason=msg.stop_reason,
            model=msg.model,
        )
