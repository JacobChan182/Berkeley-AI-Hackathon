"""
NVIDIA NIM wrapper — OpenAI-compatible chat completions at integrate.api.nvidia.com.
Used as fallback when Anthropic is unavailable or returns no parseable JSON.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

import httpx

from llm_parse import parse_json_from_llm_text

logger = logging.getLogger(__name__)

NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_NIM_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"

JSON_SYSTEM_SUFFIX = (
    "\n\nIMPORTANT: Respond with ONLY the raw JSON — no markdown fences, no explanation."
)
NEMOTRON_JSON_SYSTEM_PREFIX = "detailed thinking off.\n"


def _nim_api_key() -> Optional[str]:
    return os.environ.get("NVIDIA_API_KEY") or os.environ.get("NIM_API_KEY")


def has_nim() -> bool:
    return bool(_nim_api_key())


def _nim_model() -> str:
    return os.environ.get("NIM_MODEL", DEFAULT_NIM_MODEL)


async def call_nim_json(system: str, user: str, agent_name: str) -> Optional[Any]:
    api_key = _nim_api_key()
    if not api_key:
        return None

    full_system = (
        NEMOTRON_JSON_SYSTEM_PREFIX
        + system
        + JSON_SYSTEM_SUFFIX
    )

    payload = {
        "model": _nim_model(),
        "messages": [
            {"role": "system", "content": full_system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 2048,
        "temperature": 0,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{NIM_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                )

            if response.status_code == 429 and attempt == 0:
                await asyncio.sleep(2.0)
                continue

            if response.status_code >= 400:
                logger.warning(
                    "[nim/%s] HTTP %s: %s",
                    agent_name,
                    response.status_code,
                    response.text[:500],
                )
                return None

            data = response.json()
            raw = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if not raw:
                return None

            return parse_json_from_llm_text(raw)

        except Exception as e:
            logger.warning("[nim/%s] error: %s", agent_name, e)
            return None

    return None
