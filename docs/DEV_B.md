# Dev B — Clinical Brain

**Branch:** `dev/b-agents`

You own Extraction, Timeline, and Safety agents — all Claude-powered. No UI. No Deepgram. No Browserbase.

---

## Your deliverables

1. `lib/claude.ts` — shared Anthropic client wrapper
2. `lib/debounce.ts` — transcript buffer debounce (4s / 1.5s silence)
3. `lib/prompts/` — one file per agent with JSON schema output
4. Working agents: extraction → timeline + safety (parallel)

---

## Build order

| Order | Task | Done when |
|-------|------|-----------|
| 1 | `lib/claude.ts` — `callClaude(system, user, schema?)` | Returns parsed JSON |
| 2 | `lib/prompts/extraction.ts` — tune against scripted scenario | Fixture entities match expected meds/conditions |
| 3 | `lib/agents/extraction.ts` — debounce, call Claude, publish `facts.extracted`, persist to Redis | `run-local-bus.ts` logs entities |
| 4 | `lib/prompts/timeline.ts` + `lib/agents/timeline.ts` | Timeline entries on each extraction |
| 5 | `lib/prompts/safety.ts` + `lib/agents/safety.ts` | Warfarin + chest pain → high severity flag |
| 6 | Arize traces on each Claude call | Spans visible in Arize dashboard |

---

## Files you touch

```
lib/claude.ts
lib/debounce.ts
lib/prompts/extraction.ts
lib/prompts/timeline.ts
lib/prompts/safety.ts
lib/agents/extraction.ts
lib/agents/timeline.ts
lib/agents/safety.ts
```

**Do not touch:** `app/`, `components/`, `lib/agents/research.ts`, `lib/agents/handoff.ts`

---

## Test in isolation (no Dev A needed)

```bash
npx tsx scripts/run-local-bus.ts
```

This uses `createInMemoryBus()` and replays `demo-scenario.json`. Implement agents against this first; swap to Redis bus at hour 6 integration.

### Expected output at warfarin beat

```
[facts.extracted] medications: lisinopril, warfarin
[safety.flagged] high Warfarin + chest pain — anticoagulation complicates ACS management
[timeline.updated] Warfarin medication discovered | ...
```

Compare against `fixtures/full-encounter-state.json`.

---

## Extraction debounce logic

```typescript
// On each transcript.segment:
// 1. Append to in-memory + Redis buffer
// 2. Reset 4s timer
// 3. On timer fire OR 1.5s since last segment with punctuation → run extraction
// 4. Publish facts.extracted with full entities object (merge, don't replace blindly)
```

---

## Claude prompt rules

1. **Structured output only** — use JSON schema / tool use, never free text
2. **Idempotent merge** — prompt includes current entities + new transcript chunk
3. **Tune on scripted scenario** — warfarin must extract before beat 6 ends
4. **No diagnosis** — safety flags say "consider ACS workup", not "patient has MI"

### Extraction schema (reference)

```typescript
import type { MedicalEntities } from "@/lib/events";
// Claude must return MedicalEntities shape exactly
```

---

## Safety agent trigger conditions

Always evaluate on `facts.extracted`. Pre-scripted must-haves for demo:

| Condition | Flag |
|-----------|------|
| warfarin + chest pain | high — anticoagulation + ACS |
| age > 65 + chest pain + arm radiation | medium — ACS risk factors |

---

## Handoff to Dev C

When `facts.extracted`, `timeline.updated`, and `safety.flagged` fire reliably:

*"Clinical brain is live — subscribe in your agents and wire UI panels."*

---

## Arize (hour 14+)

Wrap `callClaude` with span per agent name. Log: input token count, latency, output validity (JSON parse success).
