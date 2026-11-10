"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Pencil, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import { useDeleteInvoice, useGetInvoice, getGetInvoiceQueryKey, useSendInvoice, useSyncInvoice } from "@workspace/api-client-react";
import { ErrorState, InvoiceStatusPill, Panel, PanelHead, Skel, SourceTag } from "@/components/bits";
import { InvoiceFormDialog } from "@/components/invoice-form";
import { PrepareReminderDialog } from "@/components/prepare-reminder";
import { CustomerLinkPanel } from "@/components/customer-link-panel";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIntegrationFlags, useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { dateTime, money, shortDate } from "@/lib/format";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useGetInvoice(id, { query: { enabled: !!id, queryKey: getGetInvoiceQueryKey(id) } });
  const flags = useIntegrationFlags();
  const del = useDeleteInvoice();
  const send = useSendInvoice();
  const sync = useSyncInvoice();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const [edit, setEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [prep, setPrep] = useState(false);

  if (q.isLoading) return <div className="space-y-4"><Skel className="h-10 w-64" /><Skel className="h-64" /></div>;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Invoice not found" />;
  const inv = q.data;
  const isDemo = inv.source === "demo";
  const editable = inv.status === "draft" && !inv.paypalId;
  const canSend = inv.status === "draft" && !isDemo;
  const canSync = !!inv.paypalId && !isDemo;
  const canRemind = inv.balance > 0 && !["draft", "paid", "cancelled"].includes(inv.status);

  async function doDelete() {
    try { await del.mutateAsync({ id }); await refresh(); notify.ok("Draft deleted"); router.push("/app/invoices"); } catch (e) { notify.fail(e); }
  }
  async function doSend() {
    try { const r = await send.mutateAsync({ id, data: { approved: true } }); await refresh(); notify.ok("Sent through PayPal", `${r.number} is now ${r.status.replace("_", " ")}.`); } catch (e) { notify.fail(e, "PayPal didn't accept this"); }
  }
  async function doSync() {
    try { await sync.mutateAsync({ id }); await refresh(); notify.ok("Synced with PayPal"); } catch (e) { notify.fail(e, "Sync failed"); }
  }

  const sendBlock = !flags.paypalReady ? "PayPal isn't connected yet — add credentials in Settings." : isDemo ? "Sample invoices can't be sent." : !canSend ? "Only unsent drafts can be sent." : null;

  return (
    <div>
      <Link href="/app/invoices" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Invoices</Link>
      <div className="rise mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm" data-testid="text-invoice-number">{inv.number}</span><InvoiceStatusPill status={inv.status} /><SourceTag source={inv.source} /></div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight tnum" data-testid="text-invoice-balance">{money(inv.balance, inv.currency)}</h1>
          <p className="text-sm text-muted-foreground">balance of {money(inv.amount, inv.currency)} · {inv.customerName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && <Button variant="outline" onClick={() => setEdit(true)} data-testid="button-edit-invoice"><Pencil /> Edit</Button>}
          {editable && <Button variant="outline" className="text-destructive" onClick={() => setConfirmDel(true)} data-testid="button-delete-invoice"><Trash2 /> Delete</Button>}
          {canRemind && <Button variant="outline" onClick={() => setPrep(true)} data-testid="button-draft-reminder"><Sparkles /> Draft reminder</Button>}
          {canSync && <Button variant="outline" disabled={!flags.paypalReady || sync.isPending} onClick={doSync} data-testid="button-sync-invoice">{sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync</Button>}
          {inv.status === "draft" && <Button disabled={!!sendBlock || send.isPending} onClick={() => setConfirmSend(true)} title={sendBlock ?? undefined} data-testid="button-send-invoice">{send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send via PayPal</Button>}
        </div>
      </div>
      {inv.status === "draft" && sendBlock && <p className="mb-4 rounded-xl border border-dashed border-primary/40 bg-secondary/50 px-4 py-2 text-sm" data-testid="text-send-block">{sendBlock}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHead title="Line items" />
          <table className="w-full text-sm">
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-4 py-3">{it.name}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tnum">{it.quantity} × {money(it.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium tnum">{money(it.quantity * it.unitPrice)}</td>
                </tr>
              ))}
              <tr><td className="px-4 py-2 text-muted-foreground" colSpan={2}>Total</td><td className="px-4 py-2 text-right font-semibold tnum">{money(inv.amount)}</td></tr>
              <tr><td className="px-4 py-2 text-muted-foreground" colSpan={2}>Paid</td><td className="px-4 py-2 text-right text-lagoon tnum">−{money(inv.paidAmount)}</td></tr>
            </tbody>
          </table>
          {inv.notes && <p className="border-t border-border/60 px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">{inv.notes}</p>}
        </Panel>
        <Panel>
          <PanelHead title="Details" />
          <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 p-4 text-sm">
            <dt className="text-muted-foreground">Customer</dt><dd>{inv.customerName}<br /><span className="text-xs text-muted-foreground">{inv.customerEmail}</span></dd>
            <dt className="text-muted-foreground">Created</dt><dd>{shortDate(inv.createdAt)}</dd>
            <dt className="text-muted-foreground">Due</dt><dd>{shortDate(inv.dueDate)}{inv.daysOverdue > 0 && <span className="ml-1 text-primary">({inv.daysOverdue}d late)</span>}</dd>
            <dt className="text-muted-foreground">PayPal ID</dt><dd className="font-mono text-xs">{inv.paypalId ?? "—"}</dd>
            <dt className="text-muted-foreground">Last sync</dt><dd>{dateTime(inv.lastSyncedAt)}</dd>
            <dt className="text-muted-foreground">Pay link</dt>
            <dd>{inv.paymentUrl ? <a href={inv.paymentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline" data-testid="link-payment">Open PayPal link <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">Appears once PayPal issues one</span>}</dd>
          </dl>
          {isDemo && <p className="mx-4 mb-4 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">Sample invoice. Useful for exploring reminders; never sent or synced.</p>}
        </Panel>
      </div>

      <CustomerLinkPanel invoice={inv} />

      <InvoiceFormDialog open={edit} onOpenChange={setEdit} invoice={inv} />
      <PrepareReminderDialog open={prep} onOpenChange={setPrep} invoiceId={inv.id} label={`${inv.number} · ${inv.customerName}`} />
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete draft {inv.number}?</AlertDialogTitle><AlertDialogDescription>This removes the draft from your workspace. It was never sent.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Send {inv.number} through PayPal Sandbox?</AlertDialogTitle><AlertDialogDescription>This requests a sandbox test invoice notification to {inv.customerEmail} for {money(inv.amount)}. No real money is involved. API acceptance does not prove email delivery. After sending, the draft can no longer be edited.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Not yet</AlertDialogCancel><AlertDialogAction onClick={doSend} data-testid="button-confirm-send">Yes, send it</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
