import type { EventBus } from "@/lib/bus";
import { EVENT_CHANNELS } from "@/lib/events";
import { callClaudeJSON } from "@/lib/claude";
import {
  SAFETY_SYSTEM,
  buildSafetyPrompt,
  heuristicSafety,
  type SafetyResult,
} from "@/lib/prompts/safety";
import { loadJSON, saveJSON } from "@/lib/redis/state";
import { EncounterKeys } from "@/lib/redis/keys";

export async function startSafetyAgent(bus: EventBus): Promise<() => void> {
  return bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, async (envelope) => {
    const { encounterId, entities } = envelope.payload;
    const prior =
      (await loadJSON<SafetyResult[]>(EncounterKeys.safetyFlags(encounterId))) ?? [];

    let flags =
      (await callClaudeJSON<SafetyResult[]>(
        SAFETY_SYSTEM,
        buildSafetyPrompt(entities),
        "safety"
      )) ?? heuristicSafety(entities);

    if (!Array.isArray(flags)) flags = heuristicSafety(entities);

    const newFlags = flags.filter(
      (f) => !prior.some((p) => p.concern === f.concern)
    );
    const allFlags = [...prior, ...newFlags];
    await saveJSON(EncounterKeys.safetyFlags(encounterId), allFlags);

    for (const flag of newFlags) {
      await bus.publish(EVENT_CHANNELS.SAFETY_FLAGGED, {
        encounterId,
        concern: flag.concern,
        severity: flag.severity,
        rationale: flag.rationale,
        flaggedAt: new Date().toISOString(),
      });
    }
  });
}
