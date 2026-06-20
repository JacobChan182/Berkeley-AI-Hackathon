import Anthropic from "@anthropic-ai/sdk";

const anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_NIM_MODEL =
  process.env.NIM_MODEL ?? "nvidia/llama-3.3-nemotron-super-49b-v1.5";

function nimApiKey(): string | undefined {
  return process.env.NVIDIA_API_KEY ?? process.env.NIM_API_KEY;
}

export function hasClaude(): boolean {
  return Boolean(anthropicClient);
}

export function hasNim(): boolean {
  return Boolean(nimApiKey());
}

export function hasLlm(): boolean {
  return hasClaude() || hasNim();
}

const JSON_SYSTEM_SUFFIX =
  "\n\nIMPORTANT: Respond with ONLY the raw JSON — no markdown fences, no explanation.";

function parseJsonFromLlmText(raw: string): unknown | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const jsonMatch = stripped.match(/^(\{[\s\S]*\}|\[[\s\S]*\])$/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);

  const embedded = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (embedded) return JSON.parse(embedded[0]);

  return null;
}

async function callClaudeOnly<T>(
  system: string,
  user: string
): Promise<T | null> {
  if (!anthropicClient) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropicClient.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        system: system + JSON_SYSTEM_SUFFIX,
        messages: [{ role: "user", content: user }],
      });

      const raw =
        response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
      if (!raw) return null;

      return parseJsonFromLlmText(raw) as T;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt === 0) {
        await sleep(2000);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function callNimOnly<T>(system: string, user: string): Promise<T | null> {
  const apiKey = nimApiKey();
  if (!apiKey) return null;

  const fullSystem = `detailed thinking off.\n${system}${JSON_SYSTEM_SUFFIX}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_NIM_MODEL,
          messages: [
            { role: "system", content: fullSystem },
            { role: "user", content: user },
          ],
          max_tokens: 2048,
          temperature: 0,
        }),
      });

      if (response.status === 429 && attempt === 0) {
        await sleep(2000);
        continue;
      }

      if (!response.ok) return null;

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!raw) return null;

      return parseJsonFromLlmText(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Call Claude, then NVIDIA NIM if Claude is unavailable or fails.
 * Returns null if neither provider yields parseable JSON.
 */
export async function callClaudeJSON<T>(
  system: string,
  user: string,
  _agentName: string
): Promise<T | null> {
  if (anthropicClient) {
    const result = await callClaudeOnly<T>(system, user);
    if (result !== null) return result;
    if (nimApiKey()) {
      return callNimOnly<T>(system, user);
    }
    return null;
  }

  return callNimOnly<T>(system, user);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
