"use client";

import Link from "next/link";
import { ArrowRight, Link2, MessagesSquare } from "lucide-react";
import { useListResolutions, getListResolutionsQueryKey } from "@workspace/api-client-react";
import { ErrorState, Panel, PanelHead, Skel } from "@/components/bits";
import { ResolutionStatusPill } from "@/components/resolution-bits";
import { BUCKETS, KIND_LABEL, bucketOf } from "@/lib/resolution";
import { money, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ResolutionOverview() {
  const q = useListResolutions({ query: { queryKey: getListResolutionsQueryKey() } });
  const list = q.data ?? [];
  const decide = list.filter((r) => bucketOf(r) === "decide").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load conversations" />;
  return (
    <section className="rise mb-6 space-y-3" data-testid="section-resolution-overview">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {BUCKETS.map((b) => {
          const n = list.filter((r) => bucketOf(r) === b.id).length;
          const hot = b.id === "decide" && n > 0;
          return (
            <Link key={b.id} href="/app/resolutions" data-testid={`card-bucket-${b.id}`}
              className={cn("group rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md", hot ? "border-primary bg-primary text-primary-foreground" : "border-card-border bg-card")}>
              <p className={cn("flex items-center justify-between text-xs font-medium uppercase tracking-wider", hot ? "text-primary-foreground/80" : "text-muted-foreground")}>{b.label}<ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></p>
              {q.isLoading ? <Skel className="mt-2 h-8 w-10" /> : <p className="mt-1 text-3xl font-semibold tnum">{n}</p>}
              <p className={cn("mt-1 line-clamp-2 text-xs", hot ? "text-primary-foreground/80" : "text-muted-foreground")}>{b.hint}</p>
            </Link>
          );
        })}
      </div>
      <Panel>
        <PanelHead title="Needs your decision" right={<Link href="/app/resolutions" className="inline-flex min-h-11 items-center text-xs text-primary hover:underline">Resolution center</Link>} />
        {q.isLoading ? <div className="space-y-2 p-4"><Skel className="h-10" /><Skel className="h-10" /></div> : list.length === 0 ? (
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Link2 className="h-5 w-5" /></span>
            <p className="flex-1 text-sm text-muted-foreground">No customer conversations yet. Open an unpaid invoice, create a customer link and share it yourself. When they respond (more time, a problem, a payment claim), it lands here for you to decide.</p>
            <Link href="/app/invoices" className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm text-background">Pick an invoice</Link>
          </div>
        ) : decide.length === 0 ? (
          <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><MessagesSquare className="h-4 w-4 text-lagoon" /> Nothing is waiting on you. Every open conversation is with the customer or covered by a commitment.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {decide.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link href={`/app/resolutions?id=${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-secondary/40" data-testid={`row-decide-${r.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.customerName} <span className="font-normal text-muted-foreground">· {KIND_LABEL[r.kind]}</span></p>
                    <p className="text-xs text-muted-foreground">{r.invoiceNumber} · {relative(r.updatedAt)}</p>
                  </div>
                  <ResolutionStatusPill status={r.status} className="hidden sm:inline-flex" />
                  <span className="w-24 text-right text-sm font-semibold tnum">{money(r.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
