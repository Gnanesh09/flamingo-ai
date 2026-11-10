"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateInvoice,
  useListCustomers,
  getListCustomersQueryKey,
  useUpdateInvoice,
  type Invoice,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRefreshAll, useNotify } from "@/hooks/use-flamingo";
import { errMsg, money, todayPlus } from "@/lib/format";

type Row = { name: string; quantity: string; unitPrice: string };
const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice?: Invoice;
  onSaved?: (inv: Invoice) => void;
}) {
  const customers = useListCustomers({ query: { queryKey: getListCustomersQueryKey(), enabled: open } });
  const create = useCreateInvoice();
  const update = useUpdateInvoice();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState(todayPlus(14));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ name: "", quantity: "1", unitPrice: "" }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (invoice) {
      setCustomerId(invoice.customerId);
      setDueDate(invoice.dueDate.slice(0, 10));
      setNotes(invoice.notes ?? "");
      setRows(invoice.items.map((i) => ({ name: i.name, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })));
    } else {
      setCustomerId("");
      setDueDate(todayPlus(14));
      setNotes("");
      setRows([{ name: "", quantity: "1", unitPrice: "" }]);
    }
  }, [open, invoice]);

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);
  const pending = create.isPending || update.isPending;

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return setError("Choose a customer.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return setError("Pick a due date.");
    const items = rows.map((r) => ({ name: r.name.trim(), quantity: Number(r.quantity), unitPrice: Number(r.unitPrice) }));
    if (items.some((i) => !i.name || !Number.isInteger(i.quantity) || i.quantity < 1 || !(i.unitPrice >= 0.01)))
      return setError("Each line needs a name, a whole quantity of 1+, and a price of at least $0.01.");
    setError(null);
    const data = { customerId, dueDate, items, notes: notes.trim() };
    try {
      const saved = invoice ? await update.mutateAsync({ id: invoice.id, data }) : await create.mutateAsync({ data });
      await refresh();
      notify.ok(invoice ? "Draft updated" : "Draft created", `${saved.number} · ${money(saved.amount)}`);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{invoice ? `Edit draft ${invoice.number}` : "New draft invoice"}</DialogTitle>
          <DialogDescription>Drafts stay local until you choose to send them. Amounts in USD.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Customer</span>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field} data-testid="select-customer">
                <option value="">{customers.isLoading ? "Loading customers…" : "Select a customer"}</option>
                {customers.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` — ${c.company}` : ""}
                  </option>
                ))}
              </select>
              {customers.data?.length === 0 && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  No customers yet. <Link href="/app/customers" className="text-primary underline">Add one first</Link>.
                </span>
              )}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} data-testid="input-due-date" />
            </label>
          </div>

          <div>
            <div className="mb-2 grid grid-cols-[1fr_70px_110px_32px] gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Line item</span><span>Qty</span><span>Unit price</span><span />
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_110px_32px] gap-2">
                  <input value={r.name} maxLength={100} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Brand workshop, 2 sessions" className={field} data-testid={`input-item-name-${i}`} />
                  <input inputMode="numeric" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className={field + " tnum"} data-testid={`input-item-qty-${i}`} />
                  <input inputMode="decimal" value={r.unitPrice} onChange={(e) => setRow(i, { unitPrice: e.target.value })} placeholder="0.00" className={field + " tnum"} data-testid={`input-item-price-${i}`} />
                  <button type="button" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30" aria-label="Remove line" data-testid={`button-remove-item-${i}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button type="button" disabled={rows.length >= 20} onClick={() => setRows((rs) => [...rs, { name: "", quantity: "1", unitPrice: "" }])} className="inline-flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-40" data-testid="button-add-item">
                <Plus className="h-4 w-4" /> Add line
              </button>
              <p className="text-sm">Total <span className="ml-2 text-lg font-semibold tnum" data-testid="text-form-total">{money(total)}</span></p>
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes</span>
            <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Payment terms, thank-you, project reference…" className={field} data-testid="input-notes" />
          </label>

          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-form-error">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-save-invoice">
              {pending && <Loader2 className="animate-spin" />} {invoice ? "Save draft" : "Create draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
