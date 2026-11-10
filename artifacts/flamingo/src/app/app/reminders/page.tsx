"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Inbox, Info, Loader2, Send, X } from "lucide-react";
import { useDecideReminder, useListReminders, getListRemindersQueryKey, type Reminder, type ReminderDecisionDecision } from "@workspace/api-client-react";
import { EmptyState, ErrorState, PageHeader, Panel, ReminderStatusPill, RowsSkeleton } from "@/components/bits";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIntegrationFlags, useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { dateTime, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = ["pending", "approved", "sent", "rejected", "failed", "all"] as const;
const PAYPAL_NOTE = "Your personalized draft is available to copy. PayPal sends its own standard reminder; custom wording is not delivered by PayPal.";

export default function RemindersPage() {
  const q = useListReminders({ query: { queryKey: getListRemindersQueryKey() } });
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const list = (q.data ?? []).filter((r) => tab === "all" || r.status === tab);
  const count = (s: string) => (q.data ?? []).filter((r) => s === "all" || r.status === s).length;

  return (
    <div>
      <PageHeader eyebrow="Reminders" title="Your approval queue" sub="Approving never sends. Sending is a separate confirmed step, and only through a connected PayPal account." />
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-lagoon/25 bg-accent/60 px-4 py-3 text-sm text-accent-foreground" data-testid="text-paypal-disclosure">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{PAYPAL_NOTE} PayPal also limits reminders to 2 per invoice per day.</span>
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`tab-${t}`} className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm capitalize transition-colors", tab === t ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>
            {t} <span className="text-xs opacity-70 tnum">{count(t)}</span>
          </button>
        ))}
      </div>
      {q.isLoading ? <Panel><RowsSkeleton /></Panel> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : list.length === 0 ? (
        <Panel><EmptyState icon={<Inbox className="h-6 w-6" />} title={tab === "pending" ? "Inbox zero" : `No ${tab} reminders`} body="Draft one from an overdue invoice, or ask the assistant who needs a nudge." action={<Button size="sm" variant="outline" asChild><Link href="/app/invoices?status=overdue">See overdue invoices</Link></Button>} /></Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">{list.map((r) => <ReminderCard key={r.id} r={r} />)}</div>
      )}
    </div>
  );
}

function ReminderCard({ r }: { r: Reminder }) {
  const decide = useDecideReminder();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const flags = useIntegrationFlags();
  const [msg, setMsg] = useState(r.message);
  const [busy, setBusy] = useState<ReminderDecisionDecision | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setMsg(r.message), [r.message]);
  const editable = r.status === "pending";
  const tooShort = msg.trim().length < 10;

  async function act(decision: ReminderDecisionDecision) {
    setBusy(decision);
    try {
      await decide.mutateAsync({ id: r.id, data: { decision, ...(decision === "approve" && msg.trim() !== r.message ? { message: msg.trim() } : {}) } });
      await refresh();
      notify.ok(decision === "approve" ? "Approved — nothing sent yet" : decision === "reject" ? "Rejected" : "PayPal reminder sent", decision === "send" ? "PayPal delivered its standard reminder, not your custom wording." : undefined);
    } catch (e) { notify.fail(e); } finally { setBusy(null); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { notify.fail(new Error("Clipboard unavailable in this browser")); }
  }
  const sendBlock = !flags.paypalReady ? "PayPal isn't connected." : null;

  return (
    <Panel className="flex flex-col" >
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3" data-testid={`card-reminder-${r.id}`}>
        <div>
          <p className="font-medium">{r.customerName} <span className="text-muted-foreground">· {r.customerEmail}</span></p>
          <p className="text-xs text-muted-foreground"><Link href={`/app/invoices/${r.invoiceId}`} className="font-mono hover:text-primary">{r.invoiceNumber}</Link> · {money(r.amount)} · {r.tone} · {r.source === "groq" ? "AI draft (Groq)" : "Template draft"}</p>
        </div>
        <ReminderStatusPill status={r.status} />
      </div>
      <div className="flex-1 p-4">
        {editable ? (
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} rows={6} className="w-full rounded-xl border border-input bg-background/60 p-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid={`input-reminder-${r.id}`} />
        ) : (
          <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">{r.message}</p>
        )}
        {r.error && <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{r.error}</p>}
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Created {dateTime(r.createdAt)}{r.approvedAt && ` · approved ${dateTime(r.approvedAt)}`}{r.sentAt && ` · PayPal reminder ${dateTime(r.sentAt)}`}</p>
        {(r.status === "approved" || r.status === "sent") && <p className="mt-2 text-xs text-accent-foreground">{PAYPAL_NOTE}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-4 py-3">
        <Button size="sm" variant="ghost" onClick={copy} data-testid={`button-copy-${r.id}`}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy draft"}</Button>
        <div className="flex-1" />
        {r.status === "pending" && (
          <>
            <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={!!busy} data-testid={`button-reject-${r.id}`}>{busy === "reject" ? <Loader2 className="animate-spin" /> : <X />} Reject</Button>
            <Button size="sm" onClick={() => act("approve")} disabled={!!busy || tooShort} data-testid={`button-approve-${r.id}`}>{busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve</Button>
          </>
        )}
        {r.status === "approved" && (
          <>
            <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={!!busy} data-testid={`button-reject-${r.id}`}><X /> Reject</Button>
            <Button size="sm" onClick={() => setConfirm(true)} disabled={!!busy || !!sendBlock} title={sendBlock ?? undefined} data-testid={`button-send-${r.id}`}>{busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send PayPal reminder</Button>
          </>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send PayPal reminder for {r.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>{PAYPAL_NOTE} PayPal allows at most 2 reminders per invoice per day. Sample invoices will be refused.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => act("send")} data-testid={`button-confirm-send-${r.id}`}>Send PayPal reminder</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
