// Creates only a dedicated sandbox fixture workspace; never sends money or email.
import assert from "node:assert/strict";
const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let cookie = "";
async function api(path, method = "GET", body, expected = 200, owner = true) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(owner && cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${data.error ?? response.status}`);
  return data;
}
await api("/session", "POST", { username: `Resolution QA ${Date.now().toString(36)}`, role: "business" });
const invoices = await api("/invoices");
const invoice = invoices.find(i => i.source === "demo" && i.status === "overdue");
assert.ok(invoice);
await api(`/invoices/${invoices.find(i => i.status === "draft").id}/portal`, "POST", undefined, 409);
const link = await api(`/invoices/${invoice.id}/portal`, "POST", undefined, 201);
const token = link.path.split("#")[1];
let view = await api("/portal/view", "POST", { token }, 200, false);
assert.equal(view.invoice.number, invoice.number);
assert.equal("customerEmail" in view.invoice, false);
await api("/portal/view", "POST", { token: `${token.slice(0, -2)}xx` }, 404, false);
const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
view = await api("/portal/respond", "POST", { token, action: "needs_time", message: "Our payment run is next week.", version: 0, date, amount: invoice.balance }, 200, false);
let r = view.resolution;
assert.equal(r.status, "needs_review");
assert.equal(r.reminderPaused, true);
if (process.argv.includes("--with-ai")) {
  const analysis = await api(`/resolutions/${r.id}/analyze`, "POST");
  assert.ok(analysis.summary.length > 0);
  assert.ok(analysis.steps.length >= 3);
  console.log(`PASS: resolution analysis returned ${analysis.engine} guidance without executing a decision.`);
}
await api(`/resolutions/${r.id}/decision`, "POST", { action: "approve_date", message: "Agreed", version: 0 }, 409);
r = await api(`/resolutions/${r.id}/decision`, "POST", { action: "approve_date", message: "That date works; thank you.", version: r.version });
assert.equal(r.status, "committed");
assert.equal(r.commitment.state, "accepted");
await api("/reminders", "POST", { invoiceId: invoice.id, tone: "friendly" }, 409);
await api(`/resolutions/${r.id}/decision`, "POST", { action: "reject", message: "Not valid", version: r.version }, 409);
const unchanged = (await api("/resolutions")).find(x => x.id === r.id);
assert.equal(unchanged.version, r.version);
r = await api(`/resolutions/${r.id}/decision`, "POST", { action: "propose_plan", message: "Would a smaller first payment help?", version: r.version, date, amount: 100 });
assert.equal(r.commitment.state, "proposed");
view = await api("/portal/respond", "POST", { token, action: "accept_proposal", message: "I agree to these terms.", version: r.version }, 200, false);
assert.equal(view.resolution.commitment.state, "accepted");
view = await api("/portal/respond", "POST", { token, action: "already_paid", message: "I believe I have paid; please verify.", version: view.resolution.version }, 200, false);
assert.equal(view.resolution.status, "verification_needed");
assert.equal(view.invoice.balance, invoice.balance);
await api("/portal/sync", "POST", { token }, 409, false);
await api("/session", "DELETE");
await api("/portal/view", "POST", { token }, 200, false);
await api("/session", "POST", { username: "Resolution QA", role: "business" });
await api(`/invoices/${invoice.id}/portal`, "DELETE");
await api("/portal/view", "POST", { token }, 404, false);
await api("/portal/respond", "POST", { token, action: "question", message: "Revoked link", version: 0 }, 404, false);
console.log("PASS: Mongo persistence, scoped portal, request/approval/proposal/acceptance, stale decision rejection, reminder pause, unverified payment claim, logout-independent access, and revocation.");
