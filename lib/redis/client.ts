import Redis from "ioredis";

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

export function isRedisAvailable(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisPublisher(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!publisher) {
    publisher = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return publisher;
}

export function getRedisSubscriber(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!subscriber) {
    subscriber = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return subscriber;
}
