import { NextResponse } from "next/server";
import { ensureAgentsStarted } from "@/lib/agents/runtime";
import { getEventBus } from "@/lib/bus";
import { EVENT_CHANNELS, type Speaker } from "@/lib/events";
import { appendTranscript } from "@/lib/redis/state";
import { ENCOUNTER_ID } from "@/lib/redis/keys";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await ensureAgentsStarted();

  const body = await request.json();
  const encounterId = (body.encounterId as string) ?? ENCOUNTER_ID;
  const text = body.text as string;
  const speaker = (body.speaker as Speaker) ?? "unknown";

  if (!text?.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  await appendTranscript(encounterId, `[${speaker}] ${text}`);

  const bus = getEventBus();
  await bus.publish(EVENT_CHANNELS.TRANSCRIPT_SEGMENT, {
    encounterId,
    text,
    speaker,
    timestamp,
  });

  return NextResponse.json({ ok: true });
}

/** Returns Deepgram API key for client-side live streaming (hackathon demo) */
export async function GET() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Deepgram not configured" }, { status: 503 });
  }
  return NextResponse.json({ key });
}
