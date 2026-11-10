"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Users } from "lucide-react";
import { useCreateCustomer, useListCustomers, getListCustomersQueryKey, useListInvoices, getListInvoicesQueryKey } from "@workspace/api-client-react";
import { EmptyState, ErrorState, InvoiceStatusPill, PageHeader, Panel, PanelHead, RowsSkeleton, SourceTag } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { errMsg, initials, money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

export default function CustomersPage() {
  const q = useListCustomers({ query: { queryKey: getListCustomersQueryKey() } });
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const list = q.data ?? [];
  useEffect(() => { if (!sel && list.length) setSel(list[0].id); }, [sel, list]);
  const current = list.find((c) => c.id === sel);
  const params = { customerId: sel ?? "" };
  const inv = useListInvoices(params, { query: { enabled: !!sel, queryKey: getListInvoicesQueryKey(params) } });
  const payments = (inv.data ?? []).filter((i) => i.paidAmount > 0);

  return (
    <div>
      <PageHeader eyebrow="Customers" title="The people who owe you" actions={<Button onClick={() => setOpen(true)} data-testid="button-new-customer"><Plus /> Add customer</Button>} />
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <Panel className="overflow-hidden">
            {q.isLoading ? <RowsSkeleton /> : list.length === 0 ? (
              <EmptyState icon={<Users className="h-6 w-6" />} title="No customers yet" body="Add the first client you bill." action={<Button size="sm" onClick={() => setOpen(true)}><Plus /> Add customer</Button>} />
            ) : (
              <ul className="max-h-[70dvh] overflow-y-auto">
                {list.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSel(c.id)} data-testid={`row-customer-${c.id}`} className={cn("flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors", sel === c.id ? "bg-secondary/70" : "hover:bg-muted/50")}>
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold", sel === c.id ? "bg-primary text-primary-foreground" : "bg-muted")}>{initials(c.name)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span><span className="block truncate text-xs text-muted-foreground">{c.company || c.email}</span></span>
                      <span className="text-right text-sm font-semibold tnum">{money(c.outstanding)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {current ? (
            <div className="space-y-6">
              <Panel className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h2 className="text-2xl font-semibold tracking-tight" data-testid="text-customer-name">{current.name}</h2><p className="text-sm text-muted-foreground">{current.company} {current.company && current.email && "·"} {current.email}</p></div>
                  <div className="flex gap-6 text-sm">
                    <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Outstanding</p><p className="text-xl font-semibold text-primary tnum">{money(current.outstanding)}</p></div>
                    <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Received</p><p className="text-xl font-semibold text-lagoon tnum">{money(current.received)}</p></div>
                    <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Invoices</p><p className="text-xl font-semibold tnum">{current.invoiceCount}</p></div>
                  </div>
                </div>
              </Panel>
              <Panel>
                <PanelHead title="Invoice history" />
                {inv.isLoading ? <RowsSkeleton rows={3} /> : inv.isError ? <div className="p-4"><ErrorState error={inv.error} onRetry={() => inv.refetch()} /></div> : !inv.data?.length ? <p className="p-4 text-sm text-muted-foreground">No invoices for this customer yet.</p> : (
                  <ul>{inv.data.map((i) => (
                    <li key={i.id}><Link href={`/app/invoices/${i.id}`} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 text-sm hover:bg-muted/40">
                      <span className="font-mono text-xs">{i.number}</span><SourceTag source={i.source} /><span className="flex-1 text-muted-foreground">due {shortDate(i.dueDate)}</span><InvoiceStatusPill status={i.status} /><span className="w-24 text-right font-medium tnum">{money(i.balance)}</span>
                    </Link></li>
                  ))}</ul>
                )}
              </Panel>
              <Panel>
                <PanelHead title="Payments received" />
                {payments.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No payments recorded yet.</p> : (
                  <ul>{payments.map((i) => (
                    <li key={i.id} className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-sm last:border-0"><span><span className="font-mono text-xs">{i.number}</span> <span className="text-muted-foreground">{i.status === "paid" ? "paid in full" : "partial"}{i.lastSyncedAt ? ` · synced ${shortDate(i.lastSyncedAt)}` : ""}</span></span><span className="font-semibold text-lagoon tnum">{money(i.paidAmount)}</span></li>
                  ))}</ul>
                )}
              </Panel>
            </div>
          ) : !q.isLoading && list.length > 0 ? null : null}
        </div>
      )}
      <NewCustomer open={open} onOpenChange={setOpen} onCreated={setSel} />
    </div>
  );
}

function NewCustomer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const create = useCreateCustomer();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const [f, setF] = useState({ name: "", email: "", company: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setF({ name: "", email: "", company: "" }); setError(null); } }, [open]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) return setError("Name needs at least 2 characters.");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return setError("That email doesn't look right.");
    try {
      const c = await create.mutateAsync({ data: { name: f.name.trim(), email: f.email.trim(), company: f.company.trim() } });
      await refresh(); notify.ok("Customer added", c.name); onCreated(c.id); onOpenChange(false);
    } catch (err) { setError(errMsg(err)); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add a customer</DialogTitle><DialogDescription>Who are you billing?</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <input className={field} placeholder="Name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-customer-name" />
          <input className={field} placeholder="Email" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="input-customer-email" />
          <input className={field} placeholder="Company (optional)" maxLength={80} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} data-testid="input-customer-company" />
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-save-customer">{create.isPending && <Loader2 className="animate-spin" />} Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
