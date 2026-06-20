import { getRedisPublisher } from "./client";
import { EncounterKeys } from "./keys";

const memoryStore = new Map<string, string>();

async function get(key: string): Promise<string | null> {
  const redis = getRedisPublisher();
  if (redis) return redis.get(key);
  return memoryStore.get(key) ?? null;
}

async function set(key: string, value: string): Promise<void> {
  const redis = getRedisPublisher();
  if (redis) {
    await redis.set(key, value);
    return;
  }
  memoryStore.set(key, value);
}

export async function appendTranscript(
  encounterId: string,
  line: string
): Promise<string> {
  const key = EncounterKeys.transcript(encounterId);
  const existing = (await get(key)) ?? "";
  const updated = existing ? `${existing}\n${line}` : line;
  await set(key, updated);
  return updated;
}

export async function appendBuffer(
  encounterId: string,
  text: string
): Promise<string> {
  const key = EncounterKeys.buffer(encounterId);
  const existing = (await get(key)) ?? "";
  const updated = existing ? `${existing} ${text}` : text;
  await set(key, updated);
  return updated;
}

export async function getBuffer(encounterId: string): Promise<string> {
  return (await get(EncounterKeys.buffer(encounterId))) ?? "";
}

export async function clearBuffer(encounterId: string): Promise<void> {
  await set(EncounterKeys.buffer(encounterId), "");
}

export async function getTranscript(encounterId: string): Promise<string> {
  return (await get(EncounterKeys.transcript(encounterId))) ?? "";
}

export async function saveJSON<T>(key: string, value: T): Promise<void> {
  await set(key, JSON.stringify(value));
}

export async function loadJSON<T>(key: string): Promise<T | null> {
  const raw = await get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function addToSet(key: string, member: string): Promise<boolean> {
  const redis = getRedisPublisher();
  if (redis) {
    const added = await redis.sadd(key, member);
    return added === 1;
  }
  const setKey = `set:${key}`;
  const existing = memoryStore.get(setKey);
  const set = new Set(existing ? JSON.parse(existing) : []);
  if (set.has(member)) return false;
  set.add(member);
  memoryStore.set(setKey, JSON.stringify([...set]));
  return true;
}

export async function resetEncounter(encounterId: string): Promise<void> {
  const keys = Object.values(EncounterKeys).map((fn) => fn(encounterId));
  const redis = getRedisPublisher();
  if (redis) {
    if (keys.length) await redis.del(...keys);
    return;
  }
  for (const key of keys) memoryStore.delete(key);
  memoryStore.delete(`set:${EncounterKeys.researchedMeds(encounterId)}`);
}
