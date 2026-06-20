"""
Handoff agent — mirrors lib/agents/handoff.ts.
Generates shift-change report on handoff.requested.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, List

from bus import InMemoryBus, RedisBus
from claude import call_claude_json
from events import (
    EVENT_CHANNELS,
    HandoffReport,
    SoapNote,
    TimelineEntry,
    entities_from_dict,
    handoff_from_dict,
    soap_from_dict,
    timeline_entry_from_dict,
    to_dict,
)
from prompts.handoff import HANDOFF_SYSTEM, build_handoff_prompt, heuristic_handoff
from redis_layer.keys import EncounterKeys
from redis_layer.state import get_transcript, load_json, save_json

logger = logging.getLogger(__name__)


async def start_handoff_agent(bus: InMemoryBus | RedisBus) -> Callable[[], None]:
    async def on_handoff_requested(envelope: dict) -> None:
        payload = envelope.get("payload", {})
        encounter_id = payload.get("encounterId", "")

        entities_raw = await load_json(EncounterKeys.facts(encounter_id))
        entities = entities_from_dict(entities_raw) if entities_raw else None

        timeline_raw = await load_json(EncounterKeys.timeline(encounter_id)) or []
        timeline: List[TimelineEntry] = [
            timeline_entry_from_dict(e) if isinstance(e, dict) else e for e in timeline_raw
        ]

        soap_raw = await load_json(EncounterKeys.soap(encounter_id))
        soap: SoapNote | None = soap_from_dict(soap_raw) if soap_raw else None

        transcript = await get_transcript(encounter_id)

        if entities:
            result = await call_claude_json(
                HANDOFF_SYSTEM,
                build_handoff_prompt(entities, timeline, transcript, soap),
                "handoff",
            )
            if result and isinstance(result, dict):
                report = handoff_from_dict(result)
            else:
                report = heuristic_handoff(entities, timeline)
        else:
            report = HandoffReport(
                patientSummary="Insufficient data collected during encounter.",
                timeline=timeline,
                currentMedications=[],
                outstandingQuestions=["Complete patient interview."],
                recommendedActions=["Continue assessment."],
                generatedAt=datetime.now(timezone.utc).isoformat(),
            )

        report.generatedAt = datetime.now(timezone.utc).isoformat()
        await save_json(EncounterKeys.handoff(encounter_id), to_dict(report))

        await bus.publish(EVENT_CHANNELS.HANDOFF_GENERATED, {
            "encounterId": encounter_id,
            "report": to_dict(report),
        })

    return await bus.subscribe(EVENT_CHANNELS.HANDOFF_REQUESTED, on_handoff_requested)
