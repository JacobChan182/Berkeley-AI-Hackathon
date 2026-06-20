import type { MedicalEntities, SoapNote, TimelineEntry } from "@/lib/events";

export const DOCUMENTATION_SYSTEM = `You are a clinical documentation agent. Generate a SOAP note from entities and timeline.
Return ONLY valid JSON:
{ "subjective": string, "objective": string, "assessment": string, "plan": string }
Demo only — not for clinical use. Be concise.`;

export function buildDocumentationPrompt(
  entities: MedicalEntities,
  timeline: TimelineEntry[],
  transcript: string
): string {
  return `Entities:\n${JSON.stringify(entities, null, 2)}\n\nTimeline:\n${JSON.stringify(timeline, null, 2)}\n\nTranscript:\n${transcript.slice(-2000)}\n\nReturn SOAP JSON.`;
}

export function heuristicSoap(
  entities: MedicalEntities,
  timeline: TimelineEntry[]
): SoapNote {
  const age = entities.demographics?.age ?? "?";
  const sex = entities.demographics?.sex ?? "?";
  const meds = entities.medications.map((m) => m.name).join(", ") || "none documented";
  const symptoms = entities.symptoms.join(", ") || "unspecified";
  const conditions = entities.conditions.join(", ") || "none documented";

  return {
    subjective: `${age}${sex !== "?" ? sex[0].toUpperCase() : "?"}/${sex} with ${symptoms}. PMH: ${conditions}. Meds: ${meds}.`,
    objective: "Pending: ECG, troponin. Vitals not yet documented.",
    assessment:
      entities.symptoms.includes("chest pain") && entities.medications.some((m) => m.name.toLowerCase().includes("warfarin"))
        ? "Acute chest pain concerning for ACS in anticoagulated patient with cardiac history."
        : "Acute presentation under evaluation.",
    plan: "ECG, troponin, cardiology consult. Assess bleeding vs thrombotic risk before additional antiplatelet therapy.",
  };
}
