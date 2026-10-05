"""Pydantic model -> strict JSON schema accepted by Anthropic strict tools / structured outputs
and OpenAI-style `strict: true` (inline refs, additionalProperties false, every key required)."""

from __future__ import annotations

import copy
from typing import Any

from pydantic import BaseModel

_DROP_KEYS = {"title", "default", "examples", "discriminator"}


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].rsplit("/", 1)[-1]
                return resolve(copy.deepcopy(defs[name]))
            out = {k: resolve(v) for k, v in node.items() if k not in _DROP_KEYS}
            if "properties" in node:
                # Property *names* are data, not keywords: never drop a field called "title".
                out["properties"] = {k: resolve(v) for k, v in node["properties"].items()}
            if out.get("type") == "object" or "properties" in out:
                out["type"] = "object"
                out.setdefault("properties", {})
                out["required"] = list(out["properties"])
                out["additionalProperties"] = False
            return out
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(raw)
