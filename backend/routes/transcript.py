"""
Transcript ingestion route — mirrors app/api/transcript/route.ts.
POST: publishes transcript.segment events; GET: returns Deepgram key.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from agents.runtime import ensure_agents_started
from bus import get_event_bus
from events import EVENT_CHANNELS
from redis_layer.keys import ENCOUNTER_ID
from redis_layer.state import append_transcript

router = APIRouter()


@router.post("/api/transcript")
async def post_transcript(request: Request):
    await ensure_agents_started()

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    encounter_id: str = body.get("encounterId") or ENCOUNTER_ID
    text: str = body.get("text", "")
    speaker: str = body.get("speaker") or "unknown"

    if not text.strip():
        return JSONResponse({"error": "text required"}, status_code=400)

    timestamp = datetime.now(timezone.utc).isoformat()
    await append_transcript(encounter_id, f"[{speaker}] {text}")

    bus = get_event_bus()
    await bus.publish(EVENT_CHANNELS.TRANSCRIPT_SEGMENT, {
        "encounterId": encounter_id,
        "text": text,
        "speaker": speaker,
        "timestamp": timestamp,
    })

    return JSONResponse({"ok": True})


@router.get("/api/transcript")
async def get_deepgram_key_from_transcript():
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        return JSONResponse({"error": "Deepgram not configured"}, status_code=503)
    return JSONResponse({"key": key})
