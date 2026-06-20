# Dev C — Output & UI

**Branch:** `dev/c-ui`

You own the dashboard, Documentation/Research/Handoff agents, and all user-facing polish. You can start UI **immediately** from fixtures — no backend required for hours 0–6.

---

## Your deliverables

1. Next.js app shell with all 4 dashboard panels + disclaimer banner
2. `hooks/useEncounterEvents.ts` — WebSocket client, encounter state reducer
3. Documentation, Research, Handoff agents
4. Handoff modal (before/after money shot)
5. Live | Demo mode toggle in header

---

## Build order

| Order | Task | Done when |
|-------|------|-----------|
| 1 | Scaffold Next.js if missing (`create-next-app`) | `npm run dev` works |
| 2 | Dashboard layout — 4 panels from `fixtures/full-encounter-state.json` | Static UI looks like a clinical product |
| 3 | `hooks/useEncounterEvents.ts` — reducer for all event types | Mock dispatch updates panels |
| 4 | Wire WebSocket when Dev A ready; until then use mock hook | Live events update UI |
| 5 | `lib/agents/documentation.ts` — SOAP from facts + timeline | Bottom panel updates live |
| 6 | `lib/agents/research.ts` — Browserbase on new med | Citations in insights panel |
| 7 | `lib/agents/handoff.ts` + handoff modal | Button → before/after report |
| 8 | Polish — animations, severity colors, auto-scroll transcript | Demo-ready visuals |

---

## Files you touch

```
app/layout.tsx
app/page.tsx
app/globals.css
components/
  TranscriptPanel.tsx
  TimelinePanel.tsx
  InsightsPanel.tsx
  SoapPanel.tsx
  HandoffModal.tsx
  DisclaimerBanner.tsx
  ModeToggle.tsx
hooks/useEncounterEvents.ts
lib/agents/documentation.ts
lib/agents/research.ts
lib/agents/handoff.ts
lib/prompts/documentation.ts
lib/prompts/handoff.ts
app/api/handoff/route.ts
```

**Do not touch:** `lib/agents/extraction.ts`, `lib/agents/timeline.ts`, `lib/agents/safety.ts`, `app/api/ws/route.ts`

---

## Test in isolation (hour 0–6, no Dev A/B)

### Static UI from fixture

```typescript
import fixture from "@/fixtures/full-encounter-state.json";

// page.tsx — render all panels from fixture until WebSocket connected
```

### Mock event dispatcher

```typescript
// hooks/useEncounterEvents.ts
export function useMockEncounter() {
  const [state, dispatch] = useReducer(encounterReducer, initialState);

  useEffect(() => {
    // Replay fixture events with setTimeout to simulate live updates
  }, []);

  return state;
}
```

Toggle: `USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true"`

---

## Dashboard layout

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ Demo only — not for clinical use.          [Live | Demo] │
├──────────────┬──────────────────────────┬───────────────────┤
│  Transcript  │       Timeline           │  AI Insights      │
│  (left 25%)  │       (center 40%)       │  (right 35%)      │
├──────────────┴──────────────────────────┴───────────────────┤
│  SOAP Note (bottom, full width)                              │
├─────────────────────────────────────────────────────────────┤
│  [ Generate Handoff Report ]                                │
└─────────────────────────────────────────────────────────────┘
```

### Panel event subscriptions

| Panel | Events |
|-------|--------|
| Transcript | `transcript.segment` |
| Timeline | `timeline.updated`, `safety.flagged` (as timeline entries) |
| Insights | `safety.flagged`, `research.completed`, derived missing-info |
| SOAP | `note.updated` |
| Handoff modal | `handoff.generated` |

---

## Research agent (Browserbase)

Trigger: new medication name in `facts.extracted` not in Redis set `encounter:{id}:researched-meds`

Query template: `"{medication} drug interactions chest pain anticoagulation"`

Publish `research.completed` with 2–3 citations. Display in insights panel under "References".

---

## Handoff flow

1. User clicks "Generate Handoff Report"
2. UI POSTs `/api/handoff` → publishes `handoff.requested`
3. Handoff agent reads full Redis encounter state → Claude → `handoff.generated`
4. Modal shows split view: raw transcript (before) | structured report (after)

**End demo on this modal.**

---

## Visual polish checklist

- [ ] Dark sidebar / light content area
- [ ] Safety flags: red (high), amber (medium), blue (low)
- [ ] Timeline entries fade in
- [ ] Transcript auto-scrolls
- [ ] SOAP sections labeled S / O / A / P
- [ ] Loading skeletons while waiting for events

---

## Handoff to team

When static UI + mock replay works: share screenshot in Slack — Dev A/B see target state.

When handoff modal works: schedule integration rehearsal.
