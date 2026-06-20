import type { EventBus } from "../bus";
import { startTranscriptionAgent } from "./transcription";
import { startExtractionAgent } from "./extraction";
import { startTimelineAgent } from "./timeline";
import { startSafetyAgent } from "./safety";
import { startDocumentationAgent } from "./documentation";
import { startResearchAgent } from "./research";
import { startHandoffAgent } from "./handoff";

export async function startAllAgents(bus: EventBus): Promise<() => void> {
  const stops = await Promise.all([
    startTranscriptionAgent(bus),
    startExtractionAgent(bus),
    startTimelineAgent(bus),
    startSafetyAgent(bus),
    startDocumentationAgent(bus),
    startResearchAgent(bus),
    startHandoffAgent(bus),
  ]);
  return () => stops.forEach((stop) => stop());
}

export {
  startTranscriptionAgent,
  startExtractionAgent,
  startTimelineAgent,
  startSafetyAgent,
  startDocumentationAgent,
  startResearchAgent,
  startHandoffAgent,
};
