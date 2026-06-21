"""
LLM configuration — Anthropic model defaults and per-agent overrides.

All models can be overridden via environment variables:
  ANTHROPIC_MODEL_DEFAULT     — global default (overrides HAIKU_MODEL / SONNET_MODEL)
  ANTHROPIC_MODEL_SAFETY      — safety agent
  ANTHROPIC_MODEL_HANDOFF     — handoff agent
  ANTHROPIC_MODEL_TIMELINE    — timeline / extraction agent
  ANTHROPIC_MODEL_VISION      — vision / camera agent

Env vars take precedence over the defaults below.
"""
from __future__ import annotations

import os

# ── Defaults ──────────────────────────────────────────────────────────────────
HAIKU_MODEL: str = "claude-haiku-4-5"
SONNET_MODEL: str = "claude-sonnet-4-6"
LOCAL_MODEL: str = "google/gemma-4-12b-qat"

# ── Per-agent models (env > default) ─────────────────────────────────────────
AGENT_MODELS: dict[str, str] = {
    "extraction": os.environ.get("ANTHROPIC_MODEL_EXTRACTION", LOCAL_MODEL),
    "safety": os.environ.get("ANTHROPIC_MODEL_SAFETY", LOCAL_MODEL),
    "handoff": os.environ.get("ANTHROPIC_MODEL_HANDOFF", LOCAL_MODEL),
    "timeline": os.environ.get("ANTHROPIC_MODEL_TIMELINE", LOCAL_MODEL),
    "vision": os.environ.get("ANTHROPIC_MODEL_VISION", LOCAL_MODEL),
}

# ── Per-agent max tokens (env > default) ──────────────────────────────────────
AGENT_MAX_TOKENS: dict[str, int] = {
    "handoff": int(os.environ.get("ANTHROPIC_MAX_TOKENS_HANDOFF", "4096")),
    "safety": int(os.environ.get("ANTHROPIC_MAX_TOKENS_SAFETY", "2048")),
}


def get_model(agent_name: str) -> str:
    """Return the model name for a given agent."""
    model = AGENT_MODELS.get(agent_name)
    if not model:
        print(f"No model exists for {agent_name}")
        return HAIKU_MODEL
    print(f"Using model {model}")
    return model


def get_max_tokens(agent_name: str) -> int:
    """Return the max tokens for a given agent."""
    env_key = f"ANTHROPIC_MAX_TOKENS_{agent_name.upper()}"
    return AGENT_MAX_TOKENS.get(agent_name, int(os.environ.get(f"ANTHROPIC_MAX_TOKENS_{agent_name.upper()}", "2048")))
