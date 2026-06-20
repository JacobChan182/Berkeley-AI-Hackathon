import type {
  HandoffReport,
  MedicalEntities,
  TimelineEntry,
} from "@/lib/events";

export const HANDOFF_SYSTEM = `You are a shift handoff report generator for demo purposes only.
Return ONLY valid JSON:
{
  "patientSummary": string,
  "timeline": [{ "id": string, "timestamp": string, "summary": string }],
  "currentMedications": [{ "name": string }],
  "outstandingQuestions": string[],
  "recommendedActions": string[],
  "generatedAt": string (ISO)
}`;

export function buildHandoffPrompt(
  entities: MedicalEntities,
  timeline: TimelineEntry[],
  transcript: string,
  soap: { subjective: string; assessment: string; plan: string } | null
): string {
  return `Entities:\n${JSON.stringify(entities, null, 2)}\n\nTimeline:\n${JSON.stringify(timeline, null, 2)}\n\nSOAP:\n${JSON.stringify(soap, null, 2)}\n\nTranscript:\n${transcript}\n\nReturn handoff report JSON.`;
}

export function heuristicHandoff(
  entities: MedicalEntities,
  timeline: TimelineEntry[]
): HandoffReport {
  const age = entities.demographics?.age ?? "?";
  const sex = entities.demographics?.sex ?? "patient";

  return {
    patientSummary: `${age}-year-old ${sex} with ${entities.symptoms.join(", ") || "acute symptoms"}. PMH: ${entities.conditions.join(", ") || "none"}.`,
    timeline,
    currentMedications: entities.medications,
    outstandingQuestions: [
      "Current INR?",
      "Pain severity (1-10)?",
      "Any prior cardiac interventions beyond documented history?",
    ],
    recommendedActions: [
      "Stat ECG and troponin",
      "Cardiology consult",
      "Assess bleeding vs thrombotic risk before additional antiplatelet therapy",
    ],
    generatedAt: new Date().toISOString(),
  };
}
