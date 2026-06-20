"""
SSE fan-out hub — mirrors lib/sse/hub.ts.

Each connected SSE client gets its own asyncio.Queue.
broadcast_to_clients() puts a message into every queue.
The FastAPI SSE route consumes from its own queue and streams to the browser.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Set

logger = logging.getLogger(__name__)

_queues: Set[asyncio.Queue] = set()


def add_sse_client(q: asyncio.Queue) -> None:
    _queues.add(q)


def remove_sse_client(q: asyncio.Queue) -> None:
    _queues.discard(q)


def broadcast_to_clients(envelope: Dict[str, Any]) -> None:
    data = json.dumps(envelope)
    dead: Set[asyncio.Queue] = set()
    for q in list(_queues):
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            dead.add(q)
        except Exception:
            dead.add(q)
    for q in dead:
        _queues.discard(q)


def get_client_count() -> int:
    return len(_queues)
