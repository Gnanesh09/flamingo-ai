import { test } from "node:test";
import assert from "node:assert/strict";
import type { Workspace } from "./store";
import { reconcileResolutions, reminderIsPaused, resolutionViews, today, validatePromise } from "./resolution-state";

function fixture(): Workspace {
  const now = new Date().toISOString();
  return {
    id: "test-workspace", version: 0, active: true, username: "Test", role: "business", createdAt: now,
    customers: [], activity: [], conversation: [], reminders: [], operations: {},
    settings: { businessName: "Test studio", senderEmail: "", reminderTone: "friendly", minimumOverdueDays: 7 },
    invoices: [{ id: "invoice", number: "TEST-1", customerId: "customer", customerName: "Test customer", customerEmail: "test@example.com",
      dueDate: today(), createdAt: now, items: [{ name: "Work", quantity: 1, unitPrice: 1000 }], notes: "",
      amount: 1000, balance: 800, paidAmount: 200, currency: "USD", status: "partially_paid", source: "demo", daysOverdue: 0 }],
    resolutions: [{ id: "case", invoiceId: "invoice", invoiceNumber: "TEST-1", customerName: "Test customer", balance: 800, source: "demo",
      kind: "needs_time", status: "needs_review", messages: [], createdAt: now, updatedAt: now, version: 0, reminderPaused: true }],
  };
}
test("pending review, dispute and unverified payment claims pause follow-ups", () => {
  const ws = fixture();
  for (const kind of ["needs_time", "dispute", "already_paid"] as const) {
    ws.resolutions![0].kind = kind;
    assert.equal(reminderIsPaused(ws, "invoice"), true);
    reconcileResolutions(ws);
    assert.notEqual(ws.resolutions![0].status, "resolved");
    assert.equal(ws.invoices[0].balance, 800);
  }
});
test("commitment expires after the full agreed UTC day; views derive missed without mutating stored records", () => {
  const ws = fixture(), r = ws.resolutions![0];
  r.status = "committed";
  r.commitment = { amount: 800, date: today(), state: "accepted" };
  assert.equal(reminderIsPaused(ws, "invoice"), true);
  r.commitment.date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(resolutionViews(ws)[0].status, "missed");
  assert.equal(r.status, "committed");
  reconcileResolutions(ws);
  assert.equal(r.status, "missed");
  assert.equal(r.commitment.state, "missed");
  assert.equal(reminderIsPaused(ws, "invoice"), false);
});
test("sample paid records never create a PayPal-verified resolution", () => {
  const ws = fixture();
  Object.assign(ws.invoices[0], { status: "paid", balance: 0, lastSyncedAt: new Date().toISOString() });
  reconcileResolutions(ws);
  assert.notEqual(ws.resolutions![0].status, "resolved");
});
test("an expired older promise does not clear a newer payment claim or review pause", () => {
  for (const status of ["verification_needed", "needs_review"] as const) {
    const ws = fixture(), r = ws.resolutions![0];
    r.status = status;
    r.commitment = { amount: 800, date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), state: "accepted" };
    reconcileResolutions(ws);
    assert.equal(r.status, status);
    assert.equal(r.commitment.state, "missed");
    assert.equal(reminderIsPaused(ws, "invoice"), true);
  }
});
test("verified PayPal zero balance closes a case exactly once", () => {
  const ws = fixture(), r = ws.resolutions![0];
  Object.assign(ws.invoices[0], { source: "paypal", status: "paid", balance: 0, lastSyncedAt: new Date().toISOString() });
  reconcileResolutions(ws);
  assert.equal(r.status, "resolved");
  assert.equal(reminderIsPaused(ws, "invoice"), true);
  const version = r.version;
  reconcileResolutions(ws);
  assert.equal(r.version, version);
});
test("an old payment does not fulfill a new partial-payment commitment", () => {
  const ws = fixture(), r = ws.resolutions![0];
  r.status = "committed"; r.baselinePaid = 200;
  r.commitment = { amount: 300, date: today(), state: "accepted" };
  Object.assign(ws.invoices[0], { source: "paypal", lastSyncedAt: new Date().toISOString() });
  reconcileResolutions(ws);
  assert.equal(r.commitment.state, "accepted");
  Object.assign(ws.invoices[0], { paidAmount: 500, balance: 500 });
  reconcileResolutions(ws);
  assert.equal(r.commitment.state, "fulfilled");
  assert.equal(r.status, "waiting_customer");
  assert.equal(r.balance, 500);
  assert.notEqual(r.status, "resolved");
});
test("invalid dates, over-balance requests and fractional cents are rejected", () => {
  const ws = fixture();
  for (const [date, amount] of [["2026-02-30", 10], [today(), 801], [today(), 1.001], [today(), 0]] as const)
    assert.throws(() => validatePromise(date, amount, ws.invoices[0]));
  assert.deepEqual(validatePromise(today(), 800, ws.invoices[0]), { date: today(), amount: 800 });
});
