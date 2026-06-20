import { readFileSync } from "fs";
import { join } from "path";
import type { EventBus } from "@/lib/bus";
import { EVENT_CHANNELS, type Speaker } from "@/lib/events";
import { appendTranscript } from "@/lib/redis/state";

interface DemoBeat {
  delayMs: number;
  speaker: Speaker;
  text: string;
}

const activeInjectors = new Map<string, AbortController>();

export function stopDemo(encounterId: string): void {
  activeInjectors.get(encounterId)?.abort();
  activeInjectors.delete(encounterId);
}

export async function runDemoScenario(
  bus: EventBus,
  encounterId: string
): Promise<void> {
  stopDemo(encounterId);
  const controller = new AbortController();
  activeInjectors.set(encounterId, controller);

  const scenarioPath = join(process.cwd(), "scripts", "demo-scenario.json");
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));
  const beats = scenario.beats as DemoBeat[];

  let elapsed = 0;
  for (const beat of beats) {
    if (controller.signal.aborted) return;
    const wait = beat.delayMs - elapsed;
    if (wait > 0) {
      try {
        await sleep(wait, controller.signal);
      } catch {
        return;
      }
    }

    elapsed = beat.delayMs;

    if (controller.signal.aborted) return;

    const timestamp = new Date().toISOString();
    const line = `[${beat.speaker}] ${beat.text}`;
    await appendTranscript(encounterId, line);

    await bus.publish(EVENT_CHANNELS.TRANSCRIPT_SEGMENT, {
      encounterId,
      text: beat.text,
      speaker: beat.speaker,
      timestamp,
    });
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}
