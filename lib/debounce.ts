type DebounceState = {
  timer: ReturnType<typeof setTimeout> | null;
  lastText: string;
  lastActivity: number;
};

const states = new Map<string, DebounceState>();

export function scheduleDebounce(
  key: string,
  delayMs: number,
  silenceMs: number,
  text: string,
  onFire: () => void | Promise<void>
): void {
  const now = Date.now();
  let state = states.get(key);
  if (!state) {
    state = { timer: null, lastText: "", lastActivity: now };
    states.set(key, state);
  }

  state.lastText = text;
  state.lastActivity = now;

  if (state.timer) clearTimeout(state.timer);

  const endsWithBoundary = /[.?!]\s*$/.test(text.trim());
  const effectiveDelay = endsWithBoundary ? Math.min(silenceMs, delayMs) : delayMs;

  state.timer = setTimeout(async () => {
    const current = states.get(key);
    if (!current) return;
    if (Date.now() - current.lastActivity < effectiveDelay - 50) return;
    await onFire();
  }, effectiveDelay);
}

export function clearDebounce(key: string): void {
  const state = states.get(key);
  if (state?.timer) clearTimeout(state.timer);
  states.delete(key);
}
