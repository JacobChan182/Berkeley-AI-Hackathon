"""
Safety agent — mirrors lib/agents/safety.ts.
Reacts to facts.extracted and flags drug interactions/concerns.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, List

from bus import InMemoryBus, RedisBus
from claude import call_claude_json
from events import EVENT_CHANNELS, entities_from_dict, to_dict
from prompts.safety import SAFETY_SYSTEM, SafetyResult, build_safety_prompt, heuristic_safety
from redis_layer.keys import EncounterKeys
from redis_layer.state import load_json, save_json

logger = logging.getLogger(__name__)


def _safety_result_from_dict(d: dict) -> SafetyResult:
    return SafetyResult(
        concern=d.get("concern", ""),
        severity=d.get("severity", "low"),
        rationale=d.get("rationale", ""),
    )


async def start_safety_agent(bus: InMemoryBus | RedisBus) -> Callable[[], None]:
    async def on_facts_extracted(envelope: dict) -> None:
        payload = envelope.get("payload", {})
        encounter_id = payload.get("encounterId", "")
        entities = entities_from_dict(payload.get("entities", {}))

        prior_raw = await load_json(EncounterKeys.safety_flags(encounter_id)) or []
        prior: List[SafetyResult] = [
            _safety_result_from_dict(f) if isinstance(f, dict) else f for f in prior_raw
        ]

        result = await call_claude_json(
            SAFETY_SYSTEM,
            build_safety_prompt(entities),
            "safety",
        )

        if result and isinstance(result, list):
            flags = [_safety_result_from_dict(f) if isinstance(f, dict) else f for f in result]
        else:
            flags = heuristic_safety(entities)

        if not isinstance(flags, list):
            flags = heuristic_safety(entities)

        prior_concerns = {p.concern for p in prior}
        new_flags = [f for f in flags if f.concern not in prior_concerns]
        all_flags = prior + new_flags
        await save_json(EncounterKeys.safety_flags(encounter_id), [to_dict(f) for f in all_flags])

        for flag in new_flags:
            await bus.publish(EVENT_CHANNELS.SAFETY_FLAGGED, {
                "encounterId": encounter_id,
                "concern": flag.concern,
                "severity": flag.severity,
                "rationale": flag.rationale,
                "flaggedAt": datetime.now(timezone.utc).isoformat(),
            })

    return await bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, on_facts_extracted)
