/**
 * SHARED CONTRACT — sync in #engineering before changing.
 * All agents and the dashboard import from this file only.
 */

// ─── Primitives ─────────────────────────────────────────────────────────────

export type Speaker = "doctor" | "patient" | "unknown";

export type Severity = "low" | "medium" | "high";

export interface TimelineEntry {
  id: string;
  timestamp: string; // ISO 8601
  summary: string;
  source?: "extraction" | "safety" | "manual";
}

export interface Medication {
  name: string;
  dose?: string;
  frequency?: string;
}

export interface MedicalEntities {
  medications: Medication[];
  conditions: string[];
  allergies: string[];
  vitals: Record<string, string>;
  symptoms: string[];
  demographics?: {
    age?: number;
    sex?: string;
  };
}

export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface HandoffReport {
  patientSummary: string;
  timeline: TimelineEntry[];
  currentMedications: Medication[];
  outstandingQuestions: string[];
  recommendedActions: string[];
  generatedAt: string; // ISO 8601
}

// ─── Event payloads ─────────────────────────────────────────────────────────

export interface TranscriptSegmentPayload {
  encounterId: string;
  text: string;
  speaker: Speaker;
  timestamp: string;
}

export interface FactsExtractedPayload {
  encounterId: string;
  entities: MedicalEntities;
  extractedAt: string;
}

export interface TimelineUpdatedPayload {
  encounterId: string;
  events: TimelineEntry[];
}

export interface SafetyFlaggedPayload {
  encounterId: string;
  concern: string;
  severity: Severity;
  rationale: string;
  flaggedAt: string;
}

export interface NoteUpdatedPayload {
  encounterId: string;
  soap: SoapNote;
  updatedAt: string;
}

export interface ResearchCompletedPayload {
  encounterId: string;
  query: string;
  findings: string;
  citations: Citation[];
  completedAt: string;
}

export interface HandoffRequestedPayload {
  encounterId: string;
  requestedAt: string;
}

export interface HandoffGeneratedPayload {
  encounterId: string;
  report: HandoffReport;
}

// ─── Event map (channel name → payload type) ────────────────────────────────

export const EVENT_CHANNELS = {
  TRANSCRIPT_SEGMENT: "transcript.segment",
  FACTS_EXTRACTED: "facts.extracted",
  TIMELINE_UPDATED: "timeline.updated",
  SAFETY_FLAGGED: "safety.flagged",
  NOTE_UPDATED: "note.updated",
  RESEARCH_COMPLETED: "research.completed",
  HANDOFF_REQUESTED: "handoff.requested",
  HANDOFF_GENERATED: "handoff.generated",
} as const;

export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];

export interface EventPayloadMap {
  [EVENT_CHANNELS.TRANSCRIPT_SEGMENT]: TranscriptSegmentPayload;
  [EVENT_CHANNELS.FACTS_EXTRACTED]: FactsExtractedPayload;
  [EVENT_CHANNELS.TIMELINE_UPDATED]: TimelineUpdatedPayload;
  [EVENT_CHANNELS.SAFETY_FLAGGED]: SafetyFlaggedPayload;
  [EVENT_CHANNELS.NOTE_UPDATED]: NoteUpdatedPayload;
  [EVENT_CHANNELS.RESEARCH_COMPLETED]: ResearchCompletedPayload;
  [EVENT_CHANNELS.HANDOFF_REQUESTED]: HandoffRequestedPayload;
  [EVENT_CHANNELS.HANDOFF_GENERATED]: HandoffGeneratedPayload;
}

export type EventEnvelope<C extends EventChannel = EventChannel> = {
  channel: C;
  payload: EventPayloadMap[C];
};

export function createEvent<C extends EventChannel>(
  channel: C,
  payload: EventPayloadMap[C]
): EventEnvelope<C> {
  return { channel, payload };
}
