"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, ShieldOff } from "lucide-react";
import { useCreatePortalLink, useRevokePortalLink, type Invoice, type PortalLink } from "@workspace/api-client-react";
import { Panel, PanelHead } from "@/components/bits";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { dateTime } from "@/lib/format";

export function CustomerLinkPanel({ invoice }: { invoice: Invoice }) {
  const create = useCreatePortalLink();
  const revoke = useRevokePortalLink();
  const notify = useNotify();
  const refresh = useRefreshAll();
  const [link, setLink] = useState<(PortalLink & { url: string }) | null>(null);
  const [confirm, setConfirm] = useState<"create" | "revoke" | null>(null);
  const [copied, setCopied] = useState(false);
  const eligible = invoice.balance > 0 && !["draft", "paid", "cancelled"].includes(invoice.status);

  async function doCreate() {
    try {
      const r = await create.mutateAsync({ id: invoice.id });
      setLink({ ...r, url: window.location.origin + r.path });
      setCopied(false);
      await refresh();
      notify.ok("Customer link ready", "Copy it and share it yourself. Flamingo does not email it.");
    } catch (e) { notify.fail(e, "Couldn't create the link"); }
  }
  async function doRevoke() {
    try {
      await revoke.mutateAsync({ id: invoice.id });
      setLink(null);
      await refresh();
      notify.ok("Link revoked", "Anyone holding the old link now sees that access ended.");
    } catch (e) { notify.fail(e, "Couldn't revoke the link"); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { notify.fail(new Error("Clipboard is blocked. Select the link and copy it manually.")); }
  }

  return (
    <Panel className="mt-6" >
      <div id="customer-link" className="scroll-mt-24" />
      <PanelHead title={<span className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /> Customer resolution link</span>} />
      <div className="space-y-4 p-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          One private page where {invoice.customerName} can pay, ask for more time, flag a problem or say they already paid. Their requests land in your Resolution center for an explicit decision.
        </p>
        {!eligible ? (
          <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground" data-testid="text-link-ineligible">
            Links are only for open invoices with a balance. Drafts, paid and cancelled invoices can't be shared.
          </p>
        ) : (
          <>
            {link ? (
              <div className="rise rounded-2xl border border-primary/30 bg-primary/5 p-3">
                <label htmlFor="portal-url" className="text-xs font-medium text-primary">Share this link yourself</label>
                <input id="portal-url" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="mt-1.5 w-full truncate rounded-lg border border-input bg-card px-3 py-2.5 font-mono text-xs" data-testid="input-portal-url" />
                <p className="mt-2 text-xs text-muted-foreground">Expires {dateTime(link.expiresAt)}. Shown only now; creating a new one replaces it.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={copy} className="min-h-11" data-testid="button-copy-link">{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
                  <Button size="sm" variant="outline" className="min-h-11" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")} data-testid="button-open-link"><ExternalLink /> Open</Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant={link ? "outline" : "default"} className="min-h-11" disabled={create.isPending} onClick={() => setConfirm("create")} data-testid="button-create-link">
                {create.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} {link ? "Replace link" : "Create or replace link"}
              </Button>
              <Button variant="ghost" className="min-h-11 text-destructive" disabled={revoke.isPending} onClick={() => setConfirm("revoke")} data-testid="button-revoke-link">
                {revoke.isPending ? <Loader2 className="animate-spin" /> : <ShieldOff />} Revoke
              </Button>
            </div>
          </>
        )}
        <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
          <li>Bearer access: anyone holding the link can view this invoice and respond.</li>
          <li>Valid for 7 days, then the customer sees that it expired.</li>
          <li>Notices are in-app only. Nothing is emailed automatically.</li>
          <li>{invoice.source === "demo" ? "Sample invoice: the portal works for practice but cannot take payment." : "Payment only through the PayPal invoice link, when one exists."}</li>
        </ul>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "revoke" ? "Revoke the customer link?" : "Create a new customer link?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "revoke"
                ? "Any existing link for this invoice stops working immediately. The conversation is kept."
                : "Any earlier link for this invoice stops working and is replaced. The new link lasts 7 days and is not emailed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm === "revoke" ? doRevoke : doCreate} className={confirm === "revoke" ? "bg-destructive text-destructive-foreground" : undefined} data-testid="button-confirm-link">
              {confirm === "revoke" ? "Revoke" : "Create link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
