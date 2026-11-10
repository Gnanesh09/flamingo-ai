import test from "node:test";
import assert from "node:assert/strict";
import { policyDecision } from "./agent";
import { sampleOrder } from "./catalog";

test("only inexpensive reported damage supports instant refunds", () => {
  assert.equal(policyDecision(sampleOrder("speaker"), "refund", "damaged").action, "refund");
  assert.equal(policyDecision(sampleOrder("headphones"), "refund", "damaged").action, "return");
  assert.equal(policyDecision(sampleOrder("speaker"), "refund", "changed_mind").action, "return");
});
test("policy guard rejects high-value, final-sale, expired and unpaid orders", () => {
  assert.equal(policyDecision(sampleOrder("watch"), "refund", "damaged").action, "escalate");
  assert.equal(policyDecision(sampleOrder("bottle"), "return", "changed_mind").action, "escalate");
  assert.equal(policyDecision(sampleOrder("speaker", 1, 31), "refund", "damaged").action, "escalate");
  const order = sampleOrder("speaker"); order.status = "created";
  assert.equal(policyDecision(order, "refund", "damaged").action, "escalate");
  order.status = "refunded";
  assert.equal(policyDecision(order, "refund", "damaged").action, "escalate");
});
test("human and missing-delivery requests never silently auto-resolve", () => {
  assert.equal(policyDecision(sampleOrder("speaker"), "human", "other").action, "escalate");
  assert.equal(policyDecision(sampleOrder("speaker"), "refund", "missing").action, "escalate");
  assert.equal(policyDecision(sampleOrder("speaker"), "refund", "unclear").action, "clarify");
});
test("quantity raises the full order amount and does not bypass thresholds", () => {
  assert.equal(policyDecision(sampleOrder("speaker", 3), "refund", "damaged").action, "escalate");
});
