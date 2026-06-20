"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  Citation,
  EventEnvelope,
  HandoffReport,
  MedicalEntities,
  SafetyFlaggedPayload,
  SoapNote,
  Speaker,
  TimelineEntry,
  TranscriptSegmentPayload,
} from "@/lib/events";
import { EVENT_CHANNELS } from "@/lib/events";
import { ENCOUNTER_ID } from "@/lib/redis/keys";

export interface TranscriptLine {
  speaker: Speaker;
  text: string;
  timestamp: string;
}

export interface EncounterState {
  encounterId: string;
  connected: boolean;
  transcript: TranscriptLine[];
  entities: MedicalEntities | null;
  timeline: TimelineEntry[];
  safetyFlags: SafetyFlaggedPayload[];
  soap: SoapNote | null;
  research: Array<{
    query: string;
    findings: string;
    citations: Citation[];
    completedAt: string;
  }>;
  handoff: HandoffReport | null;
  mode: "idle" | "demo" | "live";
  loading: boolean;
}

const initialEntities: MedicalEntities = {
  medications: [],
  conditions: [],
  allergies: [],
  vitals: {},
  symptoms: [],
};

export const initialEncounterState: EncounterState = {
  encounterId: ENCOUNTER_ID,
  connected: false,
  transcript: [],
  entities: null,
  timeline: [],
  safetyFlags: [],
  soap: null,
  research: [],
  handoff: null,
  mode: "idle",
  loading: false,
};

type Action =
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "SET_MODE"; mode: EncounterState["mode"] }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "RESET" }
  | { type: "EVENT"; envelope: EventEnvelope };

function reducer(state: EncounterState, action: Action): EncounterState {
  switch (action.type) {
    case "CONNECTED":
      return { ...state, connected: true };
    case "DISCONNECTED":
      return { ...state, connected: false };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "RESET":
      return { ...initialEncounterState, connected: state.connected, encounterId: state.encounterId };
    case "EVENT":
      return applyEvent(state, action.envelope);
    default:
      return state;
  }
}

function applyEvent(state: EncounterState, envelope: EventEnvelope): EncounterState {
  switch (envelope.channel) {
    case EVENT_CHANNELS.TRANSCRIPT_SEGMENT: {
      const p = envelope.payload as TranscriptSegmentPayload;
      return {
        ...state,
        transcript: [...state.transcript, { speaker: p.speaker, text: p.text, timestamp: p.timestamp }],
      };
    }
    case EVENT_CHANNELS.FACTS_EXTRACTED: {
      const p = envelope.payload as import("@/lib/events").FactsExtractedPayload;
      return { ...state, entities: p.entities };
    }
    case EVENT_CHANNELS.TIMELINE_UPDATED: {
      const p = envelope.payload as import("@/lib/events").TimelineUpdatedPayload;
      return { ...state, timeline: p.events };
    }
    case EVENT_CHANNELS.SAFETY_FLAGGED: {
      const p = envelope.payload as import("@/lib/events").SafetyFlaggedPayload;
      return {
        ...state,
        safetyFlags: [...state.safetyFlags, p],
        timeline: [
          ...state.timeline,
          {
            id: `safety-${p.flaggedAt}`,
            timestamp: p.flaggedAt,
            summary: `⚠ ${p.concern}`,
            source: "safety" as const,
          },
        ],
      };
    }
    case EVENT_CHANNELS.NOTE_UPDATED: {
      const p = envelope.payload as import("@/lib/events").NoteUpdatedPayload;
      return { ...state, soap: p.soap };
    }
    case EVENT_CHANNELS.RESEARCH_COMPLETED: {
      const p = envelope.payload as import("@/lib/events").ResearchCompletedPayload;
      return {
        ...state,
        research: [
          ...state.research,
          {
            query: p.query,
            findings: p.findings,
            citations: p.citations,
            completedAt: p.completedAt,
          },
        ],
      };
    }
    case EVENT_CHANNELS.HANDOFF_GENERATED: {
      const p = envelope.payload as import("@/lib/events").HandoffGeneratedPayload;
      return { ...state, handoff: p.report, loading: false };
    }
    default:
      return state;
  }
}

export function useEncounterEvents() {
  const [state, dispatch] = useReducer(reducer, initialEncounterState);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/events");
    sourceRef.current = source;

    source.onopen = () => dispatch({ type: "CONNECTED" });
    source.onerror = () => dispatch({ type: "DISCONNECTED" });

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { channel: string; payload?: unknown };
        if (parsed.channel === "connected") return;
        dispatch({ type: "EVENT", envelope: parsed as EventEnvelope });
      } catch {
        /* ignore parse errors */
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  const startEncounter = useCallback(async (mode: "demo" | "live") => {
    dispatch({ type: "RESET" });
    dispatch({ type: "SET_MODE", mode });
    dispatch({ type: "SET_LOADING", loading: mode === "demo" });

    await fetch("/api/encounter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, encounterId: ENCOUNTER_ID }),
    });

    if (mode === "demo") {
      setTimeout(() => dispatch({ type: "SET_LOADING", loading: false }), 26000);
    }
  }, []);

  const requestHandoff = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    await fetch("/api/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encounterId: ENCOUNTER_ID }),
    });
  }, []);

  const pushTranscript = useCallback(async (text: string, speaker: Speaker) => {
    await fetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker, encounterId: ENCOUNTER_ID }),
    });
  }, []);

  const missingInfo = getMissingInfo(state.entities ?? initialEntities);

  return {
    state,
    missingInfo,
    startEncounter,
    requestHandoff,
    pushTranscript,
  };
}

function getMissingInfo(entities: MedicalEntities): string[] {
  const missing: string[] = [];
  if (!entities.demographics?.age) missing.push("Patient age");
  if (entities.vitals && Object.keys(entities.vitals).length === 0)
    missing.push("Vital signs");
  if (!entities.symptoms.some((s) => s.includes("severity")))
    missing.push("Pain severity (1-10)");
  if (entities.medications.some((m) => m.name.toLowerCase().includes("warfarin")))
    missing.push("Current INR");
  return missing;
}
