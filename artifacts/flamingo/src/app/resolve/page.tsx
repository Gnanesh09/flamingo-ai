"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Check, CircleHelp, CreditCard, ExternalLink, Loader2, Lock, MessageSquare, Mic, ReceiptText, RotateCw, Square, TriangleAlert } from "lucide-react";
import {
  useRespondPortal, useSyncPortal, useTranscribePortal, useViewPortal,
  type PortalAudioMimeType, type PortalResponseAction, type PortalView,
} from "@workspace/api-client-react";
import { FlamingoMark } from "@/components/brand";
import { Skel } from "@/components/bits";
import { ResolutionStatusPill, TermsCompare, Thread } from "@/components/resolution-bits";
import { dateTime, errMsg, money, shortDate, todayPlus } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "time" | "wrong" | "paid" | "message" | "accept";
const ENDED = new Set([401, 403, 404, 410]);
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;

function readToken() {
  const h = window.location.hash.replace(/^#/, "");
  const p = new URLSearchParams(h);
  return (p.get("token") ?? h).trim();
}

export default function ResolvePage() {
  const view = useViewPortal();
  const sync = useSyncPortal();
  const respond = useRespondPortal();
  const viewRef = useRef(view.mutateAsync);
  viewRef.current = view.mutateAsync;
  const tokenRef = useRef<string>("");
  const inFlight = useRef(false);
  const [data, setData] = useState<PortalView | null>(null);
  const [phase, setPhase] = useState<"loading" | "no-token" | "ended" | "error" | "ready">("loading");
  const [problem, setProblem] = useState<string>("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleErr = useCallback((e: unknown) => {
    const s = statusOf(e);
    setProblem(errMsg(e));
    if (s && ENDED.has(s)) { setPhase("ended"); setData(null); return true; }
    return false;
  }, []);

  const load = useCallback(async (initial = false): Promise<void> => {
    if (!tokenRef.current || inFlight.current) return;
    const requestToken = tokenRef.current;
    inFlight.current = true;
    try {
      const v = await viewRef.current({ data: { token: requestToken } });
      if (requestToken !== tokenRef.current) return;
      setData(previous => previous && (previous.resolution?.version ?? 0) > (v.resolution?.version ?? 0) ? previous : v);
      setPhase("ready");
    } catch (e) {
      if (requestToken !== tokenRef.current) return;
      if (!handleErr(e)) {
        if (initial) setPhase("error");
        else setNotice(errMsg(e));
      }
    } finally {
      inFlight.current = false;
      if (tokenRef.current && requestToken !== tokenRef.current) void load(true);
    }
  }, [handleErr]);

  useEffect(() => {
    const init = () => {
      const t = readToken();
      tokenRef.current = t;
      setData(null); setMode(null); setNotice(null);
      if (!t) { setPhase("no-token"); return; }
      setPhase("loading");
      void load(true);
    };
    init();
    window.addEventListener("hashchange", init);
    return () => { tokenRef.current = ""; window.removeEventListener("hashchange", init); };
  }, [load]);

  // 30s polling only while visible and loaded; no overlap (inFlight guard)
  const pollable = phase === "ready";
  useEffect(() => {
    if (!pollable) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void load(), 30_000); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => (document.visibilityState === "visible" ? (void load(), start()) : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [pollable, load]);

  async function refreshNow() {
    if (inFlight.current) return;
    inFlight.current = true;
    try { setData(await sync.mutateAsync({ data: { token: tokenRef.current } })); setNotice("Checked just now."); }
    catch (e) { if (!handleErr(e)) setNotice(errMsg(e)); }
    finally { inFlight.current = false; }
  }

  async function submit(action: PortalResponseAction, message: string, extra?: { date: string; amount: number }) {
    if (!data) return false;
    try {
      const v = await respond.mutateAsync({ data: { token: tokenRef.current, action, message, version: data.resolution?.version ?? 0, ...(extra ?? {}) } });
      setData(v); setMode(null); setNotice("Sent. The business sees it in their Flamingo workspace; nobody is emailed.");
      return true;
    } catch (e) {
      if (!handleErr(e)) { setNotice(statusOf(e) === 409 ? "Something changed while you were writing. The latest is loaded; please review and send again." : errMsg(e)); void load(); }
      return false;
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <FlamingoMark className="h-7 w-7" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{data?.businessName ?? "Invoice conversation"}</p>
              <p className="text-[0.7rem] text-muted-foreground">via Flamingo · no account needed</p>
            </div>
          </div>
          {phase === "ready" && <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => void load()} disabled={view.isPending} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm hover:bg-muted" data-testid="button-portal-refresh">
              {view.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Refresh
            </button>
            {data?.invoice.source === "paypal" && <button onClick={refreshNow} disabled={sync.isPending} className="min-h-11 rounded-full bg-foreground px-4 text-sm text-background" data-testid="button-verify-payment">
              {sync.isPending ? "Checking…" : "Check PayPal"}
            </button>}
          </div>}
        </div>
        <p className="bg-secondary/70 px-4 py-1.5 text-center text-[0.72rem] text-secondary-foreground" data-testid="banner-portal-sample">
          {data?.invoice.source === "demo" ? "Sample invoice. Conversation works; payments cannot be made or verified." : "PayPal Sandbox only. Test payments, never real money."}
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        {phase === "loading" && <div className="space-y-4"><Skel className="h-8 w-48" /><Skel className="h-40" /><Skel className="h-24" /></div>}
        {phase === "no-token" && <Blocked icon={<Lock className="h-6 w-6" />} title="This link is incomplete" body="Open the full link the business shared with you. The access code is the part after the # sign." />}
        {phase === "ended" && <Blocked icon={<Lock className="h-6 w-6" />} title="This link no longer works" body={`It has expired or the business revoked it. Ask them for a new link. ${problem ? `(${problem})` : ""}`} testid="state-access-ended" />}
        {phase === "error" && <Blocked icon={<AlertTriangle className="h-6 w-6" />} title="Couldn't load the invoice" body={problem} action={<button onClick={() => { setPhase("loading"); void load(true); }} className="min-h-11 rounded-full bg-foreground px-5 text-sm text-background">Try again</button>} />}
        {phase === "ready" && data && <Portal data={data} mode={mode} setMode={setMode} notice={notice} clearNotice={() => setNotice(null)} submit={submit} busy={respond.isPending} token={tokenRef} />}
      </main>
    </div>
  );
}

function Blocked({ icon, title, body, action, testid }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode; testid?: string }) {
  return (
    <div className="rise mx-auto mt-10 flex max-w-md flex-col items-center gap-3 text-center" data-testid={testid}>
      <div className="grid h-14 w-14 place-items-center rounded-full bg-secondary text-primary">{icon}</div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function Portal({ data, mode, setMode, notice, clearNotice, submit, busy, token }: {
  data: PortalView; mode: Mode | null; setMode: (m: Mode | null) => void; notice: string | null; clearNotice: () => void;
  submit: (a: PortalResponseAction, m: string, x?: { date: string; amount: number }) => Promise<boolean>; busy: boolean; token: React.MutableRefObject<string>;
}) {
  const inv = data.invoice;
  const r = data.resolution;
  const readOnly = inv.status === "paid" || inv.status === "cancelled" || r?.status === "resolved";
  const proposal = r?.commitment?.state === "proposed" ? r.commitment : null;

  const choices: { id: Mode | "pay"; label: string; sub: string; icon: typeof CreditCard }[] = [
    { id: "pay", label: "Pay now", sub: inv.paymentUrl ? "Opens the PayPal sandbox invoice" : "No payment link yet", icon: CreditCard },
    { id: "time", label: "I need more time", sub: "Suggest a date and amount", icon: CalendarClock },
    { id: "wrong", label: "Something is wrong", sub: "Tell them what to fix", icon: TriangleAlert },
    { id: "paid", label: "I already paid", sub: "They'll check PayPal", icon: Check },
  ];

  return (
    <div className="space-y-6">
      <section className="rise">
        <p className="text-sm text-muted-foreground">Invoice <span className="font-mono">{inv.number}</span> for {inv.customerName}</p>
        <h1 className="mt-1 text-[clamp(2.4rem,9vw,3.6rem)] font-semibold leading-none tracking-tight tnum" data-testid="text-portal-balance">{money(inv.balance, inv.currency)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {inv.status === "paid" ? "Paid in full." : inv.status === "cancelled" ? "This invoice was cancelled." : <>Due {shortDate(inv.dueDate)} · total {money(inv.amount, inv.currency)}{inv.paidAmount > 0 && <> · {money(inv.paidAmount, inv.currency)} paid</>}</>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {inv.lastSyncedAt ? `Payment status last verified with PayPal ${dateTime(inv.lastSyncedAt)}.` : "Payment status has not been verified with PayPal yet."} Link expires {dateTime(data.expiresAt)}.
        </p>
        {r && <div className="mt-3 flex items-center gap-2"><ResolutionStatusPill status={r.status} />{r.status === "verification_needed" && <span className="text-xs text-muted-foreground">Your payment claim is waiting for PayPal verification.</span>}</div>}
      </section>

      {notice && (
        <div role="status" className="rise flex items-start justify-between gap-3 rounded-2xl border border-lagoon/30 bg-accent/60 px-4 py-3 text-sm text-accent-foreground">
          <span>{notice}</span><button onClick={clearNotice} className="min-h-11 min-w-11 text-xs underline" aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      {proposal && !readOnly && (
        <section className="rise rounded-2xl border-2 border-primary/40 bg-primary/5 p-5" data-testid="panel-proposal">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">The business proposed a plan</p>
          <p className="mt-1 text-2xl font-semibold tnum">{money(proposal.amount, inv.currency)} by {shortDate(proposal.date)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Accepting is a promise to pay on that date. It is not a discount and nothing is charged automatically.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setMode("accept")} className="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground" data-testid="button-accept-proposal">Accept this plan</button>
            <button onClick={() => setMode("message")} className="min-h-11 rounded-full border border-border px-5 text-sm">Reply instead</button>
          </div>
        </section>
      )}

      {r && <TermsCompare requestedDate={r.requestedDate} requestedAmount={r.requestedAmount} commitment={r.commitment} currency={inv.currency} />}

      {readOnly ? (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground" data-testid="text-portal-readonly">This conversation is closed and read-only.</p>
      ) : mode ? (
        <Composer key={mode} mode={mode} data={data} busy={busy} token={token} onCancel={() => setMode(null)} submit={submit} />
      ) : (
        <section aria-label="What would you like to do?">
          <h2 className="text-lg font-semibold">What would you like to do?</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {choices.map((c) => {
              const disabled = c.id === "pay" && !inv.paymentUrl;
              return (
                <button key={c.id} disabled={disabled} data-testid={`button-portal-${c.id}`}
                  onClick={() => (c.id === "pay" ? inv.paymentUrl && window.open(inv.paymentUrl, "_blank", "noopener,noreferrer") : setMode(c.id))}
                  className={cn("group flex min-h-[72px] items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-primary/50 enabled:hover:shadow-md disabled:opacity-60", c.id === "pay" && !disabled ? "border-foreground bg-foreground text-background" : "border-border")}>
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", c.id === "pay" && !disabled ? "bg-primary text-primary-foreground" : "bg-secondary text-primary")}><c.icon className="h-5 w-5" /></span>
                  <span className="flex-1"><span className="block font-medium">{c.label}</span><span className={cn("block text-xs", c.id === "pay" && !disabled ? "text-background/65" : "text-muted-foreground")}>{c.sub}</span></span>
                  {c.id === "pay" && !disabled && <ExternalLink className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
          {!inv.paymentUrl && <p className="mt-2 text-xs text-muted-foreground">A pay button appears once the business has sent this invoice through PayPal{inv.source === "demo" ? "; this is a sample invoice, so it never will" : ""}.</p>}
          <button onClick={() => setMode("message")} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm text-primary hover:underline" data-testid="button-portal-message">
            <CircleHelp className="h-4 w-4" /> {r ? "Reply to the business" : "Ask a question"}
          </button>
        </section>
      )}

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><MessageSquare className="h-4 w-4 text-primary" /> Conversation</h2>
        <div className="mt-3 rounded-2xl border border-border bg-card/60 p-4">
          {r ? <Thread messages={r.messages} viewer="customer" /> : <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet. Anything you send appears here, along with updates from {data.businessName}.</p>}
        </div>
      </section>

      <details className="rounded-2xl border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium"><ReceiptText className="h-4 w-4 text-primary" /> Line items</summary>
        <table className="w-full text-sm"><tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-t border-border/60"><td className="px-4 py-2.5">{it.name}</td><td className="px-4 py-2.5 text-right text-muted-foreground tnum">{it.quantity} x {money(it.unitPrice, inv.currency)}</td><td className="px-4 py-2.5 text-right font-medium tnum">{money(it.quantity * it.unitPrice, inv.currency)}</td></tr>
          ))}
        </tbody></table>
      </details>
      <p className="pb-6 text-center text-xs text-muted-foreground">Anyone with this link can see this invoice. Don't forward it. Saying you've paid doesn't mark it paid; only a PayPal check does.</p>
    </div>
  );
}

const MODE_COPY: Record<Mode, { title: string; placeholder: string; action?: PortalResponseAction }> = {
  time: { title: "Ask for more time", placeholder: "A little context helps, e.g. our client pays us on the 30th.", action: "needs_time" },
  wrong: { title: "Tell them what's wrong", placeholder: "Which item, amount or detail looks off, and why?", action: "dispute" },
  paid: { title: "Tell them you already paid", placeholder: "When and how did you pay? Any reference number?", action: "already_paid" },
  message: { title: "Write a message", placeholder: "Your question or reply." },
  accept: { title: "Accept the proposed plan", placeholder: "Optional note", action: "accept_proposal" },
};

function Composer({ mode, data, busy, token, onCancel, submit }: { mode: Mode; data: PortalView; busy: boolean; token: React.MutableRefObject<string>; onCancel: () => void; submit: (a: PortalResponseAction, m: string, x?: { date: string; amount: number }) => Promise<boolean> }) {
  const copy = MODE_COPY[mode];
  const [message, setMessage] = useState(mode === "accept" ? "I accept the proposed plan." : "");
  const [date, setDate] = useState(todayPlus(14));
  const [amount, setAmount] = useState(String(data.invoice.balance));
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return setErr("Please write a short message.");
    let extra: { date: string; amount: number } | undefined;
    if (mode === "time") {
      const n = Number(amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Choose a date.");
      if (!(n >= 0.01)) return setErr("Enter an amount above zero.");
      extra = { date, amount: n };
    }
    setErr(null);
    await submit(copy.action ?? (data.resolution ? "reply" : "question"), text, extra);
  }

  return (
    <form onSubmit={onSubmit} className="rise space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid={`form-portal-${mode}`}>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      {mode === "time" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">I can pay by<input type="date" required min={todayPlus(0)} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3" data-testid="input-portal-date" /></label>
          <label className="text-sm font-medium">Amount<input type="number" required step="0.01" min="0.01" max={1000000} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-background px-3 tnum" data-testid="input-portal-amount" /></label>
          <p className="text-xs text-muted-foreground sm:col-span-2">This is a request. The business decides; the invoice due date stays the same unless they agree.</p>
        </div>
      )}
      {mode === "paid" && <p className="rounded-xl bg-sun/20 px-3 py-2 text-sm">Thanks. The business will check PayPal. The invoice stays open until that check confirms payment.</p>}
      <label className="block text-sm font-medium">Message
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder={copy.placeholder}
          className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" data-testid="input-portal-message" />
      </label>
      <VoiceNote enabled={data.voiceEnabled} token={token} onText={(t) => setMessage((m) => (m.trim() ? `${m.trim()} ${t}` : t))} />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50" data-testid="button-portal-submit">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </form>
  );
}

const MIMES: PortalAudioMimeType[] = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function VoiceNote({ enabled, token, onText }: { enabled: boolean; token: React.MutableRefObject<string>; onText: (t: string) => void }) {
  const transcribe = useTranscribePortal();
  const tRef = useRef(transcribe.mutateAsync);
  tRef.current = transcribe.mutateAsync;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (rec.current && rec.current.state !== "inactive") { rec.current.onstop = null; rec.current.stop(); }
      cleanup();
    };
  }, [cleanup]);

  async function start() {
    setErr(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return setErr("Recording isn't supported in this browser.");
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return setErr("This browser can't record a supported audio format.");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      const r = new MediaRecorder(s, { mimeType: mime });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        cleanup();
        if (!alive.current) return;
        setState("busy");
        try {
          const blob = new Blob(chunks, { type: mime });
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          const res = await tRef.current({ data: { token: token.current, audio: btoa(bin), mimeType: mime } });
          if (alive.current && res.text.trim()) onTextRef.current(res.text.trim());
          else if (alive.current) setErr("Didn't catch any words. Try again or type instead.");
        } catch (e) { if (alive.current) setErr(errMsg(e)); }
        finally { if (alive.current) setState("idle"); }
      };
      rec.current = r;
      r.start();
      setSecs(0); setState("rec");
      timers.current.push(setInterval(() => setSecs((x) => x + 1), 1000));
      timers.current.push(setTimeout(() => r.state !== "inactive" && r.stop(), 20_000));
    } catch { cleanup(); setErr("Microphone permission was denied."); }
  }
  const stop = () => { if (rec.current && rec.current.state !== "inactive") rec.current.stop(); };

  if (!enabled) return <p className="text-xs text-muted-foreground">Voice notes are off for this workspace. Typing works fine.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === "rec" ? (
        <button type="button" onClick={stop} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-4 text-sm text-background" data-testid="button-voice-stop">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-primary" /><span className="h-2.5 w-2.5 rounded-full bg-primary" /></span>
          <Square className="h-3.5 w-3.5" /> Stop · <span className="tnum">{20 - secs}s</span>
        </button>
      ) : (
        <button type="button" onClick={start} disabled={state === "busy"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm hover:border-primary/50 disabled:opacity-50" data-testid="button-voice-record">
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4 text-primary" />} {state === "busy" ? "Transcribing" : "Record a voice note"}
        </button>
      )}
      <span className="text-xs text-muted-foreground">{err ?? "Up to 20 seconds. The text is added above for you to check before sending."}</span>
    </div>
  );
}
