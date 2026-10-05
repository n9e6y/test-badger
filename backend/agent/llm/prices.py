"""USD per million tokens. Used when the provider does not report cost itself.

Anthropic first-party rates as of 2026-09. OpenRouter reports cost per call; as a fallback its
public model list is fetched once. Override or add models with LLM_PRICE_OVERRIDES (JSON).
"""

from __future__ import annotations

import json
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# model id -> (input, output) USD per 1M tokens
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
}

_openrouter_cache: dict[str, tuple[float, float]] | None = None


def _overrides() -> dict[str, tuple[float, float]]:
    try:
        data = json.loads(get_settings().llm_price_overrides or "{}")
        return {k: (float(v[0]), float(v[1])) for k, v in data.items()}
    except (ValueError, TypeError, IndexError):
        logger.warning("LLM_PRICE_OVERRIDES is not valid JSON; ignoring it")
        return {}


async def _openrouter_prices(base_url: str) -> dict[str, tuple[float, float]]:
    global _openrouter_cache
    if _openrouter_cache is None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{base_url.rstrip('/')}/models")
                resp.raise_for_status()
            _openrouter_cache = {
                m["id"]: (
                    float(m["pricing"]["prompt"]) * 1e6,
                    float(m["pricing"]["completion"]) * 1e6,
                )
                for m in resp.json()["data"]
                if "pricing" in m
            }
        except (httpx.HTTPError, KeyError, ValueError):
            logger.warning("could not fetch OpenRouter prices", exc_info=True)
            _openrouter_cache = {}
    return _openrouter_cache


async def estimate_cost(
    model: str, tokens_in: int, tokens_out: int, *, openrouter_base: str | None = None
) -> float:
    table = {**PRICES, **_overrides()}
    if model not in table and openrouter_base:
        table.update(await _openrouter_prices(openrouter_base))
    if model not in table:
        logger.warning("no price known for model %s; recording cost 0", model)
        return 0.0
    price_in, price_out = table[model]
    return (tokens_in * price_in + tokens_out * price_out) / 1_000_000
