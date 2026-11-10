import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { CommerceEvidence, CommerceEvidenceInput, CommerceTicket } from "@workspace/api-zod";
import { AppError } from "../flamingo/errors";
import { saveEvidenceImage } from "./image-store";
import { message, step, type CommerceDocument } from "./store";
import { analyzeElasticImage, reserveImageBudget } from "./elastic-image";
import { assessDamage, VISION_MODEL } from "./vision";
import { products } from "./catalog";
import { notify, progress } from "./realtime";
import { runAgents } from "./agent";

export async function normalizeEvidence(encoded: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new AppError(400, "Choose a valid JPEG, PNG or WebP image.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 1_500_000) throw new AppError(413, "Image must be under 1.5 MB after resizing.");
  try {
    const pipeline = sharp(bytes, { limitInputPixels: 24000000, animated: false });
    const meta = await pipeline.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format || "")) throw new Error("format");
    return await pipeline.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch { throw new AppError(400, "The image could not be decoded. Use a JPEG, PNG or WebP under 24 megapixels."); }
}
export function evidenceTicket(d: CommerceDocument, id: string, version: number) {
  const t = d.tickets.find(t => t.id === id);
  if (!t) throw new AppError(404, "Case not found.");
  if (t.version !== version) throw new AppError(409, "This case changed. Refresh before attaching evidence.");
  if (["resolved", "rejected", "refund_pending"].includes(t.status)) throw new AppError(409, "This case cannot accept new evidence in its current state.");
  if (t.messages.length > 170 || t.steps.length > 330) throw new AppError(409, "This demo case has reached its safety limit.");
  return t;
}
export async function addEvidence(d: CommerceDocument, input: CommerceEvidenceInput, save: () => Promise<void>) {
  const t = evidenceTicket(d, input.ticketId, input.version);
  if ((t.evidence?.length || 0) >= 5) throw new AppError(400, "A case supports up to five images.");
  const image = await normalizeEvidence(input.image);
  const hash = createHash("sha256").update(image).digest("hex");
  if (t.evidence?.some(e => d.evidenceFiles?.[e.id]?.hash === hash)) throw new AppError(409, "This image is already attached to the case.");
  const id = randomUUID();
  // Private ImageKit file; clients only ever receive it through the session-checked API route.
  const stored = await saveEvidenceImage(image, `/flamingo-evidence/${createHash("sha256").update(d.id).digest("hex").slice(0, 16)}/${t.id}`, `${id}.jpg`);
  const e: CommerceEvidence = { id, name: input.name, kind: input.kind, status: "processing", createdAt: new Date().toISOString(),
    ocrText: "", observation: "", question: "", assessment: "not_assessed", notice: "Saved privately. Analysis pending." };
  (t.evidence ||= []).push(e);
  (d.evidenceFiles ||= {})[id] = { ...stored, hash, attempts: 0 };
  message(t, "customer", `Attached ${input.kind} evidence: ${input.name}.`);
  await inspectEvidence(d, t, e, image, save);
}
export async function inspectEvidence(d: CommerceDocument, t: CommerceTicket, e: CommerceEvidence, image: Buffer, save: () => Promise<void>) {
  const stored = d.evidenceFiles?.[e.id];
  if (!stored || stored.attempts >= 3) throw new AppError(429, "This image has reached its three-attempt limit. Staff can still review the original.");
  stored.attempts++;
  t.version++; e.status = "processing"; delete e.vision;
  // New evidence always invalidates an unconfirmed proposal; never change an executed payment.
  if (t.status === "awaiting_confirmation") { t.status = "open"; delete t.proposedAction; }
  step(t, "Evidence intake", "Private image saved; unconfirmed proposal withdrawn. Images and OCR are untrusted evidence, not payment authority.");
  await save(); notify(d.id, d.revision);
  try {
    const o = d.orders.find(o => o.id === t.orderId);
    const product = products.find(p => p.id === o?.productId)?.name || "the ordered item";
    const claim = t.investigation?.detail || [...t.messages].reverse().find(m => m.role === "customer" && !m.text.startsWith("Attached "))?.text || "";
    // Elastic OCR has its own metered allowance; a damage photo can still be inspected without it.
    let ocrAllowed = true;
    try { await reserveImageBudget(d.id, 1); } catch (error) { if (e.kind !== "damage") throw error; ocrAllowed = false; }
    progress(d.id, t.id, "evidence", e.kind === "damage" ? "Looking closely at your photo…" : "Reading the text in your image…");
    // OCR (Elastic Jina) and visual inspection (open-weight Qwen on Groq) run in parallel for damage photos.
    const [ocr, vision] = await Promise.allSettled([
      ocrAllowed ? analyzeElasticImage(image) : Promise.resolve(""),
      e.kind === "damage" ? assessDamage(image, product, claim, s => progress(d.id, t.id, "evidence", `Your photo is queued for inspection (about ${s}s).`)) : Promise.resolve(null),
    ]);
    if (ocr.status === "fulfilled") e.ocrText = ocr.value;
    else if (e.kind !== "damage") throw ocr.reason;
    if (vision.status === "rejected") throw vision.reason;
    if (vision.value) {
      const v = vision.value;
      e.observation = v.observation; e.question = v.question; e.assessment = v.assessment; e.vision = v.findings;
    } else {
      e.observation = "Text extracted from the uploaded image. This does not verify ownership, authenticity or payment.";
      e.question = e.ocrText ? "Which part of this relates to the problem with your order?" : "I can’t read any text in this image. Could you add a clearer close-up?";
    }
    e.status = "ready";
    e.notice = e.kind === "damage"
      ? `Visual inspection by open-weight ${VISION_MODEL}${e.ocrText ? " + Elastic Jina OCR" : ""}. Unverified: not proof of cause or eligibility.`
      : "Elastic Jina OCR. Unverified: not proof of ownership or payment.";
    const f = e.vision;
    step(t, "Evidence inspector", f
      ? `${e.name}: ${e.assessment.replaceAll("_", " ")} (${Math.round(f.confidence * 100)}% confidence, ${f.severity}${f.damageTypes.length ? `, ${f.damageTypes.join("/")}` : ""}${f.location ? ` at ${f.location}` : ""}). Subject “${f.subject}”, matches order: ${f.matchesOrder}, quality ${f.imageQuality}.${f.labelConcern ? ` Label note for staff: ${f.labelConcern}` : ""} No payment authorized.`
      : `${e.name}: OCR ${e.ocrText.length} characters. No payment authorized.`);
    const next = o && continuation(t, e);
    if (next) await runAgents(d, t, o, "", "text", { opener: next });
    else message(t, "agent", evidenceReply(e, t.status === "escalated"));
  } catch (error) {
    e.status = "failed"; e.notice = error instanceof AppError ? error.message : "The image assessment was incomplete. Staff can review the saved image; you can retry explicitly.";
    step(t, "Evidence assessment", `Analysis incomplete for ${e.name}. Original retained; no eligibility or payment change.`);
    message(t, "agent", `I saved ${e.name}, but couldn’t complete its analysis. ${e.notice}`);
  } finally {
    t.version++; await save(); notify(d.id, d.revision);
    progress(d.id, t.id, "evidence_done", "Your evidence is saved in this case.");
  }
}

/** Short, plain customer reply. Findings are described as what the photo shows, never as verification. */
export function evidenceReply(e: CommerceEvidence, escalated: boolean) {
  const f = e.vision;
  const next = escalated ? "I’ve added it to your case for the KikoStore team." : e.question || "Anything else I should know about what happened?";
  if (e.kind !== "damage") return e.ocrText ? `Got it, I can read the text on ${e.name}. ${next}` : `I saved ${e.name}, but I can’t read any text in it. ${escalated ? next : e.question}`;
  if (!f || e.assessment === "unclear") return `Thanks for the photo. I can’t make out the item’s condition clearly. ${escalated ? next : e.question || "Could you add a clearer close-up?"}`;
  if (f.matchesOrder === "no") return `Thanks. This photo seems to show ${f.subject || "something else"}, not the item on this order. ${escalated ? next : "Could you add a photo of the item itself, or just describe what’s wrong?"}`;
  if (e.assessment === "no_visible_damage") return `Thanks. In this photo I can’t see any damage on the ${f.subject || "item"}. ${escalated ? next : "Could you add a close-up of the exact spot, or describe what isn’t working?"}`;
  const kinds = f.damageTypes.filter(d => d !== "other").map(d => d.replaceAll("_", " "));
  const what = kinds.length ? kinds.join(" and ") : "damage";
  return `Thanks, I can see ${/^[aeiou]/.test(what) ? "an" : "a"} ${what}${f.location ? ` on the ${f.location}` : ""}. ${next}`;
}

/**
 * Resolution first: once a photo adds what the case was missing, move straight to the policy decision
 * instead of asking another question. Returns the opener for that combined reply, or undefined to just reply.
 * Photos only fill the reason/detail; the deterministic policy still decides and the customer still confirms.
 */
export function continuation(t: CommerceTicket, e: CommerceEvidence): string | undefined {
  const f = e.vision;
  if (t.status !== "open" || !["refund", "return", "unknown"].includes(t.intent) || e.kind !== "damage" || !f) return;
  const described = ["damaged", "defective", "wrong_item", "changed_mind", "other"].includes(t.reason) && !!t.investigation?.detail;
  const productDamage = e.assessment === "visible_damage" && f.matchesOrder !== "no" && f.damageTypes.some(d => d !== "packaging_damage");
  if (productDamage) {
    const kinds = f.damageTypes.filter(d => d !== "other" && d !== "packaging_damage").map(d => d.replaceAll("_", " "));
    const what = kinds.length ? kinds.join(" and ") : "damage";
    const seen = `${/^[aeiou]/.test(what) ? "an" : "a"} ${what}${f.location ? ` on the ${f.location}` : ""}`;
    if (!described || t.reason !== "defective") {
      t.reason = t.reason === "defective" ? "defective" : "damaged";
      t.investigation = { ...(t.investigation || { summary: "", question: "", stage: "investigating", engine: "rules" }), detail: (t.investigation?.detail || `Photo shows ${seen}.`).slice(0, 240) };
    }
    if (t.intent === "unknown") t.intent = "refund";
    return `Thanks, I can see ${seen}.`;
  }
  // A clear description already qualifies under the store's rules; an unhelpful photo shouldn't block it.
  if (described && ["refund", "return"].includes(t.intent)) return "Thanks for the photo. Your description is enough for me to go on.";
  return;
}
