# Dev A — Voice & Bus

**Branch:** `dev/a-voice`

You own everything that gets data *into* the system and *out* to the browser via WebSocket. No Claude calls. No UI components.

---

## Your deliverables

1. Redis client + `EventBus` implementation in `lib/bus.ts` (replace in-memory for production)
2. WebSocket route at `app/api/ws/route.ts`
3. Demo Mode injector at `app/api/encounter/route.ts` + `scripts/demo-injector.ts`
4. Deepgram live mic streaming → `transcript.segment`
5. Transcript buffer writes to `encounter:{id}:buffer` on each segment

---

## Build order

| Order | Task | Done when |
|-------|------|-----------|
| 1 | `lib/redis/client.ts` — connect with `REDIS_URL` | `redis.ping()` works |
| 2 | Extend `lib/bus.ts` — `createRedisBus()` publish/subscribe | Two terminal test: publish → subscribe logs |
| 3 | `app/api/ws/route.ts` — subscribe all channels, forward to WS clients | Browser DevTools shows events |
| 4 | Demo injector — read `scripts/demo-scenario.json`, publish segments with delays | POST `/api/encounter` `{mode:"demo"}` triggers replay |
| 5 | Deepgram WebSocket from browser → API → publish segments | Live mic shows in WebSocket |
| 6 | Append each segment to Redis buffer key | Dev B can read buffer |

---

## Files you touch

```
lib/redis/client.ts          ← create
lib/bus.ts                   ← add createRedisBus()
lib/agents/transcription.ts  ← implement
app/api/ws/route.ts          ← create
app/api/encounter/route.ts   ← create
scripts/demo-injector.ts     ← create
```

**Do not touch:** `lib/agents/extraction.ts`, `components/`, `lib/prompts/`

---

## Test in isolation

```bash
# Terminal 1 — start Next.js
npm run dev

# Terminal 2 — trigger demo replay
curl -X POST http://localhost:3000/api/encounter -H "Content-Type: application/json" -d '{"mode":"demo"}'

# Terminal 3 — watch Redis
redis-cli PSUBSCRIBE 'er-copilot:*'
```

WebSocket test in browser console:

```javascript
const ws = new WebSocket(`ws://${location.host}/api/ws`);
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## Deepgram integration sketch

```typescript
// Browser captures mic → sends audio chunks to your API route
// API route opens Deepgram live connection, on transcript:
await bus.publish(EVENT_CHANNELS.TRANSCRIPT_SEGMENT, {
  encounterId,
  text: transcript,
  speaker: mapSpeaker(dgSpeaker), // doctor | patient | unknown
  timestamp: new Date().toISOString(),
});
```

Speaker diarization: map Deepgram speaker index 0/1 to doctor/patient (configurable in UI later).

---

## Handoff to Dev B

When demo injector works, message Dev B: *"Bus is live — subscribe to `transcript.segment` on Redis or use `run-local-bus.ts` until integrated."*

---

## Handoff to Dev C

When WebSocket works, message Dev C: *"Connect to `/api/ws` — you'll receive `{ channel, payload }` envelopes."*
