"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCommerceSpeak,
  type CommerceState,
  type CommerceVoiceInputMimeType,
} from "@workspace/api-client-react";
import { useCommerce } from "@/hooks/use-commerce";
import { errText, retryAfterSeconds } from "@/lib/commerce";
import { liveTranscription } from "@/lib/live-transcription";

export type CallStatus = "idle" | "connecting" | "live" | "listening" | "transcribing" | "thinking" | "speaking" | "error" | "ended";

const MAX_TURN_MS = 20_000;
const IDLE_MS = 10_000;
const SILENCE_MS = 650;
const THRESHOLD = 0.004;
const CANDIDATES: CommerceVoiceInputMimeType[] = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/** Streaming STT, factual acknowledgment cues, and saved replies bound to one ticket. */
export function useCommerceCall(ticketId: string | undefined, getState: () => CommerceState | undefined) {
  const { run } = useCommerce();
  const speak = useCommerceSpeak();
  const fns = useRef({ s: speak.mutateAsync, run, getState, ticketId });
  fns.current = { s: speak.mutateAsync, run, getState, ticketId };

  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [heardText, setHeardText] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [noSpeechHint, setNoSpeechHint] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const evidenceBusy = useRef(false);
  const recordingSettled = useRef<Promise<void>>(Promise.resolve());
  const liveTurn = useRef<ReturnType<typeof liveTranscription> | null>(null);
  const cueCache = useRef<Promise<{ audio: string; mimeType: string }> | null>(null);
  const cuePlayback = useRef<Promise<void> | null>(null);

  const alive = useRef(false);
  const mutedRef = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const meter = useRef<number | undefined>(undefined);
  const clock = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const spoken = useRef(new Set<string>());
  const finishAudio = useRef<(() => void) | null>(null);
  const finishRecording = useRef<(() => void) | null>(null);
  const loopRunning = useRef(false);

  const teardown = useCallback(() => {
    generation.current++;
    alive.current = false;
    loopRunning.current = false;
    finishRecording.current = null;
    liveTurn.current?.cancel(); liveTurn.current = null;
    evidenceBusy.current = false;
    window.clearInterval(meter.current);
    window.clearInterval(clock.current);
    if (rec.current && rec.current.state !== "inactive") {
      rec.current.ondataavailable = null;
      try { rec.current.stop(); } catch { /* already stopped */ }
    }
    rec.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (audio.current) { audio.current.pause(); audio.current.src = ""; audio.current = null; }
    finishAudio.current?.();
    finishAudio.current = null;
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    analyser.current = null;
    setLevel(0);
    setNoSpeechHint(null);
    setInterimTranscript(null); setProgressText(null);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const playCue = useCallback(async () => {
    if (!alive.current || audio.current) return;
    const token = generation.current;
    try {
      cueCache.current ||= fetch("/api/commerce/voice/cue", { credentials: "include" }).then(async r => {
        if (!r.ok) throw new Error("Acknowledgment unavailable");
        return r.json() as Promise<{ audio: string; mimeType: string }>;
      });
      const clip = await cueCache.current;
      if (!alive.current || token !== generation.current || audio.current) return;
      await new Promise<void>(resolve => {
        const a = new Audio(`data:${clip.mimeType};base64,${clip.audio}`);
        audio.current = a;
        const done = () => { clearTimeout(timer); a.pause(); if (audio.current === a) audio.current = null; resolve(); };
        const timer = window.setTimeout(done, 8000);
        finishAudio.current = done;
        a.onended = done; a.onerror = done;
        void a.play().catch(done);
      });
    } catch { /* The truthful progress text remains visible if optional cue audio fails. */ }
  }, []);

  const setEvidenceBusy = useCallback(async (busy: boolean) => {
    evidenceBusy.current = busy;
    if (busy) {
      setProgressText("Microphone paused while your images are uploaded and reviewed. Your call stays connected.");
      finishRecording.current?.();
      await recordingSettled.current;
      if (alive.current) cuePlayback.current = playCue();
    } else setProgressText(null);
  }, [playCue]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const playMessage = useCallback(async (messageId: string) => {
    const id = fns.current.ticketId;
    if (!id) return;
    const token = generation.current;
    setStatus("thinking");
    const sp = await fns.current.s({ data: { ticketId: id, messageId } });
    if (!alive.current || token !== generation.current) return;
    await new Promise<void>((res, reject) => {
      const a = new Audio(`data:${sp.mimeType};base64,${sp.audio}`);
      audio.current = a;
      finishAudio.current = res;
      const timeout = window.setTimeout(() => { a.pause(); reject(new Error("Voice playback timed out. The response is saved in chat; resume to listen again.")); }, 90_000);
      const finish = () => { window.clearTimeout(timeout); res(); };
      finishAudio.current = finish;
      a.onended = finish;
      a.onplaying = () => setStatus("speaking");
      a.onerror = () => { window.clearTimeout(timeout); reject(new Error("Voice playback failed. Read the response in chat or resume the call.")); };
      a.play().catch(() => { window.clearTimeout(timeout); reject(new Error("Your browser blocked voice playback. Press Resume, or continue by text.")); });
    });
    spoken.current.add(messageId);
    finishAudio.current = null;
    audio.current = null;
  }, []);

  const fail = useCallback((e: unknown) => {
    const wait = retryAfterSeconds(e);
    setError(wait ? `Flamingo is rate limited. Resume in ${wait}s, or type below.` : errText(e));
    if (wait) setCooldown(wait);
    setStatus("error");
  }, []);

  const listen = useCallback(async (): Promise<void> => {
    const s = stream.current, an = analyser.current, id = fns.current.ticketId;
    if (!alive.current || !s || !an || !id) return;
    const token = generation.current;
    const current = () => fns.current.getState()?.tickets.find(t => t.id === id);
    const unsaid = () => [...(current()?.messages || [])].reverse().find(m => m.role !== "customer" && !spoken.current.has(m.id));
    const incoming = unsaid();
    if (incoming) {
      try {
        await playMessage(incoming.id);
        for (const m of current()?.messages || []) if (m.at <= incoming.at) spoken.current.add(m.id);
      } catch (e) { if (alive.current && token === generation.current) fail(e); return; }
    }
    if (!alive.current || token !== generation.current) return;
    if (["resolved", "rejected"].includes(current()?.status || "")) { teardown(); setStatus("ended"); return; }
    while (evidenceBusy.current && alive.current && token === generation.current) await new Promise(r => setTimeout(r, 120));
    if (!alive.current || token !== generation.current) return;
    await cuePlayback.current;
    setStatus("connecting");
    setNoSpeechHint(null);
    setInterimTranscript(null);
    const live = liveTranscription(id, value => { if (alive.current && token === generation.current) setInterimTranscript(value); });
    liveTurn.current = live;
    try { await live.ready; } catch (e) { if (alive.current && token === generation.current) fail(e); return; }
    if (!alive.current || token !== generation.current) { live.cancel(); return; }
    setStatus("listening");
    let markRecordingSettled!: () => void;
    recordingSettled.current = new Promise<void>(resolve => { markRecordingSettled = resolve; });
    const mime = pickMime();
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    rec.current = r;
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) { chunks.push(e.data); live.send(e.data); } };
    const done = new Promise<void>((res) => { r.onstop = () => res(); });
    let heard = false, quietSince = 0, forced = false, peak = 0, pausedForEvidence = false;
    const t0 = performance.now();
    const buf = new Uint8Array(an.fftSize);
    const stop = () => { if (r.state !== "inactive") r.stop(); };
    finishRecording.current = () => {
      if (evidenceBusy.current) { pausedForEvidence = true; forced = true; stop(); }
      else if (!mutedRef.current) { forced = true; stop(); }
    };
    r.start(250);
    meter.current = window.setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / buf.length);
      peak = Math.max(peak, mutedRef.current ? 0 : rms);
      setLevel(mutedRef.current ? 0 : Math.min(1, rms * 8));
      const now = performance.now();
      if (!mutedRef.current && rms > THRESHOLD) { heard = true; quietSince = 0; }
      else if (heard) { quietSince ||= now; if (now - quietSince > SILENCE_MS) stop(); }
      if (now - t0 > MAX_TURN_MS || (!heard && now - t0 > IDLE_MS)) stop();
      if (!heard && now - t0 > 5000 && !mutedRef.current) setNoSpeechHint("Not detecting speech yet. Check your microphone, or select Done speaking to send a quiet turn.");
      // Staff responses arriving through WebSocket are spoken between customer turns.
      if (!heard && unsaid()) stop();
      if (["resolved", "rejected"].includes(current()?.status || "")) stop();
    }, 100);
    await done;
    window.clearInterval(meter.current);
    setLevel(0);
    rec.current = null;
    finishRecording.current = null;
    if (!alive.current || token !== generation.current) { live.cancel(); markRecordingSettled(); return; }
    // A quiet turn closed for a photo upload is not a microphone failure: discard it and resume after the batch.
    if ((pausedForEvidence && !heard) || (!heard && !forced && peak < 0.0015)) { await live.cancel(); markRecordingSettled(); return listen(); }
    if (!chunks.length) {
      fail(new Error("Your microphone produced no audio. Check the selected input device and resume, or continue by text."));
      live.cancel(); markRecordingSettled();
      return;
    }

    try {
      setStatus("transcribing");
      setNoSpeechHint(null);
      const text = await live.finish();
      markRecordingSettled();
      while (evidenceBusy.current && alive.current && token === generation.current) await new Promise(r => setTimeout(r, 120));
      await cuePlayback.current;
      if (!alive.current || token !== generation.current) return;
      if (!text.trim() && !heard) return listen();
      if (!text.trim()) throw new Error("No clear speech was detected. Try speaking closer to your microphone, then select Done speaking, or continue by text.");
      setLastTranscript(text);
      setHeardText(text);
      setInterimTranscript(null);
      setStatus("thinking");
      setProgressText("I’m checking your request and the current policy.");
      const before = fns.current.getState()?.tickets.find((t) => t.id === id);
      if (!before) throw new Error("This case is no longer available.");
      const acknowledgment = window.setTimeout(() => { cuePlayback.current = playCue(); }, 700);
      let res;
      try {
        res = await fns.current.run({ action: "message", ticketId: id, message: text.slice(0, 2000), channel: "voice", version: before.version }, { quiet: true });
      } finally { clearTimeout(acknowledgment); }
      await cuePlayback.current;
      setProgressText(null);
      setHeardText(null);
      if (!alive.current || token !== generation.current) return;
      const after = res.state.tickets.find((t) => t.id === id);
      const known = new Set(before.messages.map((m) => m.id));
      const reply = [...(after?.messages ?? [])].reverse().find((m) => !known.has(m.id) && m.role !== "customer");
      if (reply) await playMessage(reply.id);
      if (alive.current && token === generation.current) return listen();
    } catch (e) {
      live.cancel(); markRecordingSettled();
      // Preserve an unsent transcript so switching to text does not lose the request.
      if (alive.current && token === generation.current) fail(e);
    }
  }, [playMessage, playCue, fail, teardown]);

  const start = useCallback(async () => {
    if (alive.current) return;
    const token = ++generation.current;
    setError(null);
    setElapsed(0);
    setLastTranscript(null);
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser cannot record calls. Use a current Chrome, Safari or Firefox browser, or continue by text.");
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (token !== generation.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      const c = new AudioContext();
      ctx.current = c;
      await c.resume();
      if (token !== generation.current) { s.getTracks().forEach(t => t.stop()); await c.close().catch(() => undefined); return; }
      const an = c.createAnalyser();
      an.fftSize = 1024;
      c.createMediaStreamSource(s).connect(an);
      analyser.current = an;
      alive.current = true;
      const existing = fns.current.getState()?.tickets.find(t => t.id === fns.current.ticketId)?.messages || [];
      spoken.current = new Set(existing.map(m => m.id));
      // Resume with the most recent actual response, not silent listening after a text exchange.
      const latest = [...existing].reverse().find(m => m.role !== "customer");
      if (latest) spoken.current.delete(latest.id);
      mutedRef.current = false;
      setMuted(false);
      setStatus("live");
      const began = Date.now();
      clock.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000);
      loopRunning.current = true;
      void listen().catch(fail).finally(() => { if (token === generation.current) loopRunning.current = false; });
    } catch (e) {
      if (token !== generation.current) return;
      teardown();
      setStatus("error");
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was denied. You can keep going by text." : errText(e));
    }
  }, [listen, teardown, fail]);

  const hangup = useCallback(() => { teardown(); setStatus("ended"); setHeardText(null); }, [teardown]);
  const resume = useCallback(() => {
    if (cooldown > 0) return;
    setError(null);
    if (alive.current && !loopRunning.current) {
      const token = generation.current;
      loopRunning.current = true;
      void listen().catch(fail).finally(() => { if (token === generation.current) loopRunning.current = false; });
    }
    else void start();
  }, [listen, start, cooldown, fail]);
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, []);
  const active = status !== "idle" && status !== "ended" && !(status === "error" && !alive.current);
  useEffect(() => {
    if (!active || !ticketId) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/commerce/ws`);
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "progress" && data.ticketId === ticketId) setProgressText(data.stage === "evidence_done" ? null : String(data.text));
      } catch { /* State updates remain authoritative. */ }
    };
    return () => ws.close();
  }, [active, ticketId]);
  const finishTurn = useCallback(() => finishRecording.current?.(), []);
  return { status, muted, elapsed, level, error, cooldown, heardText, lastTranscript, noSpeechHint, interimTranscript, progressText, setEvidenceBusy, finishTurn, start, hangup, resume, toggleMute, active };
}
