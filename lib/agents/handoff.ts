import type { EventBus } from "@/lib/bus";
import {
  EVENT_CHANNELS,
  type HandoffReport,
  type MedicalEntities,
  type SoapNote,
  type TimelineEntry,
} from "@/lib/events";
import { callClaudeJSON } from "@/lib/claude";
import {
  HANDOFF_SYSTEM,
  buildHandoffPrompt,
  heuristicHandoff,
} from "@/lib/prompts/handoff";
import { getTranscript, loadJSON, saveJSON } from "@/lib/redis/state";
import { EncounterKeys } from "@/lib/redis/keys";

export async function startHandoffAgent(bus: EventBus): Promise<() => void> {
  return bus.subscribe(EVENT_CHANNELS.HANDOFF_REQUESTED, async (envelope) => {
    const { encounterId } = envelope.payload;

    const entities = await loadJSON<MedicalEntities>(
      EncounterKeys.facts(encounterId)
    );
    const timeline =
      (await loadJSON<TimelineEntry[]>(EncounterKeys.timeline(encounterId))) ?? [];
    const soap = await loadJSON<SoapNote>(EncounterKeys.soap(encounterId));
    const transcript = await getTranscript(encounterId);

    let report: HandoffReport;

    if (entities) {
      report =
        (await callClaudeJSON<HandoffReport>(
          HANDOFF_SYSTEM,
          buildHandoffPrompt(entities, timeline, transcript, soap),
          "handoff"
        )) ?? heuristicHandoff(entities, timeline);
    } else {
      report = {
        patientSummary: "Insufficient data collected during encounter.",
        timeline,
        currentMedications: [],
        outstandingQuestions: ["Complete patient interview."],
        recommendedActions: ["Continue assessment."],
        generatedAt: new Date().toISOString(),
      };
    }

    report.generatedAt = new Date().toISOString();
    await saveJSON(EncounterKeys.handoff(encounterId), report);

    await bus.publish(EVENT_CHANNELS.HANDOFF_GENERATED, {
      encounterId,
      report,
    });
  });
}
