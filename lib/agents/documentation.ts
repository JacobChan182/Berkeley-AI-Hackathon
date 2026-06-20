import type { EventBus } from "@/lib/bus";
import { EVENT_CHANNELS, type SoapNote, type TimelineEntry } from "@/lib/events";
import { scheduleDebounce } from "@/lib/debounce";
import { callClaudeJSON } from "@/lib/claude";
import {
  DOCUMENTATION_SYSTEM,
  buildDocumentationPrompt,
  heuristicSoap,
} from "@/lib/prompts/documentation";
import type { MedicalEntities } from "@/lib/events";
import { getTranscript, loadJSON, saveJSON } from "@/lib/redis/state";
import { EncounterKeys } from "@/lib/redis/keys";

const DOC_DELAY_MS = 8000;

export async function startDocumentationAgent(
  bus: EventBus
): Promise<() => void> {
  const runDoc = async (encounterId: string) => {
    const entities = await loadJSON<MedicalEntities>(
      EncounterKeys.facts(encounterId)
    );
    const timeline =
      (await loadJSON<TimelineEntry[]>(EncounterKeys.timeline(encounterId))) ?? [];
    const transcript = await getTranscript(encounterId);
    if (!entities) return;

    let soap =
      (await callClaudeJSON<SoapNote>(
        DOCUMENTATION_SYSTEM,
        buildDocumentationPrompt(entities, timeline, transcript),
        "documentation"
      )) ?? heuristicSoap(entities, timeline);

    await saveJSON(EncounterKeys.soap(encounterId), soap);

    await bus.publish(EVENT_CHANNELS.NOTE_UPDATED, {
      encounterId,
      soap,
      updatedAt: new Date().toISOString(),
    });
  };

  const trigger = (encounterId: string) => {
    scheduleDebounce(
      `doc:${encounterId}`,
      DOC_DELAY_MS,
      2000,
      encounterId,
      () => runDoc(encounterId)
    );
  };

  const unsub1 = await bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, (e) =>
    trigger(e.payload.encounterId)
  );
  const unsub2 = await bus.subscribe(EVENT_CHANNELS.TIMELINE_UPDATED, (e) =>
    trigger(e.payload.encounterId)
  );

  return () => {
    unsub1();
    unsub2();
  };
}
