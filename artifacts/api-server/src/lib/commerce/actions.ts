import { randomUUID } from "node:crypto";
import type { CommerceActionInput, CommerceTicket } from "@workspace/api-zod";
import { AppError } from "../flamingo/errors";
import { products, sampleOrder } from "./catalog";
import { message, step, type CommerceDocument } from "./store";
import { checkout, capturePayment, issueRefund, syncRefund } from "./payments";
import { policyDecision, runAgents } from "./agent";
import { canReinvestigateHandoff, canRetryTechnicalHandoff, conversationalReply } from "./conversation";
import { createReplyWriter } from "./reply-writer";

const staffActions = new Set(["human_reply", "approve_refund", "approve_return", "received_return", "reject"]);
export function authorizeReturn(t: CommerceTicket) {
  t.returnCode ||= `KR-${randomUUID().slice(0, 8).toUpperCase()}`;
  t.status = "awaiting_return"; delete t.proposedAction;
  message(t, "system", `Return request created: ${t.returnCode}. Keep your item and packaging. KikoStore must arrange shipment outside this demo and confirm warehouse receipt before refunding. This is not a shipping label.`);
  step(t, "Return coordinator", "Return authorization recorded. Waiting for staff-confirmed receipt; no refund executed.");
}
export async function act(d: CommerceDocument, body: CommerceActionInput, origin: string, save: () => Promise<void>) {
  const { action } = body;
  if (["sample_purchase", "checkout"].includes(action)) {
    if (!body.requestId) throw new AppError(400, "A unique purchase request ID is required.");
    const key = `purchase:${body.requestId}`;
    const prior = d.operations[key];
    if (prior?.orderId) {
      const o = d.orders.find(o => o.id === prior.orderId)!;
      return { orderId: o.id, ...(o.approvalUrl ? { approvalUrl: o.approvalUrl } : {}) };
    }
    if (d.orders.length >= 40) throw new AppError(409, "This demo supports up to 40 purchases.");
    const p = products.find(p => p.id === body.productId);
    if (!p) throw new AppError(404, "Product not found.");
    const o = sampleOrder(p.id, body.quantity || 1, 0);
    o.createdAt = new Date().toISOString();
    if (action === "checkout") { o.source = "paypal_sandbox"; o.status = "created"; o.deliveredAt = ""; }
    d.orders.unshift(o);
    d.operations[key] = { state: "complete", orderId: o.id, at: new Date().toISOString() };
    if (action === "checkout") await checkout(d, o, origin, save);
    return { orderId: o.id, ...(o.approvalUrl ? { approvalUrl: o.approvalUrl } : {}) };
  }
  if (action === "capture") {
    const o = d.orders.find(o => o.id === body.orderId);
    if (!o) throw new AppError(404, "Order not found in this demo.");
    await capturePayment(d, o, save);
    return { orderId: o.id };
  }
  if (action === "open_ticket") {
    const o = d.orders.find(o => o.id === body.orderId);
    if (!o) throw new AppError(404, "Order not found in this demo.");
    const existing = d.tickets.find(t => t.orderId === o.id);
    if (existing) return { ticketId: existing.id };
    if (!["paid", "delivered"].includes(o.status)) throw new AppError(409, "Complete payment before opening a return request.");
    const now = new Date().toISOString();
    const t: CommerceTicket = {
      id: randomUUID(), orderId: o.id, status: "open", intent: "unknown", reason: "",
      createdAt: now, updatedAt: now, messages: [], steps: [], version: 0,
      aiCalls: 0, inputTokens: 0, outputTokens: 0, voiceSeconds: 0, speechCharacters: 0, estimatedCost: 0,
      costBasis: "Estimated USD, not a provider bill: Groq $0.075/M input + $0.30/M output tokens; STT $0.0077/min recorded duration; TTS $0.015/1K characters. Failed provider requests may incur unreported costs. Cached/rule-only turns cost $0 in this estimate.",
      refundState: "none",
    };
    message(t, "agent", `Hi Alex, I’m Flamingo, KikoStore’s support assistant. I have your ${products.find(p => p.id === o.productId)?.name} order here. Tell me what happened, by text or call. ${o.source === "sample" ? "This is a sample purchase; any refund will be simulated." : "This is a PayPal Sandbox purchase, not live money."}`);
    step(t, "Case tracker", "Order-linked conversation opened. Customer and staff share the same persisted case.");
    d.tickets.unshift(t);
    return { ticketId: t.id };
  }
  const t = d.tickets.find(t => t.id === body.ticketId);
  if (!t) throw new AppError(404, "Ticket not found in this demo.");
  const o = d.orders.find(o => o.id === t.orderId)!;
  if (body.version !== t.version) throw new AppError(409, "This case changed in another window. Refresh before acting.");
  if (t.messages.length >= 180 || t.steps.length >= 350) throw new AppError(409, "This demo conversation has reached its safety limit.");
  const text = body.message?.trim() || "";
  if ((action === "message" || action === "human_reply" || staffActions.has(action) || action === "reopen") && !text) throw new AppError(400, "An explanation is required.");
  if (["resolved", "rejected"].includes(t.status) && !["reopen", "sync_refund"].includes(action)) throw new AppError(409, "This case is closed. Reopen it to continue.");
  // Validate all state-specific preconditions before changing the document.
  if (action === "confirm") {
    if (t.status !== "awaiting_confirmation" || !t.proposedAction) throw new AppError(409, "There is no proposal waiting for confirmation.");
    if (t.policyVersion !== d.policy.version) throw new AppError(409, "The policy changed. Send a message to recheck the current policy before confirming.");
    const latest = policyDecision(o, t.intent, t.reason, Date.now(), d.policy);
    if (latest.action !== t.proposedAction) throw new AppError(409, "Order eligibility changed. Ask for a staff review.");
  }
  if (action === "received_return" && t.status !== "awaiting_return") throw new AppError(409, "Only an authorized return can be marked received.");
  if (["approve_refund", "approve_return", "reject"].includes(action) && !["escalated", "open", "awaiting_confirmation"].includes(t.status)) throw new AppError(409, "This case is not waiting for a staff decision.");
  if (action === "escalate" && ["awaiting_return", "refund_pending"].includes(t.status)) throw new AppError(409, "The return or refund is already in progress. Send a message for the team.");
  if (action === "reopen" && !["resolved", "rejected"].includes(t.status)) throw new AppError(409, "Only closed cases can be reopened.");
  t.version++; t.updatedAt = new Date().toISOString();
  if (staffActions.has(action)) {
    t.assignedTo = "KikoStore demo operator";
    message(t, "human", text);
    step(t, "Human reviewer", `Demo operator selected ${action.replaceAll("_", " ")} with a recorded explanation.`);
  }
  switch (action) {
    case "message":
      message(t, "customer", text, body.channel || "text");
      if (canRetryTechnicalHandoff(t, text)) {
        t.status = "open"; delete t.assignedTo;
        step(t, "Case tracker", "Customer requested a fresh policy check after a technical failure; all eligibility and payment guards still apply.");
        await runAgents(d, t, o, text, body.channel || "text", { write: createReplyWriter(d.id, t.id) });
        break;
      }
      const reply = conversationalReply(t, o, d.policy, text);
      if (reply) {
        message(t, "agent", reply, body.channel || "text");
        step(t, "Case tracker", "Answered a conversational follow-up without changing the case decision or financial state.");
        break;
      }
      if (canReinvestigateHandoff(t)) {
        t.status = "open"; delete t.assignedTo;
        step(t, "Case tracker", "Earlier handoff came from an inconclusive policy check, not a rule; Flamingo re-investigated. All eligibility and payment guards still apply.");
        await runAgents(d, t, o, text, body.channel || "text", { write: createReplyWriter(d.id, t.id) });
        break;
      }
      if (["escalated", "awaiting_return", "refund_pending"].includes(t.status)) {
        step(t, "Case tracker", "Customer follow-up delivered to the staff queue without changing the financial state.");
        message(t, "agent", t.status === "awaiting_return"
          ? `I’ve added your message to the return case ${t.returnCode}. We’re still waiting for KikoStore to confirm receipt; your refund hasn’t been completed. The team can reply here.`
          : t.status === "refund_pending"
            ? "I’ve added that to your case. The refund is still awaiting payment-provider confirmation; I won’t start a duplicate payment. KikoStore can check its status."
            : "I’ve passed your message to the KikoStore team with the rest of this conversation. A staff member needs to make the next decision; I’m not confirming a refund on their behalf.", body.channel || "text");
      } else await runAgents(d, t, o, text, body.channel || "text", { write: createReplyWriter(d.id, t.id) });
      break;
    case "confirm":
      message(t, "customer", `I confirm the proposed ${t.proposedAction}.`);
      if (t.proposedAction === "refund") { delete t.proposedAction; await issueRefund(d, o, t, save); }
      else authorizeReturn(t);
      break;
    case "escalate":
      t.status = "escalated"; t.assignedTo = "KikoStore team"; delete t.proposedAction;
      message(t, "system", "A human review was requested. KikoStore has the full order, policy checks and conversation.");
      step(t, "Handoff coordinator", "Live staff queue notified. Case remains open.");
      break;
    case "human_reply":
      if (["open", "awaiting_confirmation"].includes(t.status)) { t.status = "escalated"; delete t.proposedAction; }
      break;
    case "approve_refund": delete t.proposedAction; await issueRefund(d, o, t, save); break;
    case "approve_return": authorizeReturn(t); break;
    case "received_return": step(t, "Return coordinator", `Staff attested receipt of ${t.returnCode}.`); await issueRefund(d, o, t, save); break;
    case "reject":
      t.status = "rejected"; t.closedAt = new Date().toISOString(); delete t.proposedAction;
      message(t, "system", "KikoStore declined this request with the explanation above. You can reopen it if something was missed.");
      step(t, "Closure verifier", "Closed as declined, not refunded. Explanation recorded; customer may reopen.");
      break;
    case "sync_refund": await syncRefund(o, t); break;
    case "reopen":
      t.status = "escalated"; delete t.closedAt; delete t.proposedAction;
      message(t, "customer", text);
      step(t, "Case tracker", "Reopened for staff review. Any previous refund remains recorded and cannot be repeated.");
      break;
    default: throw new AppError(400, "Unsupported action.");
  }
  return { ticketId: t.id };
}
