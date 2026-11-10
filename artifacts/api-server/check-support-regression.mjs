import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
let cookie = "";
let state;
async function request(path, body, expected = 200) {
  const r = await fetch(`${base}/api/commerce/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const set = r.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
  const data = await r.json();
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
async function action(body) {
  const result = await request("action", body);
  state = result.state; return result;
}
state = await request("demo", {});
const order = state.orders.find(o => o.productId === "headphones");
const opened = await action({ action: "open_ticket", orderId: order.id });
const ticketId = opened.ticketId;
const ticket = () => state.tickets.find(t => t.id === ticketId);
async function say(message) { await action({ action: "message", ticketId, version: ticket().version, message }); }
await say("i want to refund a nd return this product");
assert.equal(ticket().intent, "refund"); assert.equal(ticket().status, "open");
await say("i want to buy diffrent color");
assert.equal(ticket().reason, "changed_mind"); assert.equal(ticket().proposedAction, "return");
await say("damaged");
assert.equal(ticket().intent, "refund"); assert.equal(ticket().status, "open");
assert.match(ticket().messages.at(-1).text, /What damage/);
await say("the left ear cup was cracked when it arrived");
assert.equal(ticket().status, "awaiting_confirmation"); assert.equal(ticket().proposedAction, "return");
assert.equal(ticket().aiCalls, 0);
state = await request("state");
assert.equal(ticket().investigation.detail, "the left ear cup was cracked when it arrived");
assert.ok(ticket().citations.length);
console.log("PASS: real Mongo reload preserves multi-turn intent, investigation, citations and unexecuted proposal");

const previousVersion = state.policy.version;
state = await request("policy", { action: "import", version: previousVersion, title: "Regression policy", pages: [{ page: 1, text: "Headphone damage claims require a KikoStore staff inspection before any automatic return authorization or refund. Do not approve automatically." }] });
const documentId = state.policyDocuments[0].id;
assert.equal(state.policy.version, previousVersion); assert.equal(ticket().status, "awaiting_confirmation");
state = await request("policy", { action: "publish", version: previousVersion, documentId });
const elasticOn = !!(process.env.ELASTICSEARCH_URL && process.env.ELASTICSEARCH_API_KEY && process.env.ELASTICSEARCH_INFERENCE_ID);
if (elasticOn) assert.equal(state.policyDocuments.find(p => p.id === documentId).indexed, true);
assert.equal(ticket().status, "open"); assert.equal(ticket().proposedAction, undefined);
await request("action", { action: "confirm", ticketId, version: ticket().version }, 409);
if (process.argv.includes("--ai")) {
  await say("Please recheck my damaged headphones under the current policy.");
  assert.equal(ticket().status, "escalated");
  assert.ok(ticket().citations.some(c => c.documentId === documentId));
  if (elasticOn) assert.equal(state.retrievalMode, "elastic_semantic", state.retrievalNotice);
  console.log(`PASS: published policy retrieved and safely escalated; retrieval=${state.retrievalMode}, interpretation=${ticket().investigation.engine}, model calls=${ticket().aiCalls}`);
}
state = await request("policy", { action: "archive", version: state.policy.version, documentId });
state = await request("policy", { action: "update_rules", version: state.policy.version, returnDays: 14, automaticLimit: 90, instantRefundLimit: 40 });
state = await request("state");
assert.equal(state.policy.returnDays, 14);
assert.equal(state.policyDocuments[0].status, "archived");
await request("policy", { action: "update_rules", version: previousVersion, returnDays: 30, automaticLimit: 100, instantRefundLimit: 50 }, 409);
console.log("PASS: draft/publish/archive, proposal invalidation, changed limits and stale-write guard persist through Mongo");

if (process.argv.includes("--voice")) {
  const purchase = await action({ action: "sample_purchase", productId: "speaker", quantity: 1, requestId: crypto.randomUUID() });
  const test = await action({ action: "open_ticket", orderId: purchase.orderId });
  const tt = () => state.tickets.find(t => t.id === test.ticketId);
  await action({ action: "human_reply", ticketId: test.ticketId, version: tt().version, message: "I want to return my headphones. The left ear cup was cracked when it arrived." });
  const speech = await request("voice/speak", { ticketId: test.ticketId, messageId: tt().messages.at(-1).id });
  await mkdir("generated-artifacts/support-tests", { recursive: true });
  await writeFile("generated-artifacts/support-tests/customer-turn.mp3", Buffer.from(speech.audio, "base64"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "generated-artifacts/support-tests/customer-turn.mp3", "-ar", "48000", "-ac", "1", "generated-artifacts/support-tests/customer-turn.wav"]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "generated-artifacts/support-tests/customer-turn.mp3", "-c:a", "libopus", "generated-artifacts/support-tests/customer-turn.webm"]);
  const { readFile } = await import("node:fs/promises");
  const audio = (await readFile("generated-artifacts/support-tests/customer-turn.webm")).toString("base64");
  const transcript = await request("voice/transcribe", { ticketId: test.ticketId, audio, mimeType: "audio/webm;codecs=opus", seconds: 8 });
  assert.match(transcript.text, /headphones|ear cup/i);
  console.log("PASS: real Deepgram speech → recorded WebM → real Deepgram transcription; audio fixture ready for browser test");
}
