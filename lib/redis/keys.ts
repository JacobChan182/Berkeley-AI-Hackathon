/**
 * Redis key conventions — shared across all devs.
 */

export const ENCOUNTER_ID = "demo-encounter-001";

export function encounterKey(encounterId: string, suffix: string): string {
  return `encounter:${encounterId}:${suffix}`;
}

export const EncounterKeys = {
  transcript: (id: string) => encounterKey(id, "transcript"),
  buffer: (id: string) => encounterKey(id, "buffer"),
  facts: (id: string) => encounterKey(id, "facts"),
  timeline: (id: string) => encounterKey(id, "timeline"),
  safetyFlags: (id: string) => encounterKey(id, "safety"),
  soap: (id: string) => encounterKey(id, "soap"),
  research: (id: string) => encounterKey(id, "research"),
  researchedMeds: (id: string) => encounterKey(id, "researched-meds"),
  handoff: (id: string) => encounterKey(id, "handoff"),
} as const;

/** Pub/sub channel prefix — full channel is `${PUBSUB_PREFIX}${eventChannel}` */
export const PUBSUB_PREFIX = "er-copilot:";

export function pubsubChannel(eventChannel: string): string {
  return `${PUBSUB_PREFIX}${eventChannel}`;
}
