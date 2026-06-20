import type { MedicalEntities, Severity } from "@/lib/events";

export interface SafetyResult {
  concern: string;
  severity: Severity;
  rationale: string;
}

export const SAFETY_SYSTEM = `You are a clinical safety flagging agent for demo purposes only — not for actual diagnosis.
Given medical entities, identify potential concerns. Return ONLY valid JSON array (empty if none):
[{ "concern": string, "severity": "low"|"medium"|"high", "rationale": string }]
Focus on drug interactions, anticoagulation risks, and ACS red flags when applicable.`;

export function buildSafetyPrompt(entities: MedicalEntities): string {
  return `Entities:\n${JSON.stringify(entities, null, 2)}\n\nReturn safety flags JSON array.`;
}

export function heuristicSafety(entities: MedicalEntities): SafetyResult[] {
  const flags: SafetyResult[] = [];
  const meds = entities.medications.map((m) => m.name.toLowerCase());
  const symptoms = entities.symptoms.map((s) => s.toLowerCase());
  const hasWarfarin = meds.some((m) => m.includes("warfarin"));
  const hasChestPain = symptoms.some((s) => s.includes("chest pain"));
  const hasArmPain = symptoms.some((s) => s.includes("arm"));
  const age = entities.demographics?.age ?? 0;

  if (hasWarfarin && hasChestPain) {
    flags.push({
      concern: "Warfarin + chest pain — anticoagulation complicates ACS management",
      severity: "high",
      rationale:
        "Patient on warfarin presenting with chest pain. Balance bleeding vs thrombotic risk during ACS workup.",
    });
  }
  if (age >= 65 && hasChestPain && hasArmPain) {
    flags.push({
      concern: "ACS risk factors — age, chest pain, arm radiation",
      severity: "medium",
      rationale: "Classic ACS presentation features present. Expedite ECG and troponin.",
    });
  }
  return flags;
}
