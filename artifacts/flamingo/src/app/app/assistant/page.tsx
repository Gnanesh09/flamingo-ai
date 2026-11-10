"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Inbox, Loader2, Mic, MicOff, PhoneOff, Play, Settings2 } from "lucide-react";
import { useAskAssistant, useGetConversation, getGetConversationQueryKey, type AssistantReply } from "@workspace/api-client-react";
import { ErrorState, InvoiceStatusPill, PageHeader, Panel, Skel } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { useIntegrationFlags, useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { useVoiceCall, type Phase } from "@/hooks/use-voice-call";
import { money, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

const PROMPTS = ["Who owes me the most?", "What's overdue more than 30 days?", "Draft a friendly reminder for the oldest overdue invoice", "How much did I collect so far?"];
const PHASE_LABEL: Record<Phase, string> = { idle: "Ready when you are", connecting: "Asking for your microphone", listening: "Listening", transcribing: "Catching that", thinking: "Thinking", speaking: "Speaking", paused: "Paused", ended: "Call ended" };

export default function AssistantPage() {
  const flags = useIntegrationFlags();
  const conv = useGetConversation({ query: { queryKey: getGetConversationQueryKey() } });
  const ask = useAskAssistant();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const [text, setText] = useState("");
  const [last, setLast] = useState<AssistantReply | null>(null);
  const voice = useVoiceCall(() => void refresh());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [conv.data?.length, ask.isPending]);

  async function send(msg: string) {
    const m = msg.trim();
    if (!m || ask.isPending) return;
    setText("");
    try { const r = await ask.mutateAsync({ data: { message: m.slice(0, 1000) } }); setLast(r); await refresh(); }
    catch (e) { setText(m); notify.fail(e, "The assistant couldn't answer"); }
  }

  const engineLabel = flags.groqReady ? "Groq connected" : "Offline demo rules";
  const mm = String(Math.floor(voice.elapsed / 60)).padStart(2, "0"), ss = String(voice.elapsed % 60).padStart(2, "0");

  return (
    <div>
      <PageHeader eyebrow="Assistant" title="Ask about your money" sub="Type or talk. Flamingo can explain, rank and draft — approvals always happen in Reminders." actions={<span className={cn("rounded-full px-3 py-1 text-xs", flags.groqReady ? "bg-accent text-accent-foreground" : "bg-sun/25")} data-testid="badge-engine">{engineLabel}</span>} />
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* text */}
        <Panel className="flex h-[70dvh] min-h-[480px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {conv.isLoading ? [0, 1, 2].map((i) => <Skel key={i} className={cn("h-14", i % 2 ? "ml-auto w-2/3" : "w-3/4")} />) : conv.isError ? <ErrorState error={conv.error} onRetry={() => conv.refetch()} /> : !conv.data?.length ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-lg font-medium">Start with a question.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">{PROMPTS.map((p) => <button key={p} onClick={() => send(p)} className="rounded-full border border-border bg-background px-3 py-1.5 text-sm hover:border-primary hover:text-primary" data-testid={`button-prompt-${p.slice(0, 10)}`}>{p}</button>)}</div>
                </div>
              </div>
            ) : conv.data.map((m) => (
              <div key={m.id} className={cn("max-w-[85%]", m.role === "user" ? "ml-auto" : "")}>
                <div className={cn("whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed", m.role === "user" ? "rounded-br-sm bg-foreground text-background" : "rounded-bl-sm bg-secondary/70")}>{m.content}</div>
                <p className={cn("mt-1 text-[0.65rem] text-muted-foreground", m.role === "user" && "text-right")}>{relative(m.createdAt)}{m.engine && ` · ${m.engine === "groq" ? "Groq" : "demo rules (offline)"}`}</p>
              </div>
            ))}
            {ask.isPending && <div className="flex gap-1 rounded-2xl bg-secondary/70 px-4 py-3 w-16">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 120}ms` }} />)}</div>}
            {last && !ask.isPending && <ReplyExtras r={last} />}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex items-end gap-2 border-t border-border/70 p-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} rows={1} maxLength={1000} placeholder="Ask about invoices, customers, what to chase…" className="max-h-32 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="input-assistant" />
            <Button type="submit" size="icon" disabled={!text.trim() || ask.isPending} className="h-10 w-10 rounded-xl" data-testid="button-ask">{ask.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}</Button>
          </form>
        </Panel>

        {/* voice */}
        <section className="relative flex flex-col overflow-hidden rounded-2xl bg-foreground text-background shadow-lg">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex items-center justify-between px-5 pt-5 text-xs">
            <span className="font-mono uppercase tracking-widest text-background/60">Voice line</span>
            <span className="font-mono tnum text-background/70" data-testid="text-call-timer">{voice.live ? `${mm}:${ss}` : "00:00"}</span>
          </div>
          <div className="relative grid flex-1 place-items-center py-8">
            <div className="relative grid h-40 w-40 place-items-center">
              {voice.phase === "listening" && !voice.muted && <span className="ripple absolute inset-0 rounded-full border-2 border-primary/60" />}
              <span className="absolute inset-0 rounded-full bg-primary/25 transition-transform duration-100" style={{ transform: `scale(${1 + Math.min(voice.level * 6, 0.45)})` }} />
              <span className={cn("relative grid h-32 w-32 place-items-center rounded-full", flags.voiceReady ? "bg-primary" : "bg-background/10")}>
                {voice.phase === "thinking" || voice.phase === "transcribing" || voice.phase === "connecting" ? <Loader2 className="h-10 w-10 animate-spin" /> : voice.muted ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
              </span>
            </div>
            <p className="mt-5 text-lg font-medium" data-testid="text-call-phase">{flags.voiceReady ? PHASE_LABEL[voice.phase] : "Voice isn't set up"}</p>
            <p className="mt-1 max-w-xs px-6 text-center text-xs text-background/60">
              {flags.voiceReady ? "The mic only opens after you press Start. It stops between turns and closes when you hang up." : "Connect Deepgram in Settings to talk. The text assistant works meanwhile."}
            </p>
            {voice.error && <p className="mx-6 mt-3 rounded-lg bg-primary/20 px-3 py-2 text-center text-xs" data-testid="text-voice-error">{voice.error}</p>}
          </div>
          <div className="relative flex items-center justify-center gap-3 pb-5">
            {!voice.live ? (
              flags.voiceReady ? (
                <button onClick={() => void voice.start()} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground" data-testid="button-start-call"><Mic className="h-4 w-4" /> Start talking</button>
              ) : (
                <Link href="/app/settings" className="inline-flex items-center gap-2 rounded-full border border-background/25 px-5 py-3 text-sm" data-testid="link-voice-setup"><Settings2 className="h-4 w-4" /> Set up voice</Link>
              )
            ) : (
              <>
                <button onClick={voice.toggleMute} className={cn("grid h-12 w-12 place-items-center rounded-full", voice.muted ? "bg-background text-foreground" : "bg-background/15")} aria-label={voice.muted ? "Unmute" : "Mute"} data-testid="button-mute">{voice.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>
                {voice.phase === "paused" && <button onClick={voice.resume} disabled={voice.cooldown > 0} className="inline-flex h-12 items-center gap-2 rounded-full bg-background/15 px-4 text-sm disabled:opacity-50" data-testid="button-resume"><Play className="h-4 w-4" /> {voice.cooldown > 0 ? `${voice.cooldown}s` : "Resume"}</button>}
                <button onClick={voice.hangup} className="grid h-12 w-12 place-items-center rounded-full bg-destructive" aria-label="Hang up" data-testid="button-hangup"><PhoneOff className="h-5 w-5" /></button>
              </>
            )}
          </div>
          {voice.turns.length > 0 && (
            <div className="relative max-h-56 space-y-2 overflow-y-auto border-t border-background/10 bg-background/5 p-4 text-sm" data-testid="list-transcript">
              {voice.turns.map((t, i) => (
                <div key={i}>
                  <p><span className="mr-2 font-mono text-[0.65rem] uppercase text-primary">{t.role === "user" ? "You" : "Flamingo"}</span>{t.text}</p>
                  {t.reply && t.reply.reminderIds.length > 0 && <Link href="/app/reminders" className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline"><Inbox className="h-3 w-3" /> Review {t.reply.reminderIds.length} draft{t.reply.reminderIds.length > 1 ? "s" : ""} — voice can't approve</Link>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ReplyExtras({ r }: { r: AssistantReply }) {
  if (!r.steps.length && !r.invoices.length && !r.reminderIds.length) return null;
  return (
    <div className="rounded-2xl border border-dashed border-border p-3 text-xs">
      <p className="mb-2 font-mono uppercase tracking-widest text-muted-foreground">{r.engine === "groq" ? "Groq" : "Demo rules · offline"}{r.cached && " · cached"}</p>
      {r.steps.length > 0 && <ol className="mb-2 list-decimal space-y-0.5 pl-4 text-muted-foreground">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {r.invoices.length > 0 && <div className="flex flex-wrap gap-2">{r.invoices.map((i) => <Link key={i.id} href={`/app/invoices/${i.id}`} className="flex items-center gap-2 rounded-lg bg-card px-2 py-1 hover:ring-1 hover:ring-primary"><span className="font-mono">{i.number}</span><InvoiceStatusPill status={i.status} /><span className="tnum">{money(i.balance)}</span></Link>)}</div>}
      {r.reminderIds.length > 0 && <Link href="/app/reminders" className="mt-2 inline-flex items-center gap-1 text-primary underline"><Inbox className="h-3 w-3" /> {r.reminderIds.length} draft{r.reminderIds.length > 1 ? "s" : ""} waiting for your approval</Link>}
    </div>
  );
}
