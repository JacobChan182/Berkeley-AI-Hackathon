"""
Anthropic Claude wrapper — mirrors lib/claude.ts.
Retries once on rate-limit (429). Returns None on any unrecoverable error
so agents can fall through to heuristic fallbacks.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if api_key:
            import anthropic
            _client = anthropic.AsyncAnthropic(api_key=api_key)
    return _client


def has_claude() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


async def call_claude_json(system: str, user: str, agent_name: str) -> Optional[Any]:
    """
    Call Claude and parse the first JSON object or array from the response.
    Returns None on any unrecoverable error.
    """
    client = _get_client()
    if not client:
        return None

    full_system = (
        system
        + "\n\nIMPORTANT: Respond with ONLY the raw JSON — no markdown fences, no explanation."
    )

    for attempt in range(2):
        try:
            response = await client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=2048,
                system=full_system,
                messages=[{"role": "user", "content": user}],
            )

            raw = ""
            if response.content and response.content[0].type == "text":
                raw = response.content[0].text.strip()

            # Strip markdown fences if Claude ignored the instruction
            stripped = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
            stripped = re.sub(r"\s*```$", "", stripped).strip()

            # Match top-level object or array
            if re.match(r"^(\{[\s\S]*\}|\[[\s\S]*\])$", stripped):
                return json.loads(stripped)

            # Fallback: find the first JSON structure anywhere in the text
            embedded = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", stripped)
            if embedded:
                return json.loads(embedded.group(0))

            return None

        except Exception as e:
            status = getattr(e, "status_code", None)
            if status == 429 and attempt == 0:
                await asyncio.sleep(2.0)
                continue
            logger.warning("[claude/%s] error: %s", agent_name, e)
            return None

    return None
