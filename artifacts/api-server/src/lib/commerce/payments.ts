import { createHash } from "node:crypto";
import { z } from "zod";
import type { CommerceOrder, CommerceTicket } from "@workspace/api-zod";
import { paypalRequest } from "../flamingo/paypal";
import { AppError } from "../flamingo/errors";
import { message, step, type CommerceDocument } from "./store";

const amount = z.object({ value: z.string(), currency_code: z.string() });
const capture = z.object({ id: z.string(), status: z.string(), amount });
const remoteOrder = z.object({
  id: z.string(), status: z.string(),
  purchase_units: z.array(z.object({ custom_id: z.string().optional(), amount, payments: z.object({ captures: z.array(capture).optional() }).optional() })),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).optional(),
});
const refund = z.object({ id: z.string(), status: z.string(), amount });
const requestId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 36);
function checkAmount(remote: z.infer<typeof amount>, local: CommerceOrder) {
  if (remote.currency_code !== "USD" || !/^\d+(\.\d{1,2})?$/.test(remote.value) || Math.round(Number(remote.value) * 100) !== Math.round(local.amount * 100)) throw new AppError(409, "PayPal amount or currency does not match this order. Staff must investigate.");
}
function checkOrder(remote: z.infer<typeof remoteOrder>, order: CommerceOrder) {
  if (remote.id !== order.paypalOrderId || remote.purchase_units.length !== 1 || remote.purchase_units[0].custom_id !== order.id) throw new AppError(409, "PayPal order identity does not match. No payment state changed.");
  checkAmount(remote.purchase_units[0].amount, order);
}
export async function checkout(d: CommerceDocument, o: CommerceOrder, origin: string, save: () => Promise<void>) {
  const key = `checkout:${o.id}`;
  d.operations[key] = { state: "started", orderId: o.id, at: new Date().toISOString() };
  await save();
  try {
    const result = remoteOrder.parse(await paypalRequest("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: o.id, amount: { currency_code: "USD", value: o.amount.toFixed(2) }, description: `KikoStore demo order ${o.id}` }],
      payment_source: { paypal: { experience_context: { brand_name: "KikoStore Sandbox", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: `${origin}/kikostore/orders?checkout=${o.id}`, cancel_url: `${origin}/kikostore/orders?cancel=${o.id}` } } },
    }, requestId(key)));
    o.paypalOrderId = result.id;
    checkOrder(result, o);
    const link = result.links?.find(l => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!link) throw new AppError(502, "PayPal did not provide an approval link.");
    const url = new URL(link);
    if (url.protocol !== "https:" || !["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname)) throw new AppError(502, "Unexpected PayPal checkout URL. Checkout blocked.");
    o.approvalUrl = url.toString();
    d.operations[key].state = "complete";
    await save();
  } catch (error) {
    o.paymentNote = "Checkout creation did not finish reliably. Do not pay another copy; inspect this order in PayPal Sandbox.";
    await save(); throw error;
  }
}
export async function capturePayment(d: CommerceDocument, o: CommerceOrder, save: () => Promise<void>) {
  if (o.source !== "paypal_sandbox" || !o.paypalOrderId) throw new AppError(409, "This order has no PayPal checkout.");
  if (o.status !== "created") return;
  const endpoint = `/v2/checkout/orders/${encodeURIComponent(o.paypalOrderId)}`;
  let remote = remoteOrder.parse(await paypalRequest(endpoint));
  checkOrder(remote, o);
  const key = `capture:${o.id}`;
  if (!remote.purchase_units[0].payments?.captures?.length) {
    if (d.operations[key]?.state === "started") throw new AppError(409, "A capture attempt has an uncertain outcome. Check PayPal Sandbox; another capture will not be sent.");
    if (remote.status !== "APPROVED") throw new AppError(409, "Approve this payment in PayPal Sandbox before capturing it.");
    d.operations[key] = { state: "started", orderId: o.id, at: new Date().toISOString() };
    await save();
    try {
      remote = remoteOrder.parse(await paypalRequest(`${endpoint}/capture`, "POST", {}, requestId(key)));
      checkOrder(remote, o);
    } catch (error) { o.paymentNote = "Capture outcome uncertain. Check payment again; automatic recapture is blocked."; await save(); throw error; }
  }
  const captures = remote.purchase_units[0].payments?.captures || [];
  if (captures.length !== 1) throw new AppError(409, "Expected exactly one PayPal capture. Staff review required.");
  const c = captures[0]; checkAmount(c.amount, o);
  o.captureId = c.id;
  if (c.status !== "COMPLETED") { o.paymentNote = `PayPal capture status: ${c.status}. Payment is not marked complete.`; await save(); throw new AppError(409, o.paymentNote); }
  o.status = "paid";
  o.deliveredAt = "";
  o.paymentNote = "PayPal Sandbox capture verified. Physical shipping is not performed in this demo.";
  delete o.approvalUrl;
  d.operations[key] = { state: "complete", orderId: o.id, at: new Date().toISOString() };
  await save();
}
function applyRefund(o: CommerceOrder, t: CommerceTicket, r: z.infer<typeof refund>) {
  checkAmount(r.amount, o);
  o.refundId = r.id;
  if (r.status === "COMPLETED") {
    o.status = "refunded"; t.refundState = "completed"; t.status = "resolved"; t.closedAt = new Date().toISOString();
    message(t, "system", `PayPal Sandbox confirmed the full $${o.amount.toFixed(2)} refund to the original payment. Reference: ${r.id}.`);
    step(t, "Closure verifier", "Verified PayPal refund COMPLETED, matching USD amount and original capture.");
  } else if (r.status === "PENDING") {
    o.status = "refund_pending"; t.status = "refund_pending"; t.refundState = "submitted";
    message(t, "system", "PayPal accepted the refund but has not completed it. This case stays open until verification.");
  } else {
    t.refundState = "failed"; t.status = "escalated"; t.assignedTo = "KikoStore team";
    message(t, "system", `PayPal refund status is ${r.status}. Staff review is required; this case is not closed.`);
  }
}
export async function issueRefund(d: CommerceDocument, o: CommerceOrder, t: CommerceTicket, save: () => Promise<void>) {
  if (o.status === "refunded" || ["completed", "simulated"].includes(t.refundState)) throw new AppError(409, "This order has already been refunded.");
  if (o.source === "sample") {
    o.status = "refunded"; t.status = "resolved"; t.refundState = "simulated"; t.closedAt = new Date().toISOString();
    message(t, "system", `Sample refund of $${o.amount.toFixed(2)} simulated. No payment provider was called and no money moved.`);
    step(t, "Closure verifier", "Sample refund complete; explicitly not a financial transaction.");
    return;
  }
  if (!o.captureId) throw new AppError(409, "A verified PayPal capture is required before any refund.");
  const key = `refund:${o.id}`;
  if (d.operations[key]) throw new AppError(409, "A refund was already attempted. Use Check PayPal; a duplicate refund will not be sent.");
  const c = capture.parse(await paypalRequest(`/v2/payments/captures/${encodeURIComponent(o.captureId)}`));
  if (c.id !== o.captureId || c.status !== "COMPLETED") throw new AppError(409, "PayPal capture is not an untouched completed payment. Staff must investigate before refunding.");
  checkAmount(c.amount, o);
  d.operations[key] = { state: "started", orderId: o.id, at: new Date().toISOString() };
  t.status = "refund_pending"; t.refundState = "submitted"; o.status = "refund_pending";
  step(t, "Payment executor", "Persisted refund intent before contacting PayPal; duplicate attempts blocked.");
  await save();
  try {
    const result = refund.parse(await paypalRequest(`/v2/payments/captures/${encodeURIComponent(o.captureId)}/refund`, "POST", { amount: { value: o.amount.toFixed(2), currency_code: "USD" }, note_to_payer: "KikoStore customer support refund" }, requestId(key)));
    applyRefund(o, t, result); d.operations[key].state = "complete"; await save();
  } catch (error) {
    t.refundState = "uncertain"; t.status = "refund_pending";
    message(t, "system", "PayPal did not provide a verifiable refund result. No retry was sent. Staff must check PayPal; this case remains open.");
    await save(); throw error;
  }
}
export async function syncRefund(o: CommerceOrder, t: CommerceTicket) {
  if (o.source !== "paypal_sandbox" || !o.captureId) throw new AppError(409, "Only captured PayPal Sandbox orders can be verified.");
  if (o.refundId) {
    const r = refund.parse(await paypalRequest(`/v2/payments/refunds/${encodeURIComponent(o.refundId)}`));
    if (r.id !== o.refundId) throw new AppError(409, "Unexpected refund identity.");
    if (t.refundState !== "completed") applyRefund(o, t, r);
  } else {
    const c = capture.parse(await paypalRequest(`/v2/payments/captures/${encodeURIComponent(o.captureId)}`));
    if (c.id !== o.captureId) throw new AppError(409, "Unexpected capture identity.");
    checkAmount(c.amount, o);
    if (c.status === "REFUNDED") {
      o.status = "refunded"; t.refundState = "completed"; t.status = "resolved"; t.closedAt = new Date().toISOString();
      message(t, "system", "PayPal confirms this capture is fully refunded. The refund may have been completed outside Flamingo.");
      step(t, "Closure verifier", "Original capture is fully REFUNDED at PayPal.");
    } else { step(t, "Payment verifier", `Capture is ${c.status}; a completed full refund has not been verified.`); }
  }
}
