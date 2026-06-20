import { getEventBus } from "@/lib/bus";
import { startAllAgents } from "@/lib/agents";

let started = false;
let starting: Promise<void> | null = null;

export async function ensureAgentsStarted(): Promise<void> {
  if (started) return;
  if (starting) return starting;

  starting = (async () => {
    const bus = getEventBus();
    await startAllAgents(bus);
    started = true;
    console.log("[runtime] All agents started");
  })();

  return starting;
}
