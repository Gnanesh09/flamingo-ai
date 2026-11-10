import test from "node:test";
import assert from "node:assert/strict";
import type { CommerceTicket } from "@workspace/api-zod";
import { acceptable, forbiddenIn, type ReplyPlan } from "./reply-writer";
import { normalizeVision } from "./vision";
import { groqWaitMs, tryReserveGroq } from "../flamingo/groq-window";
import { runAgents } from "./agent";
import { policy, products, sampleOrder } from "./catalog";
import type { CommerceDocument } from "./store";

const plan = (over: Partial<ReplyPlan> = {}): ReplyPlan => ({ kind: "clarify", template: "t", question: "What damage can you see?", product: "Headphones", recent: [], ...over });

test("writer guard blocks money, approvals and logistics but allows words from the given question", () => {
  assert.ok(forbiddenIn("Your refund has been approved!", plan()));
  assert.equal(forbiddenIn("This is approved", plan()), "approved");
  assert.equal(forbiddenIn("You'll get $89 back", plan()), "$8");
  assert.equal(forbiddenIn("I've refunded it", plan()), "I've refunded");
  assert.equal(forbiddenIn("I’ll send a label", plan()), "label");
  assert.equal(forbiddenIn("Per our policy", plan()), "policy");
  assert.equal(forbiddenIn("Sorry about that. What damage can you see?", plan()), undefined);
  assert.equal(forbiddenIn("Would you like to return it, per policy?", plan({ question: "Should I check the policy?" })), undefined);
});

test("writer output shape: clarify must ask, lead must not ask or format", () => {
  assert.ok(acceptable("Sorry to hear that. What damage can you see?", plan()));
  assert.ok(!acceptable("Sorry to hear that.", plan()));
  assert.ok(acceptable("Thanks, I’ve checked your order.", plan({ kind: "lead", fixed: "x" })));
  assert.ok(!acceptable("Thanks. Anything else?", plan({ kind: "lead", fixed: "x" })));
  assert.ok(!acceptable("**Sorry** what happened?", plan()));
  assert.ok(!acceptable(`${"a".repeat(430)}?`, plan()));
});

test("vision post-rules never let poor or low-confidence output read as a finding", () => {
  const base = { subject: "headphones", matchesOrder: "yes" as const, labelConcern: "", imageQuality: "good" as const, assessment: "visible_damage" as const,
    damageTypes: ["crack"], location: "left ear cup", severity: "moderate" as const, confidence: 0.9, observation: "A crack." };
  assert.equal(normalizeVision(base).assessment, "visible_damage");
  assert.equal(normalizeVision({ ...base, imageQuality: "poor" }).assessment, "unclear");
  assert.match(normalizeVision({ ...base, imageQuality: "poor" }).question, /clearer/);
  assert.equal(normalizeVision({ ...base, confidence: 0.4 }).assessment, "unclear");
  assert.equal(normalizeVision({ ...base, confidence: 0.4 }).findings.severity, "none");
  assert.match(normalizeVision({ ...base, matchesOrder: "no" }).question, /item from this order/);
  assert.match(normalizeVision({ ...base, damageTypes: ["packaging_damage"] }).question, /packaging/);
  assert.deepEqual(normalizeVision({ ...base, damageTypes: ["laser", "dent"] }).findings.damageTypes, ["dent"]);
  assert.equal(normalizeVision({ ...base, damageTypes: [] }).findings.damageTypes[0], "other");
});

test("per-model window: models are independent and a full window reports a wait", () => {
  assert.equal(groqWaitMs("test/a", 5000), 0);
  assert.ok(tryReserveGroq("test/a", 5000));
  assert.ok(!tryReserveGroq("test/a", 2500));
  assert.ok(groqWaitMs("test/a", 2500) > 50_000);
  assert.ok(tryReserveGroq("test/b", 5000));
});

function setup(productId = "speaker") {
  const order = sampleOrder(productId);
  const t: CommerceTicket = { id: "t1", orderId: order.id, status: "open", intent: "unknown", reason: "unclear", messages: [], steps: [], createdAt: "", updatedAt: "",
    estimatedCost: 0, aiCalls: 0, inputTokens: 0, outputTokens: 0, voiceSeconds: 0, speechCharacters: 0, version: 1, refundState: "none" } as unknown as CommerceTicket;
  const d = { id: "d", policy, products, orders: [order], tickets: [t], policyDocuments: [], retrievalMode: "local_text" } as unknown as CommerceDocument;
  return { d, t, order };
}

test("writer phrases the opener only; the decision text and status stay deterministic", async () => {
  const { d, t, order } = setup();
  const seen: ReplyPlan[] = [];
  const write = async (p: ReplyPlan) => { seen.push(p); return { text: p.fixed ? `Got it. ${p.fixed}` : "Oh no. What damage can you see?", written: true, inputTokens: 10, outputTokens: 5 }; };
  t.messages.push({ id: "m", role: "customer", text: "I want a refund, the speaker grille is cracked", channel: "text", at: "" });
  await runAgents(d, t, order, "I want a refund, the speaker grille is cracked", "text", { write, retrieve: async () => [] });
  const last = t.messages.at(-1)!.text;
  if (t.status === "awaiting_confirmation") {
    assert.equal(seen[0].kind, "lead");
    assert.ok(last.endsWith(seen[0].fixed!), "outcome text must be appended verbatim");
    assert.match(seen[0].fixed!, /\$39\.00/);
  } else {
    assert.equal(seen[0].kind, "lead");
    assert.ok(seen[0].fixed && last.endsWith(seen[0].fixed), "questions are appended verbatim");
  }
  assert.ok(t.steps.some(s => s.agent === "Reply writer"));
});

test("without a writer the exact template is used", async () => {
  const { d, t, order } = setup();
  t.messages.push({ id: "m", role: "customer", text: "I want to return this", channel: "text", at: "" });
  await runAgents(d, t, order, "I want to return this", "text", { retrieve: async () => [] });
  assert.match(t.messages.at(-1)!.text, /reason for the return/);
  assert.ok(!t.steps.some(s => s.agent === "Reply writer"));
});

test("vision follow-up never asks the customer about brand, model or labels", () => {
  const base = { subject: "headphones", matchesOrder: "yes" as const, labelConcern: "Brand differs", imageQuality: "good" as const, assessment: "visible_damage" as const,
    damageTypes: ["crack"], location: "The Left ear cup", severity: "moderate" as const, confidence: 0.9, observation: "A crack." };
  const v = normalizeVision(base);
  assert.doesNotMatch(v.question, /model|brand|label/i);
  assert.equal(v.findings.location, "left ear cup");
});

test("resolution first: a described fault after a vague start reaches an approved refund without escalating", async () => {
  const { d, t, order } = setup();
  const say = async (text: string) => { t.messages.push({ id: String(t.messages.length), role: "customer", text, channel: "voice", at: "" }); await runAgents(d, t, order, text, "voice", { retrieve: async () => [], complete: async () => { throw new Error("no model"); } }); };
  await say("I want to return and refund and get refund on this product.");
  assert.equal(t.status, "open");
  await say("Yes. The the item is the Toran and not able to get the noise sound from these people.");
  assert.equal(t.reason, "defective");
  assert.equal(t.status, "open"); assert.match(t.messages.at(-1)!.text, /photo of the Pebble Mini Bluetooth Speaker/);
  await say("I don't have a photo");
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "refund");
  assert.match(t.messages.at(-1)!.text, /refund is approved/);
});

test("vague reasons never escalate; after a few replies they become a standard return", async () => {
  const { d, t, order } = setup();
  const say = async (text: string) => { t.messages.push({ id: String(t.messages.length), role: "customer", text, channel: "text", at: "" }); await runAgents(d, t, order, text, "text", { retrieve: async () => [], complete: async () => { throw new Error("no model"); } }); };
  await say("I want a refund");
  await say("hmm");
  await say("I have given");
  assert.notEqual(t.status, "escalated");
  assert.equal(t.proposedAction, "return");
});
