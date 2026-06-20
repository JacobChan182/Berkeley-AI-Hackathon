"""
SSE events route — mirrors app/api/events/route.ts.
Streams all bus events to connected clients via Server-Sent Events.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from agents.runtime import ensure_agents_started
from sse.hub import add_sse_client, remove_sse_client

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/events")
async def events():
    await ensure_agents_started()

    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    add_sse_client(queue)

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial connected message
        yield f"data: {json.dumps({'channel': 'connected', 'payload': {'ok': True}})}\n\n"

        try:
            while True:
                try:
                    # Wait for a message with a 15s timeout for heartbeats
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        except GeneratorExit:
            pass
        finally:
            remove_sse_client(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
