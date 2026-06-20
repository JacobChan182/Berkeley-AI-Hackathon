"""
Timeline agent — mirrors lib/agents/timeline.ts.
Reacts to facts.extracted and builds chronological clinical events.
"""
from __future__ import annotations

import logging
from typing import Callable, List

from bus import InMemoryBus, RedisBus
from claude import call_claude_json
from events import EVENT_CHANNELS, TimelineEntry, entities_from_dict, timeline_entry_from_dict, to_dict
from prompts.timeline import TIMELINE_SYSTEM, build_timeline_prompt, heuristic_timeline
from redis_layer.keys import EncounterKeys
from redis_layer.state import get_transcript, load_json, save_json

logger = logging.getLogger(__name__)


async def start_timeline_agent(bus: InMemoryBus | RedisBus) -> Callable[[], None]:
    async def on_facts_extracted(envelope: dict) -> None:
        payload = envelope.get("payload", {})
        encounter_id = payload.get("encounterId", "")
        entities_raw = payload.get("entities", {})
        entities = entities_from_dict(entities_raw)

        existing_raw = await load_json(EncounterKeys.timeline(encounter_id)) or []
        existing: List[TimelineEntry] = [
            timeline_entry_from_dict(e) if isinstance(e, dict) else e
            for e in existing_raw
        ]
        transcript = await get_transcript(encounter_id)

        result = await call_claude_json(
            TIMELINE_SYSTEM,
            build_timeline_prompt(entities, transcript, existing),
            "timeline",
        )

        if result and isinstance(result, list):
            events = [timeline_entry_from_dict(e) if isinstance(e, dict) else e for e in result]
        else:
            events = heuristic_timeline(entities, existing)

        if not isinstance(events, list):
            events = heuristic_timeline(entities, existing)

        await save_json(EncounterKeys.timeline(encounter_id), [to_dict(e) for e in events])
        await bus.publish(EVENT_CHANNELS.TIMELINE_UPDATED, {
            "encounterId": encounter_id,
            "events": [to_dict(e) for e in events],
        })

    return await bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, on_facts_extracted)
