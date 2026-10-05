"""OpenAI Chat Completions — used for OpenAI itself and any OpenAI-compatible reseller
(OpenRouter, Gemini's OpenAI endpoint, Groq...) via `base_url`."""

from __future__ import annotations

import base64
import json
from typing import Any

import openai

from agent.llm.prices import estimate_cost
from agent.llm.types import (
    LLMOutputError,
    LLMRefusal,
    LLMRequest,
    LLMResponse,
    LLMUnavailable,
    ToolCall,
)


class OpenAIChatProvider:
    def __init__(self, name: str, api_key: str, base_url: str | None = None) -> None:
        self.name = name
        self._base_url = base_url
        self._is_openrouter = bool(base_url and "openrouter.ai" in base_url)
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url, max_retries=2)

    async def generate(self, req: LLMRequest) -> LLMResponse:
        content: list[dict[str, Any]] = [{"type": "text", "text": req.user_text}]
        content += [
            {
                "type": "image_url",
                "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(img).decode()},
            }
            for img in req.images
        ]
        params: dict[str, Any] = {
            "model": req.model,
            "max_tokens": req.max_tokens,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": content},
            ],
        }
        if req.tools:
            params["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                        "strict": True,
                    },
                }
                for t in req.tools
            ]
            params["tool_choice"] = "auto"
            params["parallel_tool_calls"] = False
        if req.json_schema:
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": {**req.json_schema, "strict": True},
            }
        if self._is_openrouter:
            extra: dict[str, Any] = {}
            if req.effort:
                extra["reasoning"] = {"effort": req.effort}
            if req.tools or req.json_schema:
                # Only route to backends that honour tools / response_format.
                extra["provider"] = {"require_parameters": True}
            if extra:
                params["extra_body"] = extra

        try:
            resp = await self._client.chat.completions.create(**params)
        except (openai.RateLimitError, openai.APIConnectionError) as exc:
            raise LLMUnavailable(f"{self.name} unavailable: {exc}") from exc
        except openai.APIStatusError as exc:
            if exc.status_code in (401, 403):
                msg = f"{self.name} rejected the API key ({exc.status_code})"
                raise LLMUnavailable(msg) from exc
            if exc.status_code == 402:
                raise LLMUnavailable(f"{self.name} account is out of credits (402)") from exc
            if exc.status_code >= 500:
                raise LLMUnavailable(f"{self.name} server error {exc.status_code}") from exc
            raise

        if not resp.choices:
            raise LLMUnavailable(f"{self.name} returned no choices")
        choice = resp.choices[0]
        message = choice.message
        if getattr(message, "refusal", None) or choice.finish_reason == "content_filter":
            raise LLMRefusal("the model declined this request")
        calls = []
        for tc in message.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError as exc:
                raise LLMOutputError(f"tool arguments are not valid JSON: {exc}") from exc
            calls.append(ToolCall(name=tc.function.name, args=args))

        usage = resp.usage
        tokens_in = usage.prompt_tokens if usage else 0
        tokens_out = usage.completion_tokens if usage else 0
        reported = getattr(usage, "cost", None) if usage else None
        cost = (
            float(reported)
            if isinstance(reported, int | float)
            else await estimate_cost(
                req.model,
                tokens_in,
                tokens_out,
                openrouter_base=self._base_url if self._is_openrouter else None,
            )
        )
        return LLMResponse(
            text=message.content or "",
            tool_calls=calls,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost,
            stop_reason=choice.finish_reason,
            model=resp.model or req.model,
        )
