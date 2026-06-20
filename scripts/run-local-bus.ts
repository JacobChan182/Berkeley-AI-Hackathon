import { createInMemoryBus } from "../lib/bus";
import { EVENT_CHANNELS } from "../lib/events";
import { ENCOUNTER_ID } from "../lib/redis/keys";
import {
  startExtractionAgent,
  startTimelineAgent,
  startSafetyAgent,
  startDocumentationAgent,
  startResearchAgent,
  startHandoffAgent,
} from "../lib/agents";
import { readFileSync } from "fs";
import { join } from "path";
import type { Speaker } from "../lib/events";

interface DemoBeat {
  delayMs: number;
  speaker: Speaker;
  text: string;
}

async function main() {
  const bus = createInMemoryBus();

  bus.subscribe(EVENT_CHANNELS.FACTS_EXTRACTED, (e) =>
    console.log("[facts]", JSON.stringify(e.payload.entities.medications))
  );
  bus.subscribe(EVENT_CHANNELS.TIMELINE_UPDATED, (e) =>
    console.log("[timeline]", e.payload.events.map((x) => x.summary).join(" | "))
  );
  bus.subscribe(EVENT_CHANNELS.SAFETY_FLAGGED, (e) =>
    console.log("[safety]", e.payload.severity, e.payload.concern)
  );
  bus.subscribe(EVENT_CHANNELS.NOTE_UPDATED, (e) =>
    console.log("[soap]", e.payload.soap.assessment.slice(0, 80))
  );
  bus.subscribe(EVENT_CHANNELS.RESEARCH_COMPLETED, (e) =>
    console.log("[research]", e.payload.query)
  );

  await startExtractionAgent(bus);
  await startTimelineAgent(bus);
  await startSafetyAgent(bus);
  await startDocumentationAgent(bus);
  await startResearchAgent(bus);
  await startHandoffAgent(bus);

  const scenario = JSON.parse(
    readFileSync(join(__dirname, "demo-scenario.json"), "utf-8")
  );

  console.log("Replaying demo scenario...\n");

  let elapsed = 0;
  for (const beat of scenario.beats as DemoBeat[]) {
    const wait = beat.delayMs - elapsed;
    if (wait > 0) await sleep(wait);
    elapsed = beat.delayMs;

    await bus.publish(EVENT_CHANNELS.TRANSCRIPT_SEGMENT, {
      encounterId: ENCOUNTER_ID,
      text: beat.text,
      speaker: beat.speaker,
      timestamp: new Date().toISOString(),
    });
    console.log(`[transcript] ${beat.speaker}: ${beat.text.slice(0, 50)}...`);
  }

  await sleep(12000);

  await bus.publish(EVENT_CHANNELS.HANDOFF_REQUESTED, {
    encounterId: ENCOUNTER_ID,
    requestedAt: new Date().toISOString(),
  });

  await sleep(3000);
  console.log("\nDone.");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
