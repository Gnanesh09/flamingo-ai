"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox, Plus, ReceiptText, Sparkles } from "lucide-react";
import { useGetDashboard, getGetDashboardQueryKey, useGetSession, getGetSessionQueryKey, type Invoice } from "@workspace/api-client-react";
import { EmptyState, ErrorState, InvoiceStatusPill, Panel, PanelHead, Skel, SourceTag } from "@/components/bits";
import { ResolutionOverview } from "@/components/resolution-overview";
import { InvoiceFormDialog } from "@/components/invoice-form";
import { PrepareReminderDialog } from "@/components/prepare-reminder";
import { Button } from "@/components/ui/button";
import { money, relative, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Overview() {
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const q = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const [newOpen, setNewOpen] = useState(false);
  const [prep, setPrep] = useState<Invoice | null>(null);
  const d = q.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const maxAging = Math.max(1, ...(d?.aging.map((a) => a.amount) ?? [1]));

  return (
    <div>
      <div className="rise mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Overview</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-[2.4rem]">
            {greet}, {session.data?.username?.split(" ")[0] ?? "there"}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d ? (d.overdueCount > 0 ? `${d.overdueCount} invoice${d.overdueCount === 1 ? "" : "s"} past due, ${d.pendingApprovals} reminder${d.pendingApprovals === 1 ? "" : "s"} waiting on you.` : "Nothing overdue. Enjoy it.") : "Reading your ledger…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/app/resolutions"><Sparkles /> Resolution center</Link></Button>
          <Button onClick={() => setNewOpen(true)} data-testid="button-new-invoice"><Plus /> New draft</Button>
        </div>
      </div>

      <ResolutionOverview />

      {/* hero numbers */}
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rise relative overflow-hidden rounded-2xl bg-foreground p-6 text-background shadow-lg">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/40 blur-2xl" />
          <p className="relative text-xs uppercase tracking-widest text-background/60">Outstanding</p>
          {d ? <p className="relative mt-2 text-5xl font-semibold tracking-tight tnum" data-testid="text-outstanding">{money(d.outstanding)}</p> : <Skel className="mt-3 h-12 w-48 bg-background/20" />}
          <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-background/75">
            <span>Overdue <b className="text-primary tnum">{d ? money(d.overdue) : "—"}</b></span>
            <span>Across <b className="tnum">{d?.invoiceCount ?? "—"}</b> invoices</span>
          </div>
        </div>
        <Stat label="Received" value={d && money(d.received)} foot={d ? `${(d.collectionRate * (d.collectionRate <= 1 ? 100 : 1)).toFixed(1)}% collection rate` : undefined} tone="lagoon" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <Stat compact label="In drafts" value={d && money(d.draftAmount)} />
          <Link href="/app/reminders" className="group rounded-2xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10" data-testid="link-pending-approvals">
            <p className="flex items-center justify-between text-xs uppercase tracking-widest text-primary">Awaiting your nod <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></p>
            <p className="mt-1 text-2xl font-semibold tnum">{d?.pendingApprovals ?? "—"}</p>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <PanelHead title="Unpaid, oldest first" right={<Link href="/app/invoices?status=overdue" className="text-xs text-primary hover:underline">All overdue</Link>} />
          {!d ? (
            <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-10" />)}</div>
          ) : d.priorityInvoices.length === 0 ? (
            <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No one to chase" body="When an invoice slips past due, it shows up here ranked by how much it matters." />
          ) : (
            <ul className="divide-y divide-border/70">
              {d.priorityInvoices.map((inv) => (
                <li key={inv.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40" data-testid={`row-priority-${inv.id}`}>
                  <div className={cn("w-1 self-stretch rounded-full", inv.daysOverdue > 30 ? "bg-primary" : inv.daysOverdue > 0 ? "bg-coral/60" : "bg-border")} />
                  <Link href={`/app/invoices/${inv.id}`} className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">{inv.customerName} <SourceTag source={inv.source} /></p>
                    <p className="text-xs text-muted-foreground">{inv.number} · due {shortDate(inv.dueDate)}{inv.daysOverdue > 0 && ` · ${inv.daysOverdue}d late`}</p>
                  </Link>
                  <InvoiceStatusPill status={inv.status} className="hidden sm:inline-flex" />
                  <p className="w-24 text-right text-sm font-semibold tnum">{money(inv.balance)}</p>
                  <Button size="sm" variant="ghost" className="text-primary" onClick={() => setPrep(inv)} data-testid={`button-nudge-${inv.id}`}>Draft note</Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHead title="Aging" right={<span className="text-xs text-muted-foreground">balance by days late</span>} />
            <div className="space-y-3 p-4">
              {!d ? [0, 1, 2, 3].map((i) => <Skel key={i} className="h-6" />) : d.aging.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open balances.</p>
              ) : (
                d.aging.map((a, i) => (
                  <div key={a.label} data-testid={`row-aging-${i}`}>
                    <div className="flex justify-between text-xs"><span className="font-medium">{a.label}</span><span className="text-muted-foreground tnum">{a.count} · {money(a.amount)}</span></div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full origin-left rounded-full transition-transform duration-700" style={{ transform: `scaleX(${a.amount / maxAging})`, background: `hsl(var(--chart-${(i % 5) + 1}))` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
          <Panel>
            <PanelHead title="Recently" right={<Link href="/app/activity" className="text-xs text-primary hover:underline">Full log</Link>} />
            <ul className="max-h-72 overflow-y-auto">
              {!d ? <div className="p-4"><Skel className="h-24" /></div> : d.recentActivity.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">Quiet so far.</li>
              ) : (
                d.recentActivity.map((a) => (
                  <li key={a.id} className="flex gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.status === "success" ? "bg-lagoon" : a.status === "error" ? "bg-destructive" : a.status === "pending" ? "bg-sun" : "bg-muted-foreground/40")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                    <span className="shrink-0 text-[0.68rem] text-muted-foreground">{relative(a.createdAt)}</span>
                  </li>
                ))
              )}
            </ul>
          </Panel>
        </div>
      </div>

      <InvoiceFormDialog open={newOpen} onOpenChange={setNewOpen} />
      {prep && <PrepareReminderDialog open={!!prep} onOpenChange={(o) => !o && setPrep(null)} invoiceId={prep.id} label={`${prep.number} · ${prep.customerName}`} />}
      <p className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground"><Inbox className="h-3.5 w-3.5" /> Figures come from your sandbox workspace. Sample invoices are included and labeled.</p>
    </div>
  );
}

function Stat({ label, value, foot, tone, compact }: { label: string; value?: string; foot?: string; tone?: "lagoon"; compact?: boolean }) {
  return (
    <div className={cn("rise rounded-2xl border border-card-border bg-card", compact ? "p-4" : "p-6")}>
      <p className={cn("text-xs uppercase tracking-widest", tone === "lagoon" ? "text-lagoon" : "text-muted-foreground")}>{label}</p>
      {value ? <p className={cn("mt-1 font-semibold tracking-tight tnum", compact ? "text-2xl" : "text-4xl")}>{value}</p> : <Skel className="mt-2 h-8 w-32" />}
      {foot && <p className="mt-3 text-sm text-muted-foreground">{foot}</p>}
    </div>
  );
}
