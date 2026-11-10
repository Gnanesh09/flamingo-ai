import type { CommerceTicket } from "@workspace/api-zod";

export type Understanding = {
  intent: CommerceTicket["intent"];
  reason: string;
  detail: string;
  reasonChanged: boolean;
  negated: boolean;
};
/** Slot filling is additive across turns. A short answer never erases the earlier request. */
export function understand(t: CommerceTicket, input: string): Understanding {
  const text = input.toLowerCase().replace(/\brefnd\b/g, "refund").replace(/\bdiffrent\b/g, "different");
  const previous = t.reason && t.reason !== "unclear" ? t.reason : "unclear";
  let intent = t.intent === "question" ? "unknown" : t.intent;
  let reason = previous;
  let detail = t.investigation?.detail || "";
  if (/\b(refund|money back|reimburse)\b/.test(text)) intent = "refund";
  else if (/\b(return|send (it |this )?back|exchange|swap)\b/.test(text)) intent = "return";
  if (/\b(human|real person|manager|representative|talk to staff)\b/.test(text)) intent = "human";
  const negated = /\b(not|isn't|is not|no|without)\s+(broken|damaged|damage|defective)|\bundamaged\b/.test(text);
  if (/\b(different|another|wrong|change|prefer|instead|want|buy)\b.{0,45}\b(colou?r|size)\b|\b(changed my mind|don'?t need|do not need|no longer need|don'?t like|too small|too big|too large|doesn'?t fit)\b/.test(text)) reason = "changed_mind";
  if (/\b(wrong|different)\s+(item|product|order)\b/.test(text)) reason = "wrong_item";
  if (/\b(not arrived|never arrived|not delivered|never received|missing delivery|haven'?t received)\b/.test(text)) reason = "missing";
  if (!negated && /\b(broken|damaged|cracked|crack|scratched|dented|torn|toran|ripped|tore|frayed|shattered)\b|\b(a )?to run from\b/.test(text)) reason = "damaged";
  if (!negated && (/\b(defective|faulty|malfunction\w*|not working|doesn'?t work|does not work|isn'?t working|stopped working|dead battery|static|crackl\w+|distort\w*|stuck|jammed)\b/.test(text)
    || /\b(won'?t|doesn'?t|does not|can'?t|cannot|not)\s+(turn(ing)? on|charg\w*|connect\w*|pair\w*|power\w* on)\b/.test(text)
    || /\b(no|not|can'?t|cannot|unable to|not able to)\b.{0,30}\b(sound|noise|audio|volume|hear)\b/.test(text))) reason = "defective";
  if (negated && ["damaged", "defective"].includes(previous) && reason === previous) reason = "unclear";
  if (intent === "unknown" && reason === "changed_mind" && /\b(exchange|colou?r|size)\b/.test(text)) intent = "return";
  const reasonChanged = reason !== previous;
  if (reasonChanged) detail = "";
  if (reason === "changed_mind" && reasonChanged) detail = input.slice(0, 240);
  // Specific condition or a response to an investigation question, not merely the word "damaged".
  if (["damaged", "defective", "wrong_item"].includes(reason)) {
    const specific = /\b(crack|cracked|scratched|dented|torn|shattered|ear\s?cup|screen|button|left|right|packaging|box|arrived|unboxing|no sound|won'?t charge|stopped working|zip|zipper|strap|handle|stuck|side|ripped|torn)\b/.test(text);
    const answering = t.investigation?.stage === "investigating" && !reasonChanged && text.split(/\s+/).length >= 3 && !/^(it is |it'?s )?(damaged|broken|defective)[.! ]*$/.test(text);
    // A sentence that itself names the problem is enough detail; a bare "it's damaged" is not.
    const described = reasonChanged && text.split(/\s+/).length >= 5;
    if (specific || answering || described) detail = input.slice(0, 240);
  }
  return { intent, reason, detail, reasonChanged, negated };
}
