import { createHash } from "node:crypto";
import { AppError, requireConfigured } from "./errors";
import { exclusive, loadGlobal, saveGlobal } from "./store";
import { blockGroq, groqWaitMs, retryAfterSeconds, settleGroq, tryReserveGroq } from "./groq-window";

interface Usage { date: string; calls: number; tokens: number; nextAt: number; window?: { at: number; tokens: number }[] }
export const DAILY_LIMIT = 400;
const TOKEN_DAILY_LIMIT = 150000;
const TOKEN_MINUTE_LIMIT = 6000;
const cache = new Map<string, { text: string; until: number }>();

export async function groqUsage(): Promise<Usage> {
  const date = new Date().toISOString().slice(0, 10);
  const usage = await loadGlobal<Usage>("groq-usage", { date, calls: 0, tokens: 0, nextAt: 0, window: [] });
  if (usage.date !== date) return { date, calls: 0, tokens: 0, nextAt: usage.nextAt, window: [] };
  return usage;
}

export async function completeGroq(system: string, prompt: string, workspaceId: string, json = false, options: { model?: string; maxTokens?: number } = {}) {
  requireConfigured(process.env.GROQ_API_KEY, "Groq");
  const model = options.model || process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const maxTokens = options.maxTokens ?? 700;
  const key = createHash("sha256").update(`${workspaceId}|${model}|${json}|${system}|${prompt}`).digest("hex");
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return { text: cached.text, cached: true, inputTokens: 0, outputTokens: 0 };
  // Conservative budget: one reserved token per 3 UTF-8 bytes (real usage is nearer 4) + the full output allowance.
  const reservedTokens = Math.ceil(Buffer.byteLength(system + prompt, "utf8") / 3) + maxTokens;
  // Only the bookkeeping is serialized; concurrent customers never wait on each other's network calls.
  await exclusive("groq-global", async () => {
    const usage = await groqUsage();
    if (usage.calls >= DAILY_LIMIT || usage.tokens + reservedTokens > TOKEN_DAILY_LIMIT) throw new AppError(429, "The app's daily AI safety budget is reached. Templates and saved cases still work; try AI again tomorrow.");
    if (reservedTokens > TOKEN_MINUTE_LIMIT) throw new AppError(400, "This AI context is too large for the free-tier safety budget.");
    if (usage.nextAt > Date.now()) throw new AppError(429, "Groq asked us to pause. AI replies resume shortly.", Math.ceil((usage.nextAt - Date.now()) / 1000));
    const wait = groqWaitMs(model, reservedTokens);
    if (wait > 0) throw new AppError(429, "The AI token budget for this minute is full. Please try again shortly.", Math.ceil(Math.min(wait, 60000) / 1000));
    tryReserveGroq(model, reservedTokens);
    usage.calls++;
    usage.tokens += reservedTokens;
    await saveGlobal("groq-usage", usage);
  });
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.2, max_completion_tokens: maxTokens,
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch { throw new AppError(502, "Groq did not respond. No automatic retry was made to avoid consuming more quota."); }
  if (response.status === 429) {
    const seconds = Math.max(10, retryAfterSeconds(response));
    blockGroq(model, seconds);
    await exclusive("groq-global", async () => {
      const usage = await groqUsage();
      usage.nextAt = Date.now() + seconds * 1000;
      await saveGlobal("groq-usage", usage);
    });
    throw new AppError(429, "Groq's account rate limit was reached. AI requests are paused briefly; templates remain available.", seconds);
  }
  if (!response.ok) throw new AppError(503, `Groq could not complete the request (HTTP ${response.status}). Check the API key and available model. No fallback was presented as AI.`);
  const result = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  settleGroq(model, reservedTokens, (result.usage?.prompt_tokens ?? 0) + (result.usage?.completion_tokens ?? 0));
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AppError(502, "Groq returned no answer. Please try a more specific question.");
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { text: text.slice(0, 5000), until: Date.now() + 300000 });
  return { text: text.slice(0, 5000), cached: false, inputTokens: result.usage?.prompt_tokens ?? 0, outputTokens: result.usage?.completion_tokens ?? 0 };
}
