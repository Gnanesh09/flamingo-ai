// Isolated demo only. Does not approve, capture or refund a PayPal payment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { spawnSync } from "node:child_process";

const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
let cookie = "";
async function call(path, body, expected = 200, overrideCookie) {
  const r = await fetch(`${origin}/api/commerce/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...(overrideCookie || cookie ? { Cookie: overrideCookie || cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.headers.get("set-cookie") && !overrideCookie) cookie = r.headers.get("set-cookie").split(";")[0];
  const json = await r.json();
  assert.equal(r.status, expected, `${path}: ${json.error || r.status}`);
  return json;
}
let state = await call("demo", {});
assert.equal(state.demo, true);
const ws = new WebSocket(`${origin.replace("https:", "wss:")}/api/commerce/ws`, { headers: { Cookie: cookie, Origin: origin } });
let updates = 0;
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("WebSocket open timeout")), 15000);
  ws.on("message", data => {
    const m = JSON.parse(data.toString());
    if (m.type === "connected") { clearTimeout(timeout); resolve(); }
    if (m.type === "changed") updates++;
  });
  ws.on("error", reject);
});
async function action(body, expected = 200) {
  const r = await call("action", body, expected);
  if (r.state) state = r.state;
  return r;
}
async function open(productId) {
  const o = state.orders.find(o => o.productId === productId);
  const r = await action({ action: "open_ticket", orderId: o.id });
  return () => state.tickets.find(t => t.id === r.ticketId);
}
const speaker = await open("speaker");
await action({ action: "message", ticketId: speaker().id, version: speaker().version, message: "The speaker arrived with a cracked case and I want a refund." });
assert.equal(speaker().status, "awaiting_confirmation");
assert.equal(speaker().proposedAction, "refund");
await action({ action: "confirm", ticketId: speaker().id, version: 0 }, 409);
await action({ action: "confirm", ticketId: speaker().id, version: speaker().version });
assert.equal(speaker().status, "resolved");
assert.equal(speaker().refundState, "simulated");
await action({ action: "confirm", ticketId: speaker().id, version: speaker().version }, 409);
state = await call("state");
assert.equal(speaker().refundState, "simulated");
const headphones = await open("headphones");
await action({ action: "message", ticketId: headphones().id, version: headphones().version, message: "I changed my mind and want to return this." });
assert.equal(headphones().proposedAction, "return");
await action({ action: "confirm", ticketId: headphones().id, version: headphones().version });
assert.equal(headphones().status, "awaiting_return");
assert.match(headphones().returnCode, /^KR-/);
assert.equal(headphones().refundState, "none");
await action({ action: "reject", ticketId: headphones().id, version: headphones().version, message: "Invalid transition" }, 409);
await action({ action: "received_return", ticketId: headphones().id, version: headphones().version, message: "Demo warehouse receipt checked." });
assert.equal(headphones().status, "resolved");
const watch = await open("watch");
await action({ action: "message", ticketId: watch().id, version: watch().version, message: "The watch is broken and I need a refund." });
assert.equal(watch().status, "escalated");
await action({ action: "human_reply", ticketId: watch().id, version: watch().version, message: "A specialist is reviewing this request." });
assert.equal(watch().messages.at(-1).role, "human");
await action({ action: "reject", ticketId: watch().id, version: watch().version, message: "Demo decline to exercise the appeal workflow." });
assert.equal(watch().status, "rejected");
await action({ action: "reopen", ticketId: watch().id, version: watch().version, message: "Please review my evidence again." });
assert.equal(watch().status, "escalated");
const purchaseId = randomUUID();
const purchase = await action({ action: "sample_purchase", productId: "lamp", quantity: 2, requestId: purchaseId });
const count = state.orders.length;
const duplicate = await action({ action: "sample_purchase", productId: "lamp", quantity: 2, requestId: purchaseId });
assert.equal(duplicate.orderId, purchase.orderId);
assert.equal(state.orders.length, count);
const lamp = await open("lamp");
if (process.argv.includes("--ai")) {
  await action({ action: "message", ticketId: lamp().id, version: lamp().version, message: "These lights arrived with cracks. Could you help me get my money back?" });
  assert.ok(lamp().steps.some(s => s.agent === "Intent specialist"));
  console.log(`Groq measured calls: ${lamp().aiCalls}; recorded tokens: ${lamp().inputTokens + lamp().outputTokens}`);
}
if (process.argv.includes("--voice")) {
  const greeting = lamp().messages.find(m => m.role === "agent");
  const audio = await call("voice/speak", { ticketId: lamp().id, messageId: greeting.id });
  assert.equal(audio.mimeType, "audio/mpeg");
  assert.ok(audio.audio.length > 100);
  console.log("Deepgram speech returned playable MP3.");
  const converted = spawnSync("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-t", "12", "-c:a", "libopus", "-f", "webm", "pipe:1"], { input: Buffer.from(audio.audio, "base64"), maxBuffer: 3000000 });
  assert.equal(converted.status, 0, "Audio conversion failed");
  const transcript = await call("voice/transcribe", { ticketId: lamp().id, audio: converted.stdout.toString("base64"), mimeType: "audio/webm", seconds: 12 });
  assert.ok(transcript.text.trim().length > 10);
  console.log("Deepgram transcribed the test audio; no audio persisted.");
}
if (process.argv.includes("--paypal-checkout")) {
  const p = await action({ action: "checkout", productId: "bottle", quantity: 1, requestId: randomUUID() });
  assert.equal(new URL(p.approvalUrl).hostname, "www.sandbox.paypal.com");
  await action({ action: "capture", orderId: p.orderId }, 409);
  console.log("PayPal Sandbox checkout created; unapproved capture correctly blocked. No money captured.");
}
// Another signed demo cookie cannot access this workspace's ticket.
const firstCookie = cookie;
cookie = "";
const other = await call("demo", {});
assert.notEqual(other.id, state.id);
await call("action", { action: "message", ticketId: watch().id, version: watch().version, message: "Should be forbidden" }, 404);
cookie = firstCookie;
assert.ok(updates > 0, "WebSocket delivered real mutation notifications");
ws.close();
console.log(`PASS: persistence, policy, refund simulation, return receipt, human escalation, reopen, idempotency, isolation, ${updates} WebSocket updates.`);
