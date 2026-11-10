import { WebSocket, type RawData } from "ws";
import { voiceBudget } from "../flamingo/voice";
import { AppError } from "../flamingo/errors";
import { readDemo, changeDemo, recost, step } from "./store";

const active = new Map<string, number>();
/** A bounded authenticated STT stream. Transcript is untrusted customer input, never a command. */
export async function attachLiveVoice(client: WebSocket, workspace: string, ticketId: string) {
  let upstream: WebSocket | undefined, bytes = 0, finalText = "", finished = false, counted = false;
  let started = Date.now(), finishTimer: ReturnType<typeof setTimeout> | undefined;
  const send = (data: object) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
  const release = () => {
    clearTimeout(finishTimer);
    upstream?.terminate();
    if (counted) { active.set(workspace, Math.max(0, (active.get(workspace) || 1) - 1)); counted = false; }
  };
  const deadline = setTimeout(() => { send({ type: "voice_error", text: "This speech turn reached its 25-second limit. Please resume the call." }); client.close(); }, 25000);
  client.once("close", () => { clearTimeout(deadline); release(); });
  const complete = async () => {
    if (finished) return;
    finished = true; clearTimeout(finishTimer); clearTimeout(deadline);
    try {
      const seconds = Math.min(25, (Date.now() - started) / 1000);
      const result = await changeDemo(workspace, async d => {
        const t = d.tickets.find(t => t.id === ticketId);
        if (!t) throw new Error("ticket");
        t.voiceSeconds += seconds; recost(t);
        step(t, "Live transcription", "Deepgram WebSocket streamed this turn; audio was not stored. Final transcript awaits normal message submission.");
      });
      send({ type: "changed", revision: result.state.revision });
      send({ type: "voice_final", text: finalText.trim().slice(0, 1000) });
    } catch {
      send({ type: "voice_error", text: "The case is busy. Your speech turn could not be finalized; wait for the current operation, then resume." });
    } finally { release(); client.close(1000, "Turn complete"); }
  };
  try {
    const d = await readDemo(workspace), t = d.tickets.find(t => t.id === ticketId);
    if (!t || ["resolved", "rejected"].includes(t.status)) throw new AppError(409, "This case is not available for a live call.");
    if ((active.get(workspace) || 0) >= 1) throw new AppError(429, "A live speech turn is already active in this demo.");
    active.set(workspace, (active.get(workspace) || 0) + 1); counted = true;
    await voiceBudget();
    if (client.readyState !== WebSocket.OPEN) { release(); return; }
    upstream = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&interim_results=true&endpointing=300", {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` }, handshakeTimeout: 10000,
    });
    upstream.once("open", () => { started = Date.now(); send({ type: "voice_ready" }); });
    upstream.on("message", raw => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "Results") {
          const text = data.channel?.alternatives?.[0]?.transcript || "";
          if (data.is_final && text) finalText = `${finalText} ${text}`.trim();
          if (text) send({ type: "voice_partial", text: `${finalText}${data.is_final ? "" : ` ${text}`}`.trim().slice(0, 1000) });
          if (data.from_finalize) void complete();
        } else if (data.type === "Error") throw new Error("provider");
      } catch { send({ type: "voice_error", text: "Live transcription returned an error. Please resume or use text." }); client.close(); }
    });
    upstream.on("error", () => { send({ type: "voice_error", text: "Deepgram live transcription is unavailable. Please resume or use text." }); client.close(); });
    upstream.on("close", () => {
      if (!finished && client.readyState === WebSocket.OPEN) { send({ type: "voice_error", text: "The live transcription connection closed. Please resume." }); client.close(); }
    });
    client.on("message", (raw: RawData, binary: boolean) => {
      if (finished || upstream?.readyState !== WebSocket.OPEN) return;
      if (binary) {
        bytes += raw instanceof Buffer ? raw.length : Buffer.byteLength(raw.toString());
        if (bytes > 3_000_000 || upstream.bufferedAmount > 1_000_000) { send({ type: "voice_error", text: "Audio exceeded the live-turn safety limit." }); client.close(); return; }
        upstream.send(raw);
      } else {
        try {
          const data = JSON.parse(raw.toString());
          if (data.type === "finish" && !finishTimer) {
            upstream.send(JSON.stringify({ type: "Finalize" }));
            finishTimer = setTimeout(() => void complete(), 1600);
          }
        } catch { client.close(1008, "Invalid control message"); }
      }
    });
  } catch (error) {
    send({ type: "voice_error", text: error instanceof AppError ? error.message : "Could not start live transcription." });
    release(); client.close();
  }
}
