"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAskAssistant, useSpeakVoice, useTranscribeVoice, type AssistantReply, type VoiceInputMimeType } from "@workspace/api-client-react";
import { errMsg } from "@/lib/format";

export type Phase = "idle" | "connecting" | "listening" | "transcribing" | "thinking" | "speaking" | "paused" | "ended";
export type Turn = { role: "user" | "assistant"; text: string; reply?: AssistantReply };

const MAX_TURN_MS = 15000;
const IDLE_MS = 9000;
const SILENCE_MS = 1300;
const THRESHOLD = 0.03;
const CANDIDATES: VoiceInputMimeType[] = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMime(): VoiceInputMimeType | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}
function normalize(m: string, fallback?: VoiceInputMimeType): VoiceInputMimeType {
  const s = m.replace(/\s/g, "").toLowerCase();
  if (s.startsWith("audio/webm")) return s.includes("opus") ? "audio/webm;codecs=opus" : "audio/webm";
  if (s.startsWith("audio/ogg")) return "audio/ogg;codecs=opus";
  if (s.startsWith("audio/mp4")) return "audio/mp4";
  return fallback ?? "audio/webm";
}
function toBase64(blob: Blob) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function retryAfter(e: unknown): number | null {
  const err = e as { status?: number; data?: { retryAfter?: number }; headers?: Headers };
  if (err?.status !== 429) return null;
  const v = err.data?.retryAfter ?? Number(err.headers?.get?.("retry-after"));
  return Number.isFinite(v) && v ? Number(v) : 10;
}

export function useVoiceCall(onTurn?: () => void) {
  const transcribe = useTranscribeVoice();
  const ask = useAskAssistant();
  const speak = useSpeakVoice();
  const fns = useRef({ t: transcribe.mutateAsync, a: ask.mutateAsync, s: speak.mutateAsync, onTurn });
  fns.current = { t: transcribe.mutateAsync, a: ask.mutateAsync, s: speak.mutateAsync, onTurn };

  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const alive = useRef(false);
  const mutedRef = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const meter = useRef<number | undefined>(undefined);
  const clock = useRef<number | undefined>(undefined);

  const teardown = useCallback(() => {
    alive.current = false;
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
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    analyser.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const listen = useCallback(async (): Promise<void> => {
    const s = stream.current, an = analyser.current;
    if (!alive.current || !s || !an) return;
    setPhase("listening");
    const mime = pickMime();
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    rec.current = r;
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((res) => { r.onstop = () => res(); });
    let heard = false, quietSince = 0;
    const t0 = performance.now();
    const buf = new Uint8Array(an.fftSize);
    const stop = () => { if (r.state !== "inactive") r.stop(); };
    r.start(250);
    meter.current = window.setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(mutedRef.current ? 0 : rms);
      const now = performance.now();
      if (!mutedRef.current && rms > THRESHOLD) { heard = true; quietSince = 0; }
      else if (heard) { quietSince ||= now; if (now - quietSince > SILENCE_MS) stop(); }
      if (now - t0 > MAX_TURN_MS || (!heard && now - t0 > IDLE_MS)) stop();
    }, 100);
    await done;
    window.clearInterval(meter.current);
    setLevel(0);
    if (!alive.current) return;
    if (!heard || !chunks.length) return listen();

    try {
      setPhase("transcribing");
      const type = r.mimeType || mime || "audio/webm";
      const b64 = await toBase64(new Blob(chunks, { type }));
      const { text } = await fns.current.t({ data: { audio: b64, mimeType: normalize(type, mime) } });
      if (!alive.current) return;
      if (!text.trim()) return listen();
      setTurns((t) => [...t, { role: "user", text }]);
      setPhase("thinking");
      const reply = await fns.current.a({ data: { message: text.slice(0, 1000) } });
      if (!alive.current) return;
      setTurns((t) => [...t, { role: "assistant", text: reply.message, reply }]);
      fns.current.onTurn?.();
      setPhase("speaking");
      const sp = await fns.current.s({ data: { text: reply.message.slice(0, 1800) } });
      if (!alive.current) return;
      await new Promise<void>((res) => {
        const a = new Audio(`data:${sp.mimeType};base64,${sp.audio}`);
        audio.current = a;
        a.onended = () => res();
        a.onerror = () => res();
        a.play().catch(() => res());
      });
      audio.current = null;
      if (alive.current) return listen();
    } catch (e) {
      if (!alive.current) return;
      const wait = retryAfter(e);
      setError(wait ? `Flamingo is catching its breath (rate limit). You can resume in ${wait}s, or type below.` : errMsg(e));
      if (wait) setCooldown(wait);
      setPhase("paused"); // never loop retries automatically
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const start = useCallback(async () => {
    setError(null);
    setTurns([]);
    setElapsed(0);
    setPhase("connecting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const c = new AudioContext();
      ctx.current = c;
      const an = c.createAnalyser();
      an.fftSize = 1024;
      c.createMediaStreamSource(s).connect(an);
      analyser.current = an;
      alive.current = true;
      mutedRef.current = false;
      setMuted(false);
      const began = Date.now();
      clock.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000);
      void listen();
    } catch (e) {
      teardown();
      setPhase("idle");
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was denied." : errMsg(e));
    }
  }, [listen, teardown]);

  const hangup = useCallback(() => { teardown(); setPhase("ended"); }, [teardown]);
  const resume = useCallback(() => { if (alive.current && cooldown <= 0) { setError(null); void listen(); } }, [listen, cooldown]);
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, []);

  return { phase, turns, muted, elapsed, level, error, cooldown, start, hangup, resume, toggleMute, live: phase !== "idle" && phase !== "ended" };
}
