"""
Encounter lifecycle route — mirrors app/api/encounter/route.ts.
POST: starts demo or live mode; GET: status; DELETE: reset.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from agents.runtime import ensure_agents_started
from bus import get_event_bus
from demo.injector import is_demo_running, run_demo_scenario, stop_demo
from redis_layer.keys import ENCOUNTER_ID
from redis_layer.state import reset_encounter

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/encounter")
async def start_encounter(request: Request):
    await ensure_agents_started()

    try:
        body = await request.json()
    except Exception:
        body = {}

    mode = "live" if body.get("mode") == "live" else "demo"
    encounter_id: str = body.get("encounterId") or ENCOUNTER_ID

    await reset_encounter(encounter_id)
    stop_demo(encounter_id)

    if mode == "demo":
        bus = get_event_bus()
        asyncio.create_task(_run_demo(bus, encounter_id))

    return JSONResponse({"encounterId": encounter_id, "mode": mode, "status": "started"})


async def _run_demo(bus, encounter_id: str) -> None:
    try:
        await run_demo_scenario(bus, encounter_id)
    except Exception as e:
        if str(e) != "aborted":
            logger.error("[encounter] demo error: %s", e)


@router.get("/api/encounter")
async def get_encounter(encounterId: str = ENCOUNTER_ID):
    return JSONResponse({
        "encounterId": encounterId,
        "demoRunning": is_demo_running(encounterId),
    })


@router.delete("/api/encounter")
async def delete_encounter(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    encounter_id: str = body.get("encounterId") or ENCOUNTER_ID
    stop_demo(encounter_id)
    await reset_encounter(encounter_id)
    return JSONResponse({"encounterId": encounter_id, "status": "reset"})
