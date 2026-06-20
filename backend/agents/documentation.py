"""
Documentation agent — mirrors lib/agents/documentation.ts.
Debounced on facts/timeline updates; generates live SOAP note.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, List

from bus import InMemoryBus, RedisBus
from claude import call_claude_json
from debounce import schedule_debounce
from events import EVENT_CHANNELS, SoapNote, TimelineEntry, entities_from_dict, timeline_entry_from_dict, to_dict
from prompts.documentation import DOCUMENTATION_SYSTEM, build_documentation_prompt, heuristic_soap
from redis_layer.keys import EncounterKeys
from redis_layer.state import get_transcript, load_json, save_json

logger = logging.getLogger(__name__)

DOC_DELAY_MS = 8000


async def start_documentation_agent(bus: InMemoryBus | RedisBus) -> Callable[[], None]:
    async def run_doc(encounter_id: str) -> None:
        entities_raw = await load_json(EncounterKeys.facts(encounter_id))
        if not entities_raw:
            return
        entities = entities_from_dict(entities_raw)

        timeline_raw = await load_json(EncounterKeys.timeline(encounter_id)) or []
        timeline: List[TimelineEntry] = [
            timeline_entry_from_dict(e) if isinstance(e, dict) else e for e in timeline_raw
        ]
        transcript = await get_transcript(encounter_id)

        result = await call_claude_json(
            DOCUMENTATION_SYSTEM,
            build_documentation_prompt(entities, timeline, transcript),
            "documentation",
        )

        if result and isinstance(result, dict):
            soap = SoapNote(
                subjective=result.get("subjective", ""),
                objective=result.get("objective", ""),
                assessment=result.get("assessment", ""),
                plan=result.get("plan", ""),
            )
        else:
            soap = heuristic_soap(entities, timeline)

        await save_json(EncounterKeys.soap(encounter_id), to_dict(soap))
        await bus.publish(EVENT_CHANNELS.NOTE_UPDATED, {
            "encounterId": encounter_id,
            "soap": to_dict(soap),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    def trigger(encounter_id: str) -> None:
        schedule_debounce(
            f"doc:{encounter_id}",
            DOC_DELAY_MS,
            2000,
            encounter_id,
            lambda: run_doc(encounter_id),
        )

    async def on_facts(envelope: dict) -> None:
        trigger(envelope.get("payload", {}).get("encounterId", ""))

    async def on_timeline(envelope: dict) -> None:
        trigger(envelope.get("payload", {}).get("encounterId", ""))

    unsub1 = await bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, on_facts)
    unsub2 = await bus.subscribe(EVENT_CHANNELS.TIMELINE_UPDATED, on_timeline)

    def stop() -> None:
        unsub1()
        unsub2()

    return stop
