import { NextResponse } from "next/server";
import { ensureAgentsStarted } from "@/lib/agents/runtime";
import { getEventBus } from "@/lib/bus";
import { EVENT_CHANNELS } from "@/lib/events";
import { ENCOUNTER_ID } from "@/lib/redis/keys";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await ensureAgentsStarted();

  const body = await request.json().catch(() => ({}));
  const encounterId = (body.encounterId as string) ?? ENCOUNTER_ID;

  const bus = getEventBus();
  await bus.publish(EVENT_CHANNELS.HANDOFF_REQUESTED, {
    encounterId,
    requestedAt: new Date().toISOString(),
  });

  return NextResponse.json({ encounterId, status: "handoff_requested" });
}
