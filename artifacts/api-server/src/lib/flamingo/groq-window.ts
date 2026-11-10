/**
 * Per-model Groq budget. Groq free tier limits are per model (≈7–8K input tokens/min,
 * 1K requests/day), so each model gets its own sliding window instead of one global cooldown.
 * Reservations are conservative estimates; a real 429 blocks the model until Groq's retry-after.
 */
const TOKENS_PER_MINUTE = 7000; // Groq free tier: 8K per model; reservations are settled to real usage
const REQUESTS_PER_DAY = 900;

interface Window { calls: { at: number; tokens: number }[]; blockedUntil: number; day: string; requests: number }
const windows = new Map<string, Window>();

function windowFor(model: string) {
  const day = new Date().toISOString().slice(0, 10);
  let w = windows.get(model);
  if (!w || w.day !== day) { w = { calls: w?.calls ?? [], blockedUntil: w?.blockedUntil ?? 0, day, requests: 0 }; windows.set(model, w); }
  w.calls = w.calls.filter(c => c.at > Date.now() - 60_000);
  return w;
}

/** Milliseconds until `tokens` fit, or Infinity when the model is out for the day. 0 = fits now. */
export function groqWaitMs(model: string, tokens: number) {
  const w = windowFor(model);
  if (w.requests >= REQUESTS_PER_DAY) return Infinity;
  const blocked = Math.max(0, w.blockedUntil - Date.now());
  let used = w.calls.reduce((sum, c) => sum + c.tokens, 0);
  if (used + tokens <= TOKENS_PER_MINUTE) return blocked;
  // Earliest moment enough old reservations expire.
  for (const c of w.calls) {
    used -= c.tokens;
    if (used + tokens <= TOKENS_PER_MINUTE) return Math.max(blocked, c.at + 60_000 - Date.now() + 50);
  }
  return Math.max(blocked, 60_000);
}

/** Reserve immediately or return false. Never waits. */
export function tryReserveGroq(model: string, tokens: number) {
  if (groqWaitMs(model, tokens) !== 0) return false;
  const w = windowFor(model);
  w.calls.push({ at: Date.now(), tokens }); w.requests++;
  return true;
}

/** Wait (bounded) for budget, reporting the expected wait once. Throws when it cannot fit in time. */
export async function reserveGroqWithin(model: string, tokens: number, maxWaitMs: number, onWait?: (ms: number) => void) {
  const deadline = Date.now() + maxWaitMs;
  let announced = false;
  for (;;) {
    const wait = groqWaitMs(model, tokens);
    if (wait === 0) { tryReserveGroq(model, tokens); return; }
    if (!Number.isFinite(wait) || Date.now() + wait > deadline) return Promise.reject(new GroqBusyError(wait));
    if (!announced) { onWait?.(wait); announced = true; }
    await new Promise(r => setTimeout(r, Math.min(wait, 5000)));
  }
}

/** Replaces a reservation with the tokens the request really used, so short answers free their unused allowance. */
export function settleGroq(model: string, reserved: number, actual: number) {
  if (!(actual > 0)) return;
  const entry = [...windowFor(model).calls].reverse().find(c => c.tokens === reserved);
  if (entry) entry.tokens = Math.min(reserved, actual);
}

export function blockGroq(model: string, retryAfterSeconds: number) {
  const w = windowFor(model);
  w.blockedUntil = Math.max(w.blockedUntil, Date.now() + Math.max(5, retryAfterSeconds) * 1000);
}

export class GroqBusyError extends Error {
  constructor(public waitMs: number) { super("Groq budget is busy"); }
}

export function retryAfterSeconds(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 30;
}
