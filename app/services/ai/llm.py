"""Thin LLM client (Anthropic Messages API or OpenAI Chat Completions) over httpx.

The product works without any key: callers fall back to rule-based output and the
UI says so. Usage (tokens) is logged to ai_usage for cost tracking.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import httpx

from config import settings
from postgres_repo import execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


def provider() -> str | None:
    pref = (settings.llm_provider or "auto").lower()
    if pref == "none":
        return None
    if pref in ("anthropic", "auto") and settings.anthropic_api_key:
        return "anthropic"
    if pref in ("openai", "auto") and settings.openai_api_key:
        return "openai"
    return None


def model_name() -> str | None:
    p = provider()
    if p is None:
        return None
    if settings.llm_model:
        return settings.llm_model
    return "claude-sonnet-4-5" if p == "anthropic" else "gpt-4o-mini"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


async def _log_usage(feature: str, prov: str, model: str, usage: dict[str, Any], match_id: str | None) -> None:
    try:
        await execute(
            "INSERT INTO ai_usage (feature, provider, model, input_tokens, output_tokens, match_id) VALUES ($1,$2,$3,$4,$5,$6)",
            feature, prov, model, int(usage.get("input", 0)), int(usage.get("output", 0)), match_id,
        )
    except Exception as exc:
        logger.warning("ai_usage log failed: %s", exc)


async def complete(system: str, messages: list[dict[str, str]], *, feature: str, match_id: str | None = None,
                   max_tokens: int = 1200, json_mode: bool = False) -> str | None:
    prov = provider()
    model = model_name()
    if prov is None or model is None:
        return None
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            if prov == "anthropic":
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01",
                             "content-type": "application/json"},
                    json={"model": model, "max_tokens": max_tokens, "system": system, "messages": messages},
                )
                resp.raise_for_status()
                data = resp.json()
                text = "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
                u = data.get("usage", {})
                await _log_usage(feature, prov, model, {"input": u.get("input_tokens", 0), "output": u.get("output_tokens", 0)}, match_id)
                return text
            body: dict[str, Any] = {"model": model, "max_tokens": max_tokens,
                                    "messages": [{"role": "system", "content": system}, *messages]}
            if json_mode:
                body["response_format"] = {"type": "json_object"}
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"authorization": f"Bearer {settings.openai_api_key}", "content-type": "application/json"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            u = data.get("usage", {})
            await _log_usage(feature, prov, model, {"input": u.get("prompt_tokens", 0), "output": u.get("completion_tokens", 0)}, match_id)
            return data["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.warning("LLM call failed (%s/%s): %s", prov, model, exc)
        return None


def extract_json(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None
