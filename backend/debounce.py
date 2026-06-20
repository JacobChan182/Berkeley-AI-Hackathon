"""
Debounce utility — mirrors lib/debounce.ts using asyncio Tasks.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Callable, Coroutine, Any, Dict, Optional

logger = logging.getLogger(__name__)


class DebounceState:
    def __init__(self) -> None:
        self.task: Optional[asyncio.Task] = None
        self.last_text: str = ""
        self.last_activity: float = time.monotonic()


_states: Dict[str, DebounceState] = {}


def schedule_debounce(
    key: str,
    delay_ms: int,
    silence_ms: int,
    text: str,
    on_fire: Callable[[], Coroutine[Any, Any, None]],
) -> None:
    now = time.monotonic()
    state = _states.get(key)
    if state is None:
        state = DebounceState()
        state.last_activity = now
        _states[key] = state

    state.last_text = text
    state.last_activity = now

    if state.task and not state.task.done():
        state.task.cancel()

    ends_with_boundary = bool(re.search(r"[.?!]\s*$", text.strip()))
    effective_delay_s = (min(silence_ms, delay_ms) if ends_with_boundary else delay_ms) / 1000.0

    async def _run() -> None:
        try:
            await asyncio.sleep(effective_delay_s)
            current = _states.get(key)
            if current is None:
                return
            if time.monotonic() - current.last_activity < effective_delay_s - 0.05:
                return
            await on_fire()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("[debounce] error in %s: %s", key, e)

    state.task = asyncio.create_task(_run())


def clear_debounce(key: str) -> None:
    state = _states.pop(key, None)
    if state and state.task and not state.task.done():
        state.task.cancel()
