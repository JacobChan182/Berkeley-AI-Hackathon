import type { EventBus } from "@/lib/bus";

/** Transcription is handled by demo injector + Deepgram API route */
export async function startTranscriptionAgent(_bus: EventBus): Promise<() => void> {
  return () => {};
}
