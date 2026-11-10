"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Loader2, MessagesSquare, PauseCircle, RotateCw, Sparkles, X } from "lucide-react";
import {
  useAnalyzeResolution, useDecideResolution, useListResolutions, getListResolutionsQueryKey,
  type Resolution, type ResolutionAnalysis, type ResolutionDecisionAction,
} from "@workspace/api-client-react";
import { EmptyState, ErrorState, PageHeader, Panel, PanelHead, RowsSkeleton, SourceTag } from "@/components/bits";
import { ResolutionStatusPill, TermsCompare, Thread } from "@/components/resolution-bits";
import { Button } from "@/components/ui/button";
import { useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { BUCKETS, KIND_LABEL, bucketOf, isConflict, type Bucket } from "@/lib/resolution";
import { money, relative, todayPlus } from "@/lib/format";
import { cn } from "@/lib/utils";

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const q = useListResolutions({ query: { queryKey: getListResolutionsQueryKey() } });
  const [filter, setFilter] = useState<Bucket | "all">("all");
  const selectedId = params.get("id");
  const list = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [q.data]);
  const shown = filter === "all" ? list : list.filter((r) => bucketOf(r) === filter);
  const selected = list.find((r) => r.id === selectedId) ?? null;
  const select = (id: string | null) => router.replace(id ? `/app/resolutions?id=${id}` : "/app/resolutions", { scroll: false });

  return (
    <div>
      <PageHeader
        eyebrow="Resolution center"
        title="Decisions, not reminders."
        sub="Each case is a customer telling you why an invoice isn't paid yet. Read the thread, then decide explicitly. Nothing changes until you do."
        actions={<Button variant="outline" className="min-h-11" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refresh-resolutions">{q.isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />} Refresh</Button>}
      />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter cases">
        {[{ id: "all" as const, label: "All" }, ...BUCKETS].map((b) => {
          const n = b.id === "all" ? list.length : list.filter((r) => bucketOf(r) === b.id).length;
          return (
            <button key={b.id} role="tab" aria-selected={filter === b.id} onClick={() => setFilter(b.id)} data-testid={`tab-bucket-${b.id}`}
              className={cn("inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm transition-colors", filter === b.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {b.label} <span className="tnum text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.85fr)_1.4fr]">
        <Panel className={cn("overflow-hidden lg:sticky lg:top-6 lg:self-start", selected && "hidden lg:block")}>
          {q.isLoading ? <RowsSkeleton rows={6} /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : shown.length === 0 ? (
            <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title={list.length ? "Nothing in this view" : "No conversations yet"}
              body={list.length ? "Try another filter." : "Open an unpaid invoice and create a customer link. When the customer responds, the case appears here."}
              action={!list.length ? <Button asChild size="sm"><Link href="/app/invoices">Go to invoices</Link></Button> : undefined} />
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-border/70 overflow-y-auto">
              {shown.map((r) => (
                <li key={r.id}>
                  <button onClick={() => select(r.id)} data-testid={`row-resolution-${r.id}`}
                    className={cn("flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/50", selected?.id === r.id && "bg-primary/5")}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", bucketOf(r) === "decide" ? "bg-primary" : bucketOf(r) === "committed" ? "bg-lagoon" : bucketOf(r) === "verified" ? "bg-lagoon/40" : "bg-muted-foreground/40")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{r.customerName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{relative(r.updatedAt)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.invoiceNumber} · {money(r.balance)} · {KIND_LABEL[r.kind]}</span>
                      <span className="mt-1.5 flex items-center gap-1.5"><ResolutionStatusPill status={r.status} /><SourceTag source={r.source} /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className={cn(!selected && "hidden lg:block")}>
          {selected ? <Detail key={selected.id} r={selected} onBack={() => select(null)} /> : (
            <Panel className="grid min-h-[320px] place-items-center p-8 text-center">
              <div>
                <p className="text-lg font-medium">Pick a conversation</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">The thread, the terms the customer asked for and your decision options open here.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

const ACTIONS: { id: ResolutionDecisionAction; label: string; hint: string }[] = [
  { id: "approve_date", label: "Approve their request", hint: "Accepts the customer's exact date and amount. Reminders pause until that date ends (UTC)." },
  { id: "propose_plan", label: "Propose a plan", hint: "Suggest a date and amount. The customer must accept it. Not a discount; the invoice total stays the same." },
  { id: "reply", label: "Reply", hint: "Answer or ask a question. Status and terms stay as they are." },
  { id: "reject", label: "Decline", hint: "Say no to the request, with an explanation the customer will read." },
];

function Detail({ r, onBack }: { r: Resolution; onBack: () => void }) {
  const decide = useDecideResolution();
  const analyze = useAnalyzeResolution();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const [analysis, setAnalysis] = useState<ResolutionAnalysis | null>(null);
  const closed = r.status === "resolved";
  const canApprove = r.kind === "needs_time" && r.status === "needs_review" && !!r.requestedDate && !!r.requestedAmount;
  const canDecline = r.commitment?.state !== "accepted" || canApprove;
  const available = ACTIONS.filter((a) => a.id === "approve_date" ? canApprove : a.id === "reject" ? canDecline : true);
  const [action, setAction] = useState<ResolutionDecisionAction>(canApprove && r.status === "needs_review" ? "approve_date" : "reply");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState(r.requestedDate ?? todayPlus(14));
  const [amount, setAmount] = useState(String(r.requestedAmount ?? r.balance));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setErr(null); }, [action]);
  useEffect(() => {
    if ((action === "approve_date" && !canApprove) || (action === "reject" && !canDecline)) setAction("reply");
  }, [action, canApprove, canDecline]);

  async function runAnalysis() {
    try { setAnalysis(await analyze.mutateAsync({ id: r.id })); } catch (e) { notify.fail(e, "Analysis unavailable"); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return setErr(action === "reject" ? "Explain why, so the customer understands." : "Write a short message for the customer.");
    const data: { action: ResolutionDecisionAction; message: string; version: number; date?: string; amount?: number } = { action, message: text, version: r.version };
    if (action === "propose_plan") {
      const n = Number(amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Choose a date.");
      if (!(n >= 0.01)) return setErr("Enter an amount above zero.");
      data.date = date; data.amount = n;
    }
    if (action === "approve_date") { data.date = r.requestedDate; data.amount = r.requestedAmount; }
    try {
      await decide.mutateAsync({ id: r.id, data });
      setMessage("");
      await refresh();
      notify.ok("Decision recorded", "The customer sees it next time they open their link.");
    } catch (e2) {
      notify.fail(e2, isConflict(e2) ? "This case changed. Review the latest and try again." : "Decision not saved");
    }
  }

  const hint = ACTIONS.find((a) => a.id === action)?.hint;

  return (
    <div className="rise space-y-5">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden"><ArrowLeft className="h-4 w-4" /> All cases</button>
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{KIND_LABEL[r.kind]}</p>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{r.customerName}</h2>
            <p className="mt-1 text-sm"><Link href={`/app/invoices/${r.invoiceId}`} className="font-mono text-primary hover:underline">{r.invoiceNumber}</Link> · balance <b className="tnum">{money(r.balance)}</b></p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <ResolutionStatusPill status={r.status} />
            {r.reminderPaused && <span className="inline-flex items-center gap-1 text-xs text-lagoon"><PauseCircle className="h-3.5 w-3.5" /> Reminders paused</span>}
          </div>
        </div>
        {r.status === "verification_needed" && <p className="mt-4 rounded-xl bg-sun/20 px-3 py-2.5 text-sm">The customer says they paid. That is a claim, not proof. Sync the invoice with PayPal to verify; only a sync closes the case.</p>}
        {r.status === "missed" && <p className="mt-4 rounded-xl bg-coral/15 px-3 py-2.5 text-sm">The agreed date passed without a verified payment. Reply, or propose a new plan.</p>}
        <div className="mt-4"><TermsCompare requestedDate={r.requestedDate} requestedAmount={r.requestedAmount} commitment={r.commitment} /></div>
      </Panel>

      <Panel>
        <PanelHead title="Conversation" right={<span className="text-xs text-muted-foreground">v{r.version}</span>} />
        <div className="max-h-[440px] overflow-y-auto p-4"><Thread messages={r.messages} viewer="owner" /></div>
      </Panel>

      <Panel>
        <PanelHead title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Suggested read</span>}
          right={<Button size="sm" variant="ghost" className="min-h-11 text-primary" onClick={runAnalysis} disabled={analyze.isPending} data-testid="button-analyze">{analyze.isPending ? <Loader2 className="animate-spin" /> : null}{analysis ? "Re-analyze" : "Analyze"}</Button>} />
        <div className="p-4 text-sm">
          {analysis ? (
            <div className="rise space-y-3" data-testid="analysis">
              <p className="leading-relaxed">{analysis.summary}</p>
              <p className="rounded-xl bg-secondary/60 px-3 py-2"><span className="text-xs font-medium uppercase tracking-wider text-secondary-foreground">Suggestion</span><br />{analysis.suggestedAction}</p>
              {analysis.evidence.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Grounded in</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{analysis.evidence.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              {analysis.steps.length > 0 && <ol className="list-decimal space-y-0.5 pl-5">{analysis.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>}
              <p className="text-xs text-muted-foreground">Engine: {analysis.engine === "groq" ? "Groq model" : "demo rules"}. A suggestion only; nothing runs until you decide below.</p>
            </div>
          ) : <p className="text-muted-foreground">Ask for a short read of this case based on the thread and invoice. It never acts on its own.</p>}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Your decision" />
        {closed ? (
          <p className="p-4 text-sm text-muted-foreground">Resolved by a verified PayPal sync. This case is read-only.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4 p-4">
            <fieldset>
              <legend className="sr-only">Decision type</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {available.map((a) => (
                  <label key={a.id} className={cn("flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-sm transition-all", action === a.id ? "border-primary bg-primary/5 font-medium text-primary" : "border-border hover:border-primary/40")} data-testid={`option-decision-${a.id}`}>
                    <input type="radio" name="decision" value={a.id} checked={action === a.id} onChange={() => setAction(a.id)} className="sr-only" />
                    {a.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{hint}{r.commitment?.state === "accepted" && action !== "propose_plan" ? " A commitment is in place; to change it, propose a new plan." : ""}</p>
            </fieldset>
            {action === "approve_date" && <p className="rounded-xl bg-accent/60 px-3 py-2 text-sm text-accent-foreground">Approving <b className="tnum">{money(r.requestedAmount)}</b> by <b>{r.requestedDate}</b>, exactly as requested.</p>}
            {action === "propose_plan" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Pay by<input type="date" required value={date} min={todayPlus(0)} onChange={(e) => setDate(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-card px-3" data-testid="input-plan-date" /></label>
                <label className="text-sm font-medium">Amount<input type="number" required step="0.01" min="0.01" max={1000000} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-input bg-card px-3 tnum" data-testid="input-plan-amount" /></label>
              </div>
            )}
            <label className="block text-sm font-medium">Message to {r.customerName}
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} required
                placeholder={action === "reject" ? "Explain why you can't agree to this." : action === "approve_date" ? "Thanks, that date works." : "Write your message."}
                className="mt-1 block w-full rounded-xl border border-input bg-card px-3 py-2.5 font-normal outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" data-testid="input-decision-message" />
            </label>
            {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" className="min-h-11" disabled={decide.isPending} data-testid="button-submit-decision">
                {decide.isPending ? <Loader2 className="animate-spin" /> : action === "reject" ? <X /> : <Check />} {ACTIONS.find((a) => a.id === action)?.label}
              </Button>
              <p className="text-xs text-muted-foreground">Shown in the customer's portal. Not emailed.</p>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}

export default function ResolutionsPage() {
  return <Suspense fallback={<RowsSkeleton />}><Inner /></Suspense>;
}
