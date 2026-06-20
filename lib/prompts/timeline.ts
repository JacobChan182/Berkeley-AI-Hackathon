import type { MedicalEntities, TimelineEntry } from "@/lib/events";

export const TIMELINE_SYSTEM = `You are a clinical timeline agent. Given medical entities and transcript context, produce chronological timeline entries.
Return ONLY valid JSON array of:
[{ "id": string, "timestamp": string (ISO), "summary": string, "source": "extraction" }]
Keep entries concise. Max 8 entries total when merging.`;

export function buildTimelinePrompt(
  entities: MedicalEntities,
  transcript: string,
  existing: TimelineEntry[]
): string {
  return `Existing timeline:\n${JSON.stringify(existing, null, 2)}\n\nEntities:\n${JSON.stringify(entities, null, 2)}\n\nTranscript excerpt:\n${transcript.slice(-1500)}\n\nReturn updated timeline JSON array. Use current time for new entries if needed.`;
}

export function heuristicTimeline(
  entities: MedicalEntities,
  existing: TimelineEntry[]
): TimelineEntry[] {
  const entries = [...existing];
  const now = new Date().toISOString();
  const add = (summary: string) => {
    if (entries.some((e) => e.summary.toLowerCase() === summary.toLowerCase())) return;
    entries.push({
      id: `tl-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now,
      summary,
      source: "extraction",
    });
  };

  if (entities.symptoms.includes("chest pain"))
    add("Patient reports acute chest pain");
  if (entities.conditions.includes("hypertension"))
    add("Hypertension history identified");
  if (entities.medications.some((m) => m.name.toLowerCase() === "lisinopril"))
    add("Lisinopril documented");
  if (entities.medications.some((m) => m.name.toLowerCase() === "warfarin"))
    add("Warfarin medication discovered");
  if (entities.symptoms.includes("left arm pain"))
    add("Left arm radiation noted");
  if (entities.symptoms.includes("shortness of breath"))
    add("Mild shortness of breath reported");

  return entries.slice(-12);
}
