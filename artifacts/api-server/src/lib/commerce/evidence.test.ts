import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeEvidence } from "./evidence";
import { elasticDelta } from "./elastic-image";

test("evidence images are decoded, resized and normalized rather than trusting MIME or extension", async () => {
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#f0a090" } }).png().toBuffer();
  const output = await normalizeEvidence(input.toString("base64"));
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "jpeg"); assert.equal(meta.width, 1600); assert.equal(meta.exif, undefined);
});
test("SVG, malformed base64 and oversized uploads are rejected", async () => {
  await assert.rejects(normalizeEvidence(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').toString("base64")), /could not be decoded/);
  await assert.rejects(normalizeEvidence("data:image/png;base64,anything"), /valid JPEG/);
  await assert.rejects(normalizeEvidence(Buffer.alloc(1_500_001).toString("base64")), /under 1.5 MB/);
});
test("Elastic stream accepts text deltas and never mistakes an error for extracted content", () => {
  assert.equal(elasticDelta({ choices: [{ delta: { content: "Receipt" } }] }), "Receipt");
  assert.equal(elasticDelta({ choices: [{ delta: { role: "assistant" } }] }), "");
  assert.throws(() => elasticDelta({ error: { message: "forbidden" } }), /returned an error/);
});
test("ImageKit private URLs are short-lived HMAC signatures over path and expiry", async () => {
  const { signedImageKitUrl } = await import("./image-store");
  const url = new URL(signedImageKitUrl("/flamingo-evidence/a/b.jpg", "https://ik.imagekit.io/demo", "private_test", 1_700_000_000_000));
  assert.equal(url.pathname, "/demo/flamingo-evidence/a/b.jpg");
  assert.equal(url.searchParams.get("ik-t"), "1700000060");
  const { createHmac } = await import("node:crypto");
  assert.equal(url.searchParams.get("ik-s"), createHmac("sha1", "private_test").update("flamingo-evidence/a/b.jpg1700000060").digest("hex"));
});

test("a photo showing product damage moves an open refund case to a decision; mismatched photos never block a description", async () => {
  const { continuation } = await import("./evidence");
  const vision = { model: "m", subject: "speaker driver", matchesOrder: "yes" as const, labelConcern: "", imageQuality: "good" as const, damageTypes: ["tear" as const], location: "speaker cone", severity: "moderate" as const, confidence: 0.9 };
  const t = { status: "open", intent: "refund", reason: "unclear", investigation: undefined } as any;
  const e = { kind: "damage", assessment: "visible_damage", vision } as any;
  assert.match(continuation(t, e)!, /tear on the speaker cone/);
  assert.equal(t.reason, "damaged"); assert.ok(t.investigation.detail);
  const described = { status: "open", intent: "refund", reason: "defective", investigation: { detail: "no sound" } } as any;
  assert.match(continuation(described, { kind: "damage", assessment: "unclear", vision: { ...vision, matchesOrder: "no" } } as any)!, /description is enough/);
  assert.equal(continuation({ ...described, status: "escalated" }, e), undefined);
  assert.equal(continuation({ status: "open", intent: "refund", reason: "unclear" } as any, { kind: "damage", assessment: "unclear", vision } as any), undefined);
});
