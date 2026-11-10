"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ReceiptText, Search } from "lucide-react";
import { useListInvoices, getListInvoicesQueryKey } from "@workspace/api-client-react";
import { EmptyState, ErrorState, InvoiceStatusPill, PageHeader, Panel, RowsSkeleton, SourceTag } from "@/components/bits";
import { InvoiceFormDialog } from "@/components/invoice-form";
import { Button } from "@/components/ui/button";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "draft", "sent", "overdue", "partially_paid", "paid", "cancelled"] as const;

function InvoicesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState<string>(sp.get("status") ?? "all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = { ...(status !== "all" ? { status } : {}), ...(debounced ? { search: debounced } : {}) };
  const q = useListInvoices(params, { query: { queryKey: getListInvoicesQueryKey(params) } });
  const list = q.data ?? [];
  const totalBalance = list.reduce((s, i) => s + i.balance, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Invoices"
        title="Every bill, in one ledger"
        sub="Only local drafts can be edited or deleted. Sample invoices are for exploring and never reach PayPal."
        actions={<Button onClick={() => setOpen(true)} data-testid="button-new-invoice"><Plus /> New draft</Button>}
      />
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-full border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setStatus(f)} data-testid={`filter-${f}`} className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-xs capitalize transition-colors", status === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or customer" className="w-full rounded-full border border-input bg-card py-2 pl-9 pr-4 text-sm outline-none focus:border-primary md:w-72" data-testid="input-search" />
        </label>
      </div>
      <Panel className="overflow-hidden">
        {q.isLoading ? <RowsSkeleton rows={8} /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : list.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-6 w-6" />} title={debounced || status !== "all" ? "Nothing matches" : "No invoices yet"} body={debounced || status !== "all" ? "Try another filter or clear the search." : "Create a draft to get started."} action={<Button size="sm" onClick={() => setOpen(true)}><Plus /> New draft</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Customer link</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => (
                  <tr key={inv.id} onClick={() => router.push(`/app/invoices/${inv.id}`)} className="cursor-pointer border-t border-border/60 transition-colors hover:bg-secondary/40" data-testid={`row-invoice-${inv.id}`}>
                    <td className="px-4 py-2.5"><Link href={`/app/invoices/${inv.id}`} className="font-mono text-xs font-medium" onClick={(e) => e.stopPropagation()}>{inv.number}</Link> <SourceTag source={inv.source} /></td>
                    <td className="px-4 py-2.5"><p className="font-medium">{inv.customerName}</p><p className="text-xs text-muted-foreground">{inv.customerEmail}</p></td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{shortDate(inv.dueDate)}{inv.daysOverdue > 0 && <span className="ml-1 text-xs text-primary">+{inv.daysOverdue}d</span>}</td>
                    <td className="px-4 py-2.5"><InvoiceStatusPill status={inv.status} /></td>
                    <td className="px-4 py-2.5 text-right tnum text-muted-foreground">{money(inv.amount, inv.currency)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tnum">{money(inv.balance, inv.currency)}</td>
                    <td className="px-4 py-1.5 text-right">
                      {inv.balance > 0 && !["draft", "paid", "cancelled"].includes(inv.status) && (
                        <Link href={`/app/invoices/${inv.id}#customer-link`} onClick={(e) => e.stopPropagation()} className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-xs font-medium text-primary hover:bg-primary/10" data-testid={`link-share-${inv.id}`}>Customer link</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 text-xs">
                  <td colSpan={5} className="px-4 py-2 text-muted-foreground">{list.length} invoice{list.length === 1 ? "" : "s"}</td>
                  <td className="px-4 py-2 text-right font-semibold tnum">{money(totalBalance)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
      <InvoiceFormDialog open={open} onOpenChange={setOpen} onSaved={(inv) => router.push(`/app/invoices/${inv.id}`)} />
    </div>
  );
}

export default function InvoicesPage() {
  return <Suspense fallback={<RowsSkeleton />}><InvoicesInner /></Suspense>;
}
