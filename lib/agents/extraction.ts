import type { EventBus } from "@/lib/bus";
import { EVENT_CHANNELS } from "@/lib/events";
import { scheduleDebounce } from "@/lib/debounce";
import { callClaudeJSON } from "@/lib/claude";
import {
  EXTRACTION_SYSTEM,
  buildExtractionPrompt,
  heuristicExtract,
} from "@/lib/prompts/extraction";
import type { MedicalEntities } from "@/lib/events";
import {
  appendBuffer,
  getBuffer,
  clearBuffer,
  loadJSON,
  saveJSON,
} from "@/lib/redis/state";
import { EncounterKeys } from "@/lib/redis/keys";

const EXTRACTION_DELAY_MS = 4000;
const SILENCE_MS = 1500;

export async function startExtractionAgent(bus: EventBus): Promise<() => void> {
  const runExtraction = async (encounterId: string) => {
    const transcript = await getBuffer(encounterId);
    if (!transcript.trim()) return;

    const existing = await loadJSON<MedicalEntities>(
      EncounterKeys.facts(encounterId)
    );

    let entities =
      (await callClaudeJSON<MedicalEntities>(
        EXTRACTION_SYSTEM,
        buildExtractionPrompt(transcript, existing),
        "extraction"
      )) ?? heuristicExtract(transcript, existing);

    entities = mergeEntities(existing, entities);
    await saveJSON(EncounterKeys.facts(encounterId), entities);
    await clearBuffer(encounterId);

    await bus.publish(EVENT_CHANNELS.FACTS_EXTRACTED, {
      encounterId,
      entities,
      extractedAt: new Date().toISOString(),
    });
  };

  const unsub = await bus.subscribe(
    EVENT_CHANNELS.TRANSCRIPT_SEGMENT,
    async (envelope) => {
      const { encounterId, text } = envelope.payload;
      await appendBuffer(encounterId, text);
      const full = await getBuffer(encounterId);

      scheduleDebounce(
        `extract:${encounterId}`,
        EXTRACTION_DELAY_MS,
        SILENCE_MS,
        full,
        () => runExtraction(encounterId)
      );
    }
  );

  return unsub;
}

function mergeEntities(
  existing: MedicalEntities | null,
  incoming: MedicalEntities
): MedicalEntities {
  if (!existing) return incoming;
  const medNames = new Set(existing.medications.map((m) => m.name.toLowerCase()));
  const mergedMeds = [...existing.medications];
  for (const m of incoming.medications) {
    if (!medNames.has(m.name.toLowerCase())) mergedMeds.push(m);
  }
  return {
    medications: mergedMeds,
    conditions: [...new Set([...existing.conditions, ...incoming.conditions])],
    allergies: [...new Set([...existing.allergies, ...incoming.allergies])],
    vitals: { ...existing.vitals, ...incoming.vitals },
    symptoms: [...new Set([...existing.symptoms, ...incoming.symptoms])],
    demographics: { ...existing.demographics, ...incoming.demographics },
  };
}
