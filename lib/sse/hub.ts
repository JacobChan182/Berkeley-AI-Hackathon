import type { EventEnvelope } from "@/lib/events";

type SSEController = ReadableStreamDefaultController<Uint8Array>;

const clients = new Set<SSEController>();

export function addSSEClient(controller: SSEController): () => void {
  clients.add(controller);
  return () => clients.delete(controller);
}

export function broadcastToClients(envelope: EventEnvelope): void {
  const data = `data: ${JSON.stringify(envelope)}\n\n`;
  const encoded = new TextEncoder().encode(data);
  for (const client of clients) {
    try {
      client.enqueue(encoded);
    } catch {
      clients.delete(client);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
