export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAgentsStarted } = await import("@/lib/agents/runtime");
    await ensureAgentsStarted();
  }
}
