import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import { CommerceActionBody, CommerceSpeakBody, CommerceTranscribeBody, UpdateCommercePolicyBody, AddCommerceEvidenceBody, RetryCommerceEvidenceBody } from "@workspace/api-zod";
import { addEvidence, evidenceTicket, inspectEvidence } from "../lib/commerce/evidence";
import { readEvidenceImage } from "../lib/commerce/image-store";
import { AppError, requireConfigured } from "../lib/flamingo/errors";
import { createDemo, readDemo, view, changeDemo, recost, step } from "../lib/commerce/store";
import { cookieName, notify } from "../lib/commerce/realtime";
import { act } from "../lib/commerce/actions";
import { speak, transcribe } from "../lib/flamingo/voice";
import { updatePolicy } from "../lib/commerce/policy-library";

const router: IRouter = Router();
const demoLimit = rateLimit({ windowMs: 3600000, limit: 20, message: { error: "Too many new demos. Please reuse your existing demo." } });
function session(req: Request) {
  const id = req.signedCookies?.[cookieName];
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new AppError(401, "Start the KikoStore demo first.");
  return id;
}
router.get("/commerce/widget.js", (_req, res) => {
  res.type("application/javascript").send(`/* Flamingo same-origin demo adapter. No provider keys in the browser. */
window.Flamingo = Object.freeze({
  open: function(options) {
    if (!options || !/^[a-f0-9-]{36}$/.test(options.orderId)) throw new Error("A KikoStore order ID is required");
    window.open("/flamingo-support?order=" + encodeURIComponent(options.orderId), "_blank", "noopener");
  }
});`);
});
router.post("/commerce/demo", demoLimit, async (req, res) => {
  requireConfigured(process.env.SESSION_SECRET, "Session signing");
  let d;
  if (req.signedCookies?.[cookieName]) {
    try { d = await readDemo(session(req)); }
    catch (error) { if (!(error instanceof AppError && error.status === 401)) throw error; }
  }
  d ||= await createDemo();
  res.cookie(cookieName, d.id, { signed: true, httpOnly: true, sameSite: "lax", secure: req.secure || req.get("x-forwarded-proto") === "https", maxAge: 7 * 86400000, path: "/" });
  res.json(view(d));
});
router.get("/commerce/state", async (req, res) => res.json(view(await readDemo(session(req)))));
router.post("/commerce/policy", async (req, res) => {
  const id = session(req);
  const body = UpdateCommercePolicyBody.parse(req.body);
  // Same isolated demo-controller authority as the existing staff portal, not production RBAC.
  const result = await changeDemo(id, async d => updatePolicy(d, body));
  notify(id, result.state.revision);
  res.json(result.state);
});
router.post("/commerce/action", async (req, res) => {
  const id = session(req);
  const body = CommerceActionBody.parse(req.body);
  // Host is supplied by the reverse proxy, never accepted from the request body.
  const host = req.get("host");
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) throw new AppError(400, "Invalid host.");
  const origin = `${req.secure || req.get("x-forwarded-proto") === "https" ? "https" : "http"}://${host}`;
  try {
    const result = await changeDemo(id, (d, save) => act(d, body, origin, save));
    res.json({ state: result.state, ...result.result });
  } finally { notify(id); }
});
router.post("/commerce/voice/transcribe", async (req, res) => {
  const id = session(req), body = CommerceTranscribeBody.parse(req.body);
  const result = await changeDemo(id, async d => {
    const t = d.tickets.find(t => t.id === body.ticketId);
    if (!t) throw new AppError(404, "Ticket not found.");
    if (["resolved", "rejected"].includes(t.status)) throw new AppError(409, "Reopen this ticket before recording.");
    const transcript = await transcribe(body.audio, body.mimeType);
    t.voiceSeconds += body.seconds; recost(t);
    step(t, "Voice transcription", "Deepgram transcribed a recorded turn. Audio was not stored; the customer message is submitted separately.");
    return transcript;
  });
  notify(id, result.state.revision); res.json(result.result);
});
router.post("/commerce/voice/speak", async (req, res) => {
  const id = session(req), body = CommerceSpeakBody.parse(req.body);
  const result = await changeDemo(id, async d => {
    const t = d.tickets.find(t => t.id === body.ticketId);
    const m = t?.messages.find(m => m.id === body.messageId && ["agent", "human", "system"].includes(m.role));
    if (!t || !m) throw new AppError(404, "Spoken message not found.");
    const audio = await speak(m.text.slice(0, 1800));
    t.speechCharacters += m.text.slice(0, 1800).length; recost(t);
    return audio;
  });
  notify(id, result.state.revision); res.json(result.result);
});
router.post("/commerce/evidence", async (req, res) => {
  const id = session(req), body = AddCommerceEvidenceBody.parse(req.body);
  const result = await changeDemo(id, async (d, save) => { await addEvidence(d, body, save); });
  notify(id, result.state.revision); res.json(result.state);
});
router.post("/commerce/evidence/retry", async (req, res) => {
  const id = session(req), body = RetryCommerceEvidenceBody.parse(req.body);
  const result = await changeDemo(id, async (d, save) => {
    const t = evidenceTicket(d, body.ticketId, body.version);
    const e = t.evidence?.find(e => e.id === body.evidenceId), file = d.evidenceFiles?.[body.evidenceId];
    if (!e || !file) throw new AppError(404, "Evidence not found.");
    if (e.status === "ready") throw new AppError(409, "This image is already analyzed.");
    const bytes = await readEvidenceImage(file);
    await inspectEvidence(d, t, e, bytes, save);
  });
  notify(id, result.state.revision); res.json(result.state);
});
router.get("/commerce/evidence/:ticketId/:evidenceId", async (req, res) => {
  const d = await readDemo(session(req));
  const t = d.tickets.find(t => t.id === req.params.ticketId);
  const e = t?.evidence?.find(e => e.id === req.params.evidenceId), file = e && d.evidenceFiles?.[e.id];
  if (!file) throw new AppError(404, "Evidence not found in this session.");
  const bytes = await readEvidenceImage(file);
  res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(bytes);
});
let thinkingCue: Promise<{ audio: string; mimeType: string }> | undefined;
router.get("/commerce/voice/cue", async (req, res) => {
  await readDemo(session(req));
  thinkingCue ||= speak("Thanks. Let me take a look at that.").catch(error => { thinkingCue = undefined; throw error; });
  res.json(await thinkingCue);
});
export default router;
