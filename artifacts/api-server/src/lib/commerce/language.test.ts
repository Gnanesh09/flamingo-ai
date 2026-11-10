import test from "node:test";
import assert from "node:assert/strict";
import type { CommerceTicket } from "@workspace/api-zod";
import { runAgents, PHOTO_CUE } from "./agent";
import { policy, products, sampleOrder } from "./catalog";
import type { CommerceDocument } from "./store";
import { localizeReplies, looksNonEnglish, translationKeepsFacts } from "./language";
import { answerAside, readCustomerMessage, safeAside } from "./front-desk";

function fixture(product = "speaker") {
  const order = sampleOrder(product);
  const t: CommerceTicket = { id: "test", orderId: order.id, status: "open", intent: "unknown", reason: "",
    createdAt: "", updatedAt: "", messages: [], steps: [], version: 0, aiCalls: 0, inputTokens: 0, outputTokens: 0,
    voiceSeconds: 0, speechCharacters: 0, estimatedCost: 0, costBasis: "test", refundState: "none" };
  const d: CommerceDocument = { id: "test", organization: "test", customer: "test", demo: true, products,
    policy: { ...policy }, orders: [order], tickets: [t], revision: 0, paypalConfigured: false, voiceConfigured: false, aiConfigured: false,
    operations: {}, expiresAt: new Date() };
  return { d, t, order };
}
const model = (answer: object) => async () => ({ text: JSON.stringify(answer), cached: false, inputTokens: 10, outputTokens: 10 });
const noModel = async () => { throw new Error("no model call expected"); };

test("detects other languages cheaply, including romanized Hindi", () => {
  assert.equal(looksNonEnglish("मेरा स्पीकर टूट गया है"), true);
  assert.equal(looksNonEnglish("mera speaker kaam nahi kar raha hai"), true);
  assert.equal(looksNonEnglish("mi altavoz está roto, quiero un reembolso"), true);
  assert.equal(looksNonEnglish("mon enceinte est cassée"), true);
  assert.equal(looksNonEnglish("my speaker is broken and I want a refund"), false);
  assert.equal(looksNonEnglish("refund"), false);
});

test("greetings and clear case messages in English need no model call", async () => {
  const { t, order } = fixture();
  assert.equal((await readCustomerMessage("test", t, order, "hi there!", noModel)).topic, "greeting");
  assert.equal((await readCustomerMessage("test", t, order, "the speaker is cracked", noModel)).topic, "case");
  assert.equal((await readCustomerMessage("test", t, order, "Okay, thanks", noModel)).topic, "case");
  assert.equal(t.aiCalls, 0);
});

test("an off-topic message gets a short answer and is steered back without touching the case", async () => {
  const { t, order } = fixture();
  t.status = "open"; t.intent = "refund"; t.reason = "damaged";
  t.investigation = { summary: "", detail: "", question: "What damage can you see?", stage: "investigating", engine: "rules" };
  const r = await readCustomerMessage("test", t, order, "what's the weather like in Delhi today", model({
    language: "en", languageName: "English", script: "latin", english: "what's the weather like in Delhi today",
    topic: "off_topic", reply: "I can’t check the weather, but I’m here to help with your speaker order." }));
  assert.equal(r.topic, "off_topic");
  answerAside(t, order, r, "text");
  assert.match(t.messages.at(-1)!.text, /weather.*What damage can you see\?/);
  assert.equal(t.status, "open"); assert.equal(t.intent, "refund"); assert.equal(t.reason, "damaged");
  assert.equal(t.proposedAction, undefined); assert.equal(t.refundState, "none");
});

test("an aside that mentions money or approval is replaced by a safe template", () => {
  assert.doesNotMatch(safeAside("smalltalk", "Sure, I’ll refund you $39 right away."), /\$|refund you/);
  assert.match(safeAside("unclear", "asdf"), /didn’t quite catch/);
});

test("rules beat the classifier: a translated fault is always treated as the case", async () => {
  const { t, order } = fixture();
  const r = await readCustomerMessage("test", t, order, "mera speaker toot gaya hai", model({
    language: "hi", languageName: "Hindi", script: "latin", english: "my speaker is broken", topic: "smalltalk", reply: "Nice!" }));
  assert.equal(r.topic, "case"); assert.equal(r.english, "my speaker is broken");
  assert.equal(t.language, "hi"); assert.equal(t.languageScript, "latin");
});

test("a Hindi request is decided in English and answered in Hindi, with facts verified", async () => {
  const { d, t, order } = fixture();
  const r = await readCustomerMessage("test", t, order, "मेरा स्पीकर काम नहीं कर रहा, आवाज़ नहीं आती, रिफंड चाहिए", model({
    language: "hi", languageName: "Hindi", script: "native", english: "My speaker is not working, there is no sound, I want a refund", topic: "case", reply: "" }));
  t.messages.push({ id: "c1", role: "customer", text: "मेरा स्पीकर काम नहीं कर रहा", channel: "text", at: "" });
  const from = t.messages.length;
  await runAgents(d, t, order, r.english, "text");
  assert.equal(t.intent, "refund"); assert.equal(t.reason, "defective");
  const english = t.messages.at(-1)!.text;
  assert.ok(english.includes(PHOTO_CUE));
  await localizeReplies("test", t, from, model({ translations: ["क्या आप समस्या दिखाते हुए स्पीकर की फ़ोटो जोड़ सकते हैं? Photos पर टैप करें।"] }));
  assert.match(t.messages.at(-1)!.text, /फ़ोटो/);
  // The photo request is remembered even though the visible text is now Hindi: no second request.
  await runAgents(d, t, order, "I can't take a photo", "text");
  assert.equal(t.status, "awaiting_confirmation"); assert.equal(t.proposedAction, "refund");
  const before = t.messages.at(-1)!.text;
  // A translation that changes the amount is rejected and the English decision is kept.
  await localizeReplies("test", t, t.messages.length - 1, model({ translations: ["आपका $93.00 रिफंड स्वीकृत है। Confirm refund दबाएँ।"] }));
  assert.equal(t.messages.at(-1)!.text, before);
  assert.match(t.steps.at(-1)!.detail, /kept 1 in English/);
});

test("translation checks keep numbers, codes and button names", () => {
  assert.equal(translationKeepsFacts("Your $39.00 refund is approved. Tap Confirm refund.", "Tu reembolso de $39,00 está aprobado. Toca Confirm refund."), true);
  assert.equal(translationKeepsFacts("Your $39.00 refund is approved. Tap Confirm refund.", "Tu reembolso de $39,00 está aprobado. Toca Confirmar."), false);
  assert.equal(translationKeepsFacts("Return request created: KR-1A2B3C4D.", "Solicitud creada: KR-1A2B3C4X."), false);
});

test("English conversations are never translated", async () => {
  const { t } = fixture();
  t.messages.push({ id: "a", role: "agent", text: "Hello", channel: "text", at: "" });
  await localizeReplies("test", t, 0, noModel);
  assert.equal(t.messages[0].text, "Hello");
});
