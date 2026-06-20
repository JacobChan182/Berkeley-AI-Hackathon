"""
Demo scenario injector — mirrors lib/demo/injector.ts.
Replays demo-scenario.json beats on a timer using asyncio.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from bus import InMemoryBus, RedisBus
from events import EVENT_CHANNELS
from redis_layer.state import append_transcript

logger = logging.getLogger(__name__)


@dataclass
class DemoBeat:
    id: str
    delayMs: int
    speaker: str
    text: str


@dataclass
class DemoScenario:
    encounterId: str
    beats: List[DemoBeat]


_active_injectors: Dict[str, asyncio.Event] = {}


def stop_demo(encounter_id: str) -> None:
    event = _active_injectors.get(encounter_id)
    if event:
        event.set()
        _active_injectors.pop(encounter_id, None)


def is_demo_running(encounter_id: str) -> bool:
    return encounter_id in _active_injectors


def _load_scenario() -> DemoScenario:
    scenario_path = Path(__file__).parent.parent.parent / "scripts" / "demo-scenario.json"
    try:
        with open(scenario_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        beats = [DemoBeat(**b) for b in data["beats"]]
        return DemoScenario(encounterId=data["encounterId"], beats=beats)
    except Exception as e:
        logger.error("[demo] failed to load demo-scenario.json: %s", e)
        return DemoScenario(
            encounterId="demo-encounter-001",
            beats=[
                DemoBeat(id="b1", delayMs=0, speaker="doctor", text="Good morning. What brings you in today?"),
                DemoBeat(id="b2", delayMs=4000, speaker="patient", text="I have chest pain and I take warfarin."),
                DemoBeat(id="b3", delayMs=9000, speaker="doctor", text="Any shortness of breath? Age?"),
                DemoBeat(id="b4", delayMs=13000, speaker="patient", text="I'm 67. A little short of breath, left arm pain too."),
            ],
        )


async def run_demo_scenario(bus: InMemoryBus | RedisBus, encounter_id: str) -> None:
    stop_demo(encounter_id)

    abort_event = asyncio.Event()
    _active_injectors[encounter_id] = abort_event

    scenario = _load_scenario()
    beats = scenario.beats

    logger.info("[demo] starting replay for %s (%d beats)", encounter_id, len(beats))

    elapsed = 0
    for beat in beats:
        if abort_event.is_set():
            logger.info("[demo] replay aborted")
            return

        wait_ms = beat.delayMs - elapsed
        if wait_ms > 0:
            try:
                await asyncio.wait_for(
                    asyncio.shield(asyncio.ensure_future(abort_event.wait())),
                    timeout=wait_ms / 1000.0,
                )
                # If we get here, the event was set (aborted)
                logger.info("[demo] replay aborted during wait")
                return
            except asyncio.TimeoutError:
                pass  # Normal: timeout means we should continue

        elapsed = beat.delayMs

        if abort_event.is_set():
            return

        timestamp = datetime.now(timezone.utc).isoformat()
        try:
            await append_transcript(encounter_id, f"[{beat.speaker}] {beat.text}")
            await bus.publish(EVENT_CHANNELS.TRANSCRIPT_SEGMENT, {
                "encounterId": encounter_id,
                "text": beat.text,
                "speaker": beat.speaker,
                "timestamp": timestamp,
            })
            logger.debug("[demo] beat %s: %s: %s", beat.id, beat.speaker, beat.text[:60])
        except Exception as e:
            logger.error("[demo] failed to publish beat %s: %s", beat.id, e)

    _active_injectors.pop(encounter_id, None)
    logger.info("[demo] replay complete")
