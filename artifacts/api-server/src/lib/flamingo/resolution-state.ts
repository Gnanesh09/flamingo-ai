import { randomUUID } from "node:crypto";
import type { Invoice, Resolution, ResolutionMessage } from "@workspace/api-zod";
import type { Workspace } from "./store";
import { AppError } from "./errors";

export type ResolutionRecord = Resolution & { baselinePaid?: number };
export type PortalRecord = { invoiceId: string; digest: string; expiresAt: string };
export const today = () => new Date().toISOString().slice(0, 10);
export function resolutionMessage(r: ResolutionRecord, author: ResolutionMessage["author"], text: string) {
  if (r.messages.length >= 200) throw new AppError(409, "This conversation reached its sandbox limit. Contact the business directly.");
  r.messages.push({ id: randomUUID(), author, text, createdAt: new Date().toISOString() });
  r.updatedAt = new Date().toISOString();
  r.version++;
}
export function validatePromise(date: string | undefined, amount: number | undefined, invoice: Invoice) {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!date || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date || date < today() || parsed > Date.now() + 90 * 86400000)
    throw new AppError(400, "Choose a valid payment date from today through the next 90 days (UTC).");
  if (!amount || !Number.isFinite(amount) || amount < 0.01 || amount > invoice.balance || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
    throw new AppError(400, "Enter a payment amount between $0.01 and the outstanding balance, with at most two decimal places.");
  return { date, amount };
}
export function reminderIsPaused(ws: Workspace, invoiceId: string) {
  const r = ws.resolutions?.find(r => r.invoiceId === invoiceId);
  if (!r) return false;
  if (r.status === "resolved") return true;
  if (r.commitment?.state === "accepted" && r.commitment.date >= today()) return true;
  return r.status === "needs_review" || r.status === "verification_needed" || (r.kind === "dispute" && r.status !== "missed") || r.commitment?.state === "proposed";
}
export function reconcileResolutions(ws: Workspace) {
  for (const r of ws.resolutions ?? []) {
    const invoice = ws.invoices.find(i => i.id === r.invoiceId);
    if (!invoice) continue;
    r.balance = invoice.balance;
    if (invoice.source === "paypal" && invoice.lastSyncedAt && invoice.status === "paid" && invoice.balance === 0) {
      if (r.status !== "resolved") {
        r.status = "resolved";
        if (r.commitment) r.commitment.state = "fulfilled";
        resolutionMessage(r, "system", "PayPal Sandbox now records this invoice as paid with no remaining balance. Follow-ups are stopped.");
      }
    } else if (r.commitment && ["accepted", "missed"].includes(r.commitment.state)) {
      if (invoice.source === "paypal" && invoice.lastSyncedAt && Math.round((invoice.paidAmount - (r.baselinePaid ?? invoice.paidAmount)) * 100) >= Math.round(r.commitment.amount * 100)) {
        r.commitment.state = "fulfilled";
        r.status = "waiting_customer";
        resolutionMessage(r, "system", `PayPal records the agreed payment. $${invoice.balance.toFixed(2)} remains on this invoice; the invoice is not fully paid.`);
      } else if (r.commitment.date < today() && r.commitment.state !== "missed") {
        r.commitment.state = "missed";
        // An older missed promise must not dismiss a newer dispute, date request,
        // or reported payment that still needs human review/verification.
        if (r.status === "committed") r.status = "missed";
        resolutionMessage(r, "system", "The agreed date passed without a matching payment in the last verified records. Verify PayPal before following up.");
      }
    }
    r.reminderPaused = reminderIsPaused(ws, invoice.id);
  }
}
export function resolutionViews(ws: Workspace): Resolution[] {
  // Derive date-based transitions on reads too, without trusting browser clocks.
  const copy = structuredClone(ws);
  reconcileResolutions(copy);
  return (copy.resolutions ?? []).map(({ baselinePaid: _private, ...publicValue }) => publicValue)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function openInvoice(invoice: Invoice) {
  if (invoice.balance <= 0 || ["draft", "paid", "cancelled"].includes(invoice.status))
    throw new AppError(409, "Only an unpaid, issued invoice can receive a resolution request.");
}
