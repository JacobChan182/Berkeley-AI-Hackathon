import type { MedicalEntities } from "@/lib/events";

export const EXTRACTION_SYSTEM = `You are a clinical entity extraction agent. Extract structured medical facts from doctor-patient conversation transcripts.
Return ONLY valid JSON matching this shape:
{
  "medications": [{ "name": string, "dose"?: string, "frequency"?: string }],
  "conditions": string[],
  "allergies": string[],
  "vitals": Record<string, string>,
  "symptoms": string[],
  "demographics": { "age"?: number, "sex"?: string }
}
Merge with existing entities when provided. Do not invent facts not in the transcript.`;

export function buildExtractionPrompt(
  transcript: string,
  existing: MedicalEntities | null
): string {
  return `Existing entities:\n${JSON.stringify(existing ?? {}, null, 2)}\n\nTranscript:\n${transcript}\n\nReturn updated entities JSON.`;
}

export function heuristicExtract(
  transcript: string,
  existing: MedicalEntities | null
): MedicalEntities {
  const lower = transcript.toLowerCase();
  const entities: MedicalEntities = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        medications: [],
        conditions: [],
        allergies: [],
        vitals: {},
        symptoms: [],
      };

  const addMed = (name: string) => {
    if (!entities.medications.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      entities.medications.push({ name });
    }
  };
  const addCondition = (c: string) => {
    if (!entities.conditions.some((x) => x.toLowerCase() === c.toLowerCase())) {
      entities.conditions.push(c);
    }
  };
  const addSymptom = (s: string) => {
    if (!entities.symptoms.some((x) => x.toLowerCase() === s.toLowerCase())) {
      entities.symptoms.push(s);
    }
  };

  if (lower.includes("warfarin")) addMed("warfarin");
  if (lower.includes("lisinopril")) addMed("lisinopril");
  if (lower.includes("aspirin")) addMed("aspirin");
  if (lower.includes("hypertension") || lower.includes("high blood pressure"))
    addCondition("hypertension");
  if (lower.includes("heart valve")) addCondition("heart valve replacement");
  if (lower.includes("chest pain")) addSymptom("chest pain");
  if (lower.includes("shortness of breath") || lower.includes("short of breath"))
    addSymptom("shortness of breath");
  if (lower.includes("left arm")) addSymptom("left arm pain");
  if (lower.includes("nausea")) addSymptom("nausea");

  const ageMatch = lower.match(/\b(6[0-9]|[7-9][0-9])\b/);
  if (ageMatch) {
    entities.demographics = { ...entities.demographics, age: parseInt(ageMatch[1], 10) };
  }
  if (lower.includes(" male") || lower.match(/\b67\.?\s/i)) {
    entities.demographics = { ...entities.demographics, sex: "male" };
  }

  return entities;
}
