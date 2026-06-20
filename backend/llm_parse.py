"""Shared JSON extraction from LLM text responses."""
from __future__ import annotations

import json
import re
from typing import Any, Optional


def parse_json_from_llm_text(raw: str) -> Optional[Any]:
    stripped = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped).strip()

    if re.match(r"^(\{[\s\S]*\}|\[[\s\S]*\])$", stripped):
        return json.loads(stripped)

    embedded = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", stripped)
    if embedded:
        return json.loads(embedded.group(0))

    return None
