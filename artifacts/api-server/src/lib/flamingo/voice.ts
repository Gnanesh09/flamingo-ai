import { AppError, requireConfigured } from "./errors";
import { exclusive, loadGlobal, saveGlobal } from "./store";

export async function voiceBudget() {
  requireConfigured(process.env.DEEPGRAM_API_KEY, "Deepgram voice");
  await exclusive("voice-budget", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const usage = await loadGlobal("voice-usage", { date: today, count: 0, recent: [] as number[] });
    if (usage.date !== today) { usage.date = today; usage.count = 0; }
    usage.recent = usage.recent.filter(t => t > Date.now() - 60000);
    if (usage.count >= 100) throw new AppError(429, "The daily voice safety limit is reached. Continue with text chat.");
    if (usage.recent.length >= 12) throw new AppError(429, "Voice is cooling down. Please wait a minute.", 60);
    usage.recent.push(Date.now());
    usage.count++;
    await saveGlobal("voice-usage", usage);
  });
}

async function deepgram(endpoint: string, mime: string, body: string | Uint8Array<ArrayBuffer>) {
  await voiceBudget();
  let response: Response;
  try {
    response = await fetch(`https://api.deepgram.com/v1/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": mime },
      body, signal: AbortSignal.timeout(25000),
    });
  } catch { throw new AppError(502, "Deepgram did not respond. The call can continue in text; no automatic retry was made."); }
  if (!response.ok) throw new AppError(response.status === 429 ? 429 : 503, `Deepgram could not process the voice request (HTTP ${response.status}). Check your key, credits and model access.`, response.status === 429 ? 60 : undefined);
  return response;
}

export async function transcribe(audio: string, mimeType: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw new AppError(400, "Invalid audio encoding.");
  const bytes = Buffer.from(audio, "base64");
  if (bytes.length < 100 || bytes.length > 3_000_000) throw new AppError(400, "Record a short voice turn of up to 20 seconds.");
  const response = await deepgram("listen?model=nova-3&smart_format=true&language=multi", mimeType, new Uint8Array(bytes));
  const data = await response.json() as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof text !== "string") throw new AppError(502, "Deepgram returned no transcript.");
  return { text: text.slice(0, 1000) };
}

/** `voice` is an Aura-2 model name; defaults to the English voice. */
export async function speak(text: string, voice = "aura-2-thalia-en") {
  const response = await deepgram(`speak?model=${encodeURIComponent(voice)}&encoding=mp3`, "application/json", JSON.stringify({ text }));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5_000_000) throw new AppError(502, "Voice response was unexpectedly large.");
  return { audio: bytes.toString("base64"), mimeType: "audio/mpeg" };
}
