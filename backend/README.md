# ER Copilot — Python Backend

This directory contains the Python/FastAPI backend that replaces the original TypeScript/Next.js backend logic.

## Structure

```
backend/
├── main.py                  # FastAPI app entry point
├── requirements.txt
├── events.py                # Shared event types (dataclasses)
├── bus.py                   # Event bus (Redis or in-memory)
├── claude.py                # Claude primary + NVIDIA NIM fallback
├── nim.py                   # NVIDIA NIM (integrate.api.nvidia.com)
├── debounce.py              # Async debounce utility
├── redis_layer/
│   ├── client.py            # Redis async client
│   ├── keys.py              # Redis key conventions
│   └── state.py             # State persistence (Redis or in-memory)
├── sse/
│   └── hub.py               # SSE fan-out hub (asyncio.Queue per client)
├── agents/
│   ├── runtime.py           # Agent lifecycle (startup/shutdown)
│   ├── extraction.py        # Extraction agent
│   ├── timeline.py          # Timeline agent
│   ├── safety.py            # Safety flagging agent
│   ├── documentation.py     # SOAP note documentation agent
│   ├── research.py          # Research agent (PubMed + mock citations)
│   └── handoff.py           # Handoff report agent
├── prompts/
│   ├── extraction.py        # Extraction prompts + heuristic fallback
│   ├── timeline.py          # Timeline prompts + heuristic fallback
│   ├── safety.py            # Safety prompts + heuristic fallback
│   ├── documentation.py     # SOAP prompts + heuristic fallback
│   └── handoff.py           # Handoff prompts + heuristic fallback
├── demo/
│   └── injector.py          # Demo scenario replay (asyncio)
└── routes/
    ├── events.py            # GET /api/events  (SSE stream)
    ├── encounter.py         # POST/GET/DELETE /api/encounter
    ├── transcript.py        # POST /api/transcript
    ├── handoff.py           # POST /api/handoff
    ├── status.py            # GET /api/status
    └── deepgram.py          # GET /api/deepgram
```

## Running

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Set environment variables

Copy the root `.env.example` to `.env` and fill in your keys:

```
ANTHROPIC_API_KEY=sk-ant-...
NVIDIA_API_KEY=nvapi-...      # optional NIM fallback
DEEPGRAM_API_KEY=...          # optional
REDIS_URL=redis://localhost:6379  # optional (in-memory fallback if omitted)
```

### 3. Start the Python backend

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Start the Next.js frontend

In a separate terminal from the repo root:

```bash
npm run dev
```

The Next.js dev server (port 3000) proxies all `/api/*` requests to the Python backend (port 8000) via the rewrite rule in `next.config.ts`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | SSE stream — all bus events |
| `POST` | `/api/encounter` | Start demo or live encounter |
| `GET` | `/api/encounter` | Encounter status |
| `DELETE` | `/api/encounter` | Reset encounter |
| `POST` | `/api/transcript` | Ingest transcript segment |
| `POST` | `/api/handoff` | Request handoff report |
| `GET` | `/api/status` | Service health check |
| `GET` | `/api/deepgram` | Deepgram API key proxy |
