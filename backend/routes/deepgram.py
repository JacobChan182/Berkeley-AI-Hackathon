"""
Deepgram key proxy route — mirrors app/api/deepgram/route.ts.
"""
from __future__ import annotations

import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/api/deepgram")
async def get_deepgram_key():
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        return JSONResponse({"error": "Deepgram not configured"}, status_code=503)
    return JSONResponse({"key": key})
