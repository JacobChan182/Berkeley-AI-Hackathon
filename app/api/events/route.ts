import { addSSEClient } from "@/lib/sse/hub";
import { ensureAgentsStarted } from "@/lib/agents/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureAgentsStarted();

  let remove: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      remove = addSSEClient(controller);
      const welcome = new TextEncoder().encode(
        `data: ${JSON.stringify({ channel: "connected", payload: { ok: true } })}\n\n`
      );
      controller.enqueue(welcome);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          remove?.();
        }
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      remove?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
