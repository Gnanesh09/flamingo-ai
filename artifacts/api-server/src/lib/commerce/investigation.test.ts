import test from "node:test";
import assert from "node:assert/strict";
import type { CommerceTicket } from "@workspace/api-zod";
import { understand } from "./understanding";
import { PHOTO_CUE, runAgents } from "./agent";
import { policy, products, sampleOrder } from "./catalog";
import { updatePolicy } from "./policy-library";
import type { CommerceDocument } from "./store";
import { act } from "./actions";
import { canRetryTechnicalHandoff } from "./conversation";
import { AppError } from "../flamingo/errors";

function fixture(product = "headphones") {
  const order = sampleOrder(product);
  const t: CommerceTicket = { id: "test", orderId: order.id, status: "open", intent: "unknown", reason: "",
    createdAt: "", updatedAt: "", messages: [], steps: [], version: 0, aiCalls: 0, inputTokens: 0, outputTokens: 0,
    voiceSeconds: 0, speechCharacters: 0, estimatedCost: 0, costBasis: "test", refundState: "none" };
  const d: CommerceDocument = { id: "test", organization: "test", customer: "test", demo: true, products,
    policy: { ...policy }, orders: [order], tickets: [t], revision: 0, paypalConfigured: false, voiceConfigured: false, aiConfigured: false,
    operations: {}, expiresAt: new Date() };
  return { d, t, order };
}
test("regression: refund intent survives a typo-filled different-color reply", async () => {
  const { d, t, order } = fixture();
  await runAgents(d, t, order, "i want to refund a nd return this product", "text");
  assert.equal(t.intent, "refund"); assert.equal(t.status, "open");
  assert.match(t.messages.at(-1)!.text, /reason/i);
  await runAgents(d, t, order, "i want to buy diffrent color", "text");
  assert.equal(t.intent, "refund"); assert.equal(t.reason, "changed_mind");
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "return");
  assert.match(t.messages.at(-1)!.text, /separate new purchase/);
  assert.equal(t.aiCalls, 0);
});
test("short damage answer prompts investigation then a return, never a premature refund", async () => {
  const { d, t, order } = fixture();
  t.intent = "refund";
  await runAgents(d, t, order, "damaged", "voice");
  assert.equal(t.intent, "refund"); assert.equal(t.reason, "damaged");
  assert.equal(t.status, "open"); assert.equal(t.investigation?.stage, "investigating");
  assert.match(t.messages.at(-1)!.text, /What damage/);
  await runAgents(d, t, order, "the left ear cup was cracked when it arrived", "voice");
  assert.equal(t.status, "open"); assert.match(t.messages.at(-1)!.text, /photo of the damage.*without ending the call/);
  await runAgents(d, t, order, "I can't take a photo right now", "voice");
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "return");
  assert.match(t.messages.at(-1)!.text, /^No problem, your description is enough/);
  assert.ok(t.citations?.length); assert.equal(t.policyVersion, d.policy.version);
  assert.equal(order.status, "delivered"); assert.equal(t.refundState, "none");
});
test("changing a reason clears old investigation details; negation never becomes damage", () => {
  const { t } = fixture(); t.intent = "refund"; t.reason = "changed_mind";
  t.investigation = { summary: "", detail: "different color", question: "", stage: "ready", engine: "rules" };
  const u = understand(t, "damaged");
  assert.equal(u.reason, "damaged"); assert.equal(u.detail, "");
  t.reason = "damaged";
  const fixed = understand(t, "it is not damaged");
  assert.equal(fixed.reason, "unclear"); assert.equal(fixed.negated, true);
});
test("staff policy updates invalidate outstanding proposals and stale writes", async () => {
  const { d, t, order } = fixture();
  await runAgents(d, t, order, "I want to return this because I changed my mind", "text");
  assert.equal(t.status, "awaiting_confirmation");
  const version = d.policy.version;
  await updatePolicy(d, { action: "update_rules", version, returnDays: 7, automaticLimit: 80, instantRefundLimit: 30 });
  assert.equal(t.status, "open"); assert.equal(t.proposedAction, undefined); assert.equal(t.version, 1);
  assert.notEqual(d.policy.version, version);
  await assert.rejects(updatePolicy(d, { action: "update_rules", version, returnDays: 7, automaticLimit: 80, instantRefundLimit: 30 }), /changed/);
});
test("PDF text import is draft-only, versioned publish/archive changes active policy", async () => {
  const { d } = fixture();
  const version = d.policy.version;
  await updatePolicy(d, { action: "import", version, title: "Return conditions", pages: [{ page: 1, text: "Returns require the original packaging and a staff inspection before refund." }] });
  assert.equal(d.policyDocuments?.[0].status, "draft"); assert.equal(d.policy.version, version);
  // Unit tests must never spend inference credits even when real credentials exist.
  await updatePolicy(d, { action: "publish", version, documentId: d.policyDocuments![0].id }, async () => {});
  assert.equal(d.policyDocuments![0].status, "published"); assert.notEqual(d.policy.version, version);
  const publishedVersion = d.policy.version;
  await updatePolicy(d, { action: "update_rules", version: publishedVersion, returnDays: 21, automaticLimit: 95, instantRefundLimit: 40 }, async () => {});
  assert.equal(d.policyDocuments![0].status, "published");
  assert.equal(d.policy.returnDays, 21);
  assert.notEqual(d.policy.version, publishedVersion);
  await updatePolicy(d, { action: "archive", version: d.policy.version, documentId: d.policyDocuments![0].id });
  assert.equal(d.policyDocuments![0].status, "archived");
});

async function publishedFixture() {
  const f = fixture();
  await updatePolicy(f.d, { action: "import", version: f.d.policy.version, title: "Store policy",
    pages: [{ page: 1, text: "Eligible returns within 30 days up to $100 can be authorized after confirmation. Refunds follow warehouse receipt. Damaged items up to $50 may qualify for no-return refunds." }] });
  await updatePolicy(f.d, { action: "publish", version: f.d.policy.version, documentId: f.d.policyDocuments![0].id }, async () => {});
  return f;
}
const localRetrieval = async () => [];
/** Simulates the earlier photo request so a test can focus on the decision. */
function photoAlreadyAsked(t: CommerceTicket) {
  t.messages.push({ id: "ask", role: "agent", channel: "text", text: `Could you add a photo? ${PHOTO_CUE}.`, at: "" });
}
const compatible = async () => ({ text: JSON.stringify({ intent: "return", reason: "damaged", detail: "",
  policyAssessment: "compatible", policyExplanation: "Return authorization is permitted; receipt is needed later for the refund." }),
  cached: false, inputTokens: 100, outputTokens: 40 });

test("published PDF: request and generic damage collect facts without spending model quota", async () => {
  const { d, t, order } = await publishedFixture();
  const deps = { retrieve: localRetrieval, complete: async () => { throw new Error("Unexpected model call"); } };
  await runAgents(d, t, order, "I want to return these headphones.", "voice", deps);
  assert.equal(t.status, "open"); assert.equal(t.investigation?.engine, "rules");
  assert.match(t.messages.at(-1)!.text, /reason/);
  await runAgents(d, t, order, "They are damaged.", "voice", deps);
  assert.equal(t.investigation?.engine, "rules"); assert.match(t.messages.at(-1)!.text, /What damage/);
  assert.equal(t.aiCalls, 0);
});
test("published PDF: full short policy and proposed step distinguish authorization from later receipt", async () => {
  const { d, t, order } = await publishedFixture(); t.intent = "return"; photoAlreadyAsked(t);
  await runAgents(d, t, order, "The left ear cup has cracked when I opened the package.", "voice", {
    retrieve: localRetrieval, complete: async (system, prompt) => {
      const context = JSON.parse(prompt);
      assert.equal(context.nextStep.action, "return");
      assert.equal(context.order.amount, 89);
      assert.equal(context.supplemental.coverage, "complete document");
      assert.match(context.supplemental.text, /warehouse receipt/);
      assert.match(system, /FUTURE steps/);
      assert.ok(Buffer.byteLength(system + prompt) + 700 <= 6000);
      return compatible();
    },
  });
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "return");
  assert.match(t.messages.at(-1)!.text, /as soon as KikoStore receives the item/);
  assert.equal(t.refundState, "none"); assert.equal(order.status, "delivered");
});
test("AI failure is a retryable technical state, never a fabricated policy restriction", async () => {
  for (const failure of [new AppError(429, "AI is cooling down.", 10), new SyntaxError("Invalid JSON")]) {
    const { d, t, order } = await publishedFixture(); t.intent = "return"; photoAlreadyAsked(t);
    await runAgents(d, t, order, "The left ear cup has cracked when I opened the package.", "voice", {
      retrieve: localRetrieval, complete: async () => { throw failure; },
    });
    assert.equal(t.status, "open"); assert.equal(t.proposedAction, undefined);
    assert.equal(t.reason, "damaged"); assert.match(t.investigation!.detail, /ear cup/);
    assert.match(t.messages.at(-1)!.text, /technical issue, not a rejection/);
    assert.doesNotMatch(t.messages.at(-1)!.text, /additional condition|passing your/);
    assert.equal(t.refundState, "none");
  }
});
test("explicit supplemental restrictions still require staff", async () => {
  const { d, t, order } = await publishedFixture(); t.intent = "return"; photoAlreadyAsked(t);
  await runAgents(d, t, order, "The left ear cup was cracked.", "voice", {
    retrieve: localRetrieval, complete: async () => ({ ...(await compatible()),
      text: JSON.stringify({ intent: "return", reason: "damaged", detail: "", policyAssessment: "restricted", policyExplanation: "Staff inspection is required before authorization." }) }),
  });
  assert.equal(t.status, "escalated"); assert.equal(t.proposedAction, undefined); assert.equal(t.refundState, "none");
});
test("handoff follow-ups answer timing and thanks without changing financial or investigation state", async () => {
  const { d, t, order } = fixture(); t.intent = "return"; t.reason = "damaged"; t.status = "escalated";
  for (const input of ["Will you refund me before I send it back?", "Okay. Thank you."]) {
    await act(d, { action: "message", ticketId: t.id, version: t.version, message: input, channel: "voice" }, "https://example.test", async () => {});
    assert.equal(t.status, "escalated"); assert.equal(t.intent, "return"); assert.equal(t.refundState, "none");
    assert.equal(t.proposedAction, undefined); assert.equal(order.status, "delivered");
    assert.equal(t.messages.at(-1)!.channel, "voice");
    assert.match(t.messages.at(-1)!.text, input.includes("before") ? /confirm receipt before/ : /You’re welcome/);
  }
  assert.equal(t.aiCalls, 0);
});
test("timing question and thanks preserve an existing return proposal", async () => {
  const { d, t, order } = fixture(); t.intent = "return"; t.reason = "damaged"; t.status = "awaiting_confirmation"; t.proposedAction = "return";
  await runAgents(d, t, order, "Will you refund me before I send it back?", "voice");
  assert.equal(t.intent, "return"); assert.equal(t.proposedAction, "return");
  await runAgents(d, t, order, "Okay. Thank you.", "voice");
  assert.equal(t.status, "awaiting_confirmation"); assert.match(t.messages.at(-1)!.text, /You’re welcome/);
});
test("explicit retry can recover a legacy technical handoff, but not a human-owned case", () => {
  const { t } = fixture(); t.status = "escalated"; t.intent = "return";
  t.investigation = { summary: "", detail: "cracked ear cup", question: "", stage: "handoff", engine: "guarded_fallback" };
  t.steps.push({ id: "guard", agent: "Usage guard", detail: "Model unavailable", at: "" });
  assert.equal(canRetryTechnicalHandoff(t, "Check the policy again"), true);
  assert.equal(canRetryTechnicalHandoff(t, "Okay, thanks"), false);
  t.steps.push({ id: "handoff", agent: "Handoff coordinator", detail: "User requested staff", at: "" });
  assert.equal(canRetryTechnicalHandoff(t, "Check the policy again"), false);
  t.steps.pop();
  t.messages.push({ id: "staff", role: "human", channel: "text", text: "I am reviewing this", at: "" });
  assert.equal(canRetryTechnicalHandoff(t, "Check the policy again"), false);
});
test("misheard torn bag: asks for one photo, waits if uploading, then approves without looping", async () => {
  const { d, t, order } = fixture("backpack");
  await runAgents(d, t, order, "Return and refund my bag. It's urine one side. I mean, it's a to run from one side.", "voice");
  assert.equal(t.reason, "damaged"); assert.equal(t.status, "open");
  assert.match(t.messages.at(-1)!.text, new RegExp(PHOTO_CUE));
  await runAgents(d, t, order, "ok wait, uploading it", "text");
  assert.equal(t.status, "open"); assert.match(t.messages.at(-1)!.text, /take your time/);
  await runAgents(d, t, order, "bag zip is stuck when i opened the package which seems to be damaged", "text");
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "return");
  assert.equal(t.messages.filter(m => m.text.includes(PHOTO_CUE)).length, 1);
  assert.equal(t.aiCalls, 0);
});
test("a photo already on the case skips the photo request", async () => {
  const { d, t, order } = fixture("speaker");
  t.evidence = [{ id: "e", status: "ready", kind: "damage", observation: "Tear on the cone", ocrText: "" } as NonNullable<CommerceTicket["evidence"]>[number]];
  await runAgents(d, t, order, "the speaker has no sound at all, I want a refund", "text");
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "refund");
});
test("published policy: a photo-only turn still runs the policy check and approves instead of handing off", async () => {
  const { d, t, order } = await publishedFixture();
  t.intent = "return"; t.reason = "damaged";
  t.investigation = { summary: "", detail: "Photo shows a tear on the cone.", question: "", stage: "investigating", engine: "rules" };
  t.evidence = [{ id: "e", status: "ready", kind: "damage", observation: "Tear on the cone", ocrText: "" } as NonNullable<CommerceTicket["evidence"]>[number]];
  let called = 0;
  await runAgents(d, t, order, "", "text", { opener: "Thanks, I can see a tear.", retrieve: localRetrieval, complete: async () => { called++; return compatible(); } });
  assert.equal(called, 1);
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "return");
});
test("published policy: an uncertain assessment uses the store rules; only an explicit restriction hands off", async () => {
  const { d, t, order } = await publishedFixture(); t.intent = "refund"; photoAlreadyAsked(t);
  await runAgents(d, t, order, "The left ear cup was cracked.", "voice", {
    retrieve: localRetrieval, complete: async () => ({ ...(await compatible()),
      text: JSON.stringify({ intent: "refund", reason: "damaged", detail: "", policyAssessment: "uncertain", policyExplanation: "Not covered." }) }),
  });
  assert.equal(t.status, "awaiting_confirmation");
});
test("a handoff from an inconclusive policy check is re-investigated when the customer follows up", async () => {
  const { d, t, order } = await publishedFixture();
  t.status = "escalated"; t.intent = "return"; t.reason = "damaged"; t.assignedTo = "KikoStore team";
  t.investigation = { summary: "", detail: "Photo shows a tear on the cone.", question: "", stage: "handoff", engine: "rules" };
  t.evidence = [{ id: "e", status: "ready", kind: "damage", observation: "Tear on the cone", ocrText: "" } as NonNullable<CommerceTicket["evidence"]>[number]];
  t.steps.push({ id: "s", agent: "Policy specialist", detail: "policy-x: The published policy has an extra condition that needs a staff decision.", at: "" });
  const { canReinvestigateHandoff } = await import("./conversation");
  assert.equal(canReinvestigateHandoff(t), true);
  t.status = "open";
  await runAgents(d, t, order, "As the item is damaged, I want a refund.", "voice", { retrieve: localRetrieval, complete: compatible });
  assert.equal(t.status, "awaiting_confirmation");
  t.messages.push({ id: "h", role: "human", channel: "text", text: "Staff here", at: "" });
  t.status = "escalated";
  assert.equal(canReinvestigateHandoff(t), false);
});
