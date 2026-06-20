"""
Handoff trigger route — mirrors app/api/handoff/route.ts.
POST: publishes handoff.requested event.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from agents.runtime import ensure_agents_started
from bus import get_event_bus
from events import EVENT_CHANNELS
from redis_layer.keys import ENCOUNTER_ID

router = APIRouter()


@router.post("/api/handoff")
async def request_handoff(request: Request):
    await ensure_agents_started()

    try:
        body = await request.json()
    except Exception:
        body = {}

    encounter_id: str = body.get("encounterId") or ENCOUNTER_ID

    bus = get_event_bus()
    await bus.publish(EVENT_CHANNELS.HANDOFF_REQUESTED, {
        "encounterId": encounter_id,
        "requestedAt": datetime.now(timezone.utc).isoformat(),
    })

    return JSONResponse({"encounterId": encounter_id, "status": "handoff_requested"})
