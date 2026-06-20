/**
 * Event bus — Redis when available, in-memory fallback otherwise.
 */

import type { EventChannel, EventEnvelope, EventPayloadMap } from "./events";
import { pubsubChannel } from "./redis/keys";
import { getRedisPublisher, getRedisSubscriber } from "./redis/client";
import { broadcastToClients } from "./sse/hub";

export type EventHandler<C extends EventChannel> = (
  envelope: EventEnvelope<C>
) => void | Promise<void>;

export interface EventBus {
  publish<C extends EventChannel>(
    channel: C,
    payload: EventPayloadMap[C]
  ): Promise<void>;

  subscribe<C extends EventChannel>(
    channel: C,
    handler: EventHandler<C>
  ): Promise<() => void>;
}

function createInMemoryBus(): EventBus {
  const listeners = new Map<string, Set<EventHandler<EventChannel>>>();

  return {
    async publish(channel, payload) {
      const envelope = { channel, payload } as EventEnvelope;
      broadcastToClients(envelope);
      const handlers = listeners.get(channel);
      if (!handlers) return;
      await Promise.all([...handlers].map((h) => h(envelope)));
    },

    async subscribe(channel, handler) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(handler as EventHandler<EventChannel>);
      return () => listeners.get(channel)?.delete(handler as EventHandler<EventChannel>);
    },
  };
}

function createRedisBus(): EventBus {
  const localHandlers = new Map<string, Set<EventHandler<EventChannel>>>();
  const subscriber = getRedisSubscriber();
  const publisher = getRedisPublisher();

  if (!subscriber || !publisher) return createInMemoryBus();

  subscriber.on("message", async (_channel, message) => {
    try {
      const envelope = JSON.parse(message) as EventEnvelope;
      broadcastToClients(envelope);
      const handlers = localHandlers.get(envelope.channel);
      if (!handlers) return;
      await Promise.all([...handlers].map((h) => h(envelope)));
    } catch (err) {
      console.error("[bus] failed to handle message", err);
    }
  });

  return {
    async publish(channel, payload) {
      const envelope = { channel, payload } as EventEnvelope;
      broadcastToClients(envelope);
      await publisher.publish(pubsubChannel(channel), JSON.stringify(envelope));
      const handlers = localHandlers.get(channel);
      if (handlers) {
        await Promise.all([...handlers].map((h) => h(envelope)));
      }
    },

    async subscribe(channel, handler) {
      const redisChannel = pubsubChannel(channel);
      if (!localHandlers.has(channel)) {
        localHandlers.set(channel, new Set());
        await subscriber.subscribe(redisChannel);
      }
      localHandlers.get(channel)!.add(handler as EventHandler<EventChannel>);
      return () => localHandlers.get(channel)?.delete(handler as EventHandler<EventChannel>);
    },
  };
}

let busInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!busInstance) {
    busInstance =
      process.env.REDIS_URL && getRedisPublisher()
        ? createRedisBus()
        : createInMemoryBus();
  }
  return busInstance;
}

export { createInMemoryBus };
