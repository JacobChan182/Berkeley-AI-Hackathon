import type { EventBus } from "@/lib/bus";
import { EVENT_CHANNELS, type TimelineEntry } from "@/lib/events";
import { callClaudeJSON } from "@/lib/claude";
import {
  TIMELINE_SYSTEM,
  buildTimelinePrompt,
  heuristicTimeline,
} from "@/lib/prompts/timeline";
import { getTranscript, loadJSON, saveJSON } from "@/lib/redis/state";
import { EncounterKeys } from "@/lib/redis/keys";

export async function startTimelineAgent(bus: EventBus): Promise<() => void> {
  return bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, async (envelope) => {
    const { encounterId, entities } = envelope.payload;
    const existing =
      (await loadJSON<TimelineEntry[]>(EncounterKeys.timeline(encounterId))) ?? [];
    const transcript = await getTranscript(encounterId);

    let events =
      (await callClaudeJSON<TimelineEntry[]>(
        TIMELINE_SYSTEM,
        buildTimelinePrompt(entities, transcript, existing),
        "timeline"
      )) ?? heuristicTimeline(entities, existing);

    if (!Array.isArray(events)) events = heuristicTimeline(entities, existing);
    await saveJSON(EncounterKeys.timeline(encounterId), events);

    await bus.publish(EVENT_CHANNELS.TIMELINE_UPDATED, {
      encounterId,
      events,
    });
  });
}
