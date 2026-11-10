import type { CommerceOrder, CommercePolicy, CommerceTicket } from "@workspace/api-zod";

/** Informational replies must never change intent, approval, or financial state. */
export function conversationalReply(t: CommerceTicket, o: CommerceOrder, rules: CommercePolicy, text: string): string | undefined {
  const normalized = text.toLowerCase().replace(/[.,!?]/g, "").trim();
  if (/^(?:(?:ok|okay|great|alright|perfect|yes)\s+)?(?:thank you|thanks)(?:\s+(?:so much|a lot|for your help))?$/.test(normalized)) {
    return t.status === "escalated"
      ? "You’re welcome. Your case is still with KikoStore, and the team can reply here. You don’t need to repeat what happened."
      : t.status === "awaiting_confirmation"
        ? "You’re welcome. Your proposed return or refund is ready to review in chat whenever you’re ready; nothing has been confirmed yet."
        : "You’re welcome. Your conversation is saved here if you need anything else.";
  }
  const timing = /\b(refund|money back)\b.{0,60}\bbefore\b.{0,45}\b(send|return|ship)\b|\b(when|how long)\b.{0,50}\b(refund|money back)\b|\b(do|will|would|must)\b.{0,35}\b(return|send|ship)\b.{0,35}\bbefore\b.{0,25}\b(refund|money)\b/i.test(text);
  if (!timing) return;
  if (t.status === "refund_pending") return "Your refund has been submitted and is waiting for payment-provider confirmation. I can’t promise a settlement time or start a duplicate refund.";
  const eligibleSmallClaim = ["damaged", "defective"].includes(t.reason) && o.amount <= Math.min(50, rules.instantRefundLimit);
  const timingReply = t.status === "awaiting_return" || !eligibleSmallClaim
    ? `For this $${o.amount.toFixed(2)} order, the normal process is to return the item first. KikoStore must confirm receipt before the refund is processed.`
    : "Some eligible damage or fault claims at this amount can qualify for a no-return refund, but that still needs policy verification and explicit confirmation. It is not an approval.";
  const next = t.status === "escalated"
    ? "Your case is still with the store team; I’m explaining the process, not approving a refund."
    : t.status === "awaiting_confirmation"
      ? "Your proposal is still waiting for your confirmation in chat."
      : "No new refund is being authorized by this answer.";
  return `${timingReply} ${next}${o.source === "sample" ? " This sample purchase uses simulated refunds; no real money moves." : ""}`;
}

/** Only recover the old technical-failure handoff, never an intentional human decision. */
export function canRetryTechnicalHandoff(t: CommerceTicket, text: string) {
  return t.status === "escalated" && t.investigation?.engine === "guarded_fallback"
    && t.intent !== "human" && t.refundState === "none"
    && !t.messages.some(m => m.role === "human")
    && !t.steps.some(s => s.agent === "Handoff coordinator")
    && t.steps.some(s => s.agent === "Usage guard")
    && /\b(retry|try again|(?:check|review|recheck).{0,20}policy(?: again)?)\b/i.test(text);
}

/**
 * An automatic handoff that came only from an inconclusive published-policy check (not a hard rule,
 * not a human request, not staff-owned) is re-investigated when the customer follows up.
 */
export function canReinvestigateHandoff(t: CommerceTicket) {
  if (t.status !== "escalated" || t.intent === "human" || t.refundState !== "none") return false;
  if (t.messages.some(m => m.role === "human") || t.steps.some(s => s.agent === "Handoff coordinator")) return false;
  const last = [...t.steps].reverse().find(s => s.agent === "Policy specialist");
  return !!last && /extra condition that needs a staff decision/.test(last.detail);
}
