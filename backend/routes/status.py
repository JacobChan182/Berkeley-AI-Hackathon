"""
Health/status route — mirrors app/api/status/route.ts.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from redis_layer.client import is_redis_available, ping_redis
from sse.hub import get_client_count

router = APIRouter()


@router.get("/api/status")
async def status():
    redis_ok = await ping_redis()

    return JSONResponse({
        "ok": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {
            "redis": {
                "configured": is_redis_available(),
                "connected": redis_ok,
                "note": "connected" if redis_ok else "using in-memory fallback",
            },
            "deepgram": {
                "configured": bool(os.environ.get("DEEPGRAM_API_KEY")),
                "note": (
                    "key present — live mic uses Deepgram"
                    if os.environ.get("DEEPGRAM_API_KEY")
                    else "no key — live mic uses Web Speech API fallback"
                ),
            },
            "anthropic": {
                "configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
                "note": (
                    "key present — agents use Claude"
                    if os.environ.get("ANTHROPIC_API_KEY")
                    else "no key — agents use heuristic fallbacks"
                ),
            },
            "browserbase": {
                "configured": bool(os.environ.get("BROWSERBASE_API_KEY")),
                "note": (
                    "key present — research agent active"
                    if os.environ.get("BROWSERBASE_API_KEY")
                    else "no key — research uses mock citations"
                ),
            },
        },
        "sse": {
            "connectedClients": get_client_count(),
        },
    })
