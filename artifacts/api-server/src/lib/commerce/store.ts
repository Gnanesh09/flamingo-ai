import type { StoredEvidence } from "./image-store";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import type { CommerceState, CommerceTicket } from "@workspace/api-zod";
import { AppError, requireConfigured } from "../flamingo/errors";
import { exclusive } from "../flamingo/store";
import { products, policy, sampleOrder } from "./catalog";

export interface CommerceDocument extends CommerceState {
  evidenceFiles?: Record<string, StoredEvidence>;
  operations: Record<string, { state: "started" | "complete" | "failed"; orderId?: string; at: string }>;
  lease?: { owner: string; until: Date };
  expiresAt: Date;
}
let connection: Promise<MongoClient> | undefined;
async function collection() {
  requireConfigured(process.env.MONGODB_URI, "MongoDB");
  if (!connection) connection = new MongoClient(process.env.MONGODB_URI!, { ignoreUndefined: true, serverSelectionTimeoutMS: 7000 }).connect().catch(() => {
    connection = undefined;
    throw new AppError(503, "MongoDB could not be reached. Check Atlas network access. No local fallback was used.");
  });
  return (await connection).db("flamingo_ai").collection<CommerceDocument>("commerce_demos");
}
export function view(d: CommerceDocument): CommerceState {
  const { operations: _, lease: __, expiresAt: ___, _id: ____, evidenceFiles: _____, ...state } = d as CommerceDocument & { _id?: unknown };
  const elasticConfigured = !!(process.env.ELASTICSEARCH_URL && process.env.ELASTICSEARCH_API_KEY && process.env.ELASTICSEARCH_INFERENCE_ID);
  const active = d.policyDocuments?.find(p => p.status === "published");
  const notice = elasticConfigured
    ? active?.indexed
      ? d.retrievalNotice || "Published policy indexed in Elasticsearch."
      : active
        ? "Elasticsearch is configured, but this policy version is not indexed. Local text retrieval is active; publish a new draft to index the current version."
        : "Elasticsearch is configured. Import and publish a policy PDF to index its text; built-in rules are available now."
    : "Local text retrieval is active. Elasticsearch semantic retrieval is not connected.";
  return { ...state, products, policy: d.policy || policy, policyDocuments: d.policyDocuments || [],
    retrievalMode: d.retrievalMode || "local_text",
    retrievalNotice: notice,
    paypalConfigured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), aiConfigured: !!process.env.GROQ_API_KEY, voiceConfigured: !!process.env.DEEPGRAM_API_KEY };
}
export async function createDemo() {
  const d: CommerceDocument = {
    id: randomUUID(), organization: "KikoStore", customer: "Alex Morgan", demo: true,
    products, policy, revision: 0, orders: [sampleOrder("speaker"), sampleOrder("headphones", 1, 8), sampleOrder("watch", 1, 5)], tickets: [],
    paypalConfigured: false, aiConfigured: false, voiceConfigured: false,
    operations: {}, expiresAt: new Date(Date.now() + 7 * 86400000),
  };
  await (await collection()).insertOne(d);
  return d;
}
export async function readDemo(id: string) {
  const d = await (await collection()).findOne({ id, expiresAt: { $gt: new Date() } });
  if (!d) throw new AppError(401, "Your demo session has expired. Start a new demo.");
  return d;
}
export async function changeDemo<T>(id: string, fn: (d: CommerceDocument, save: () => Promise<void>) => Promise<T>) {
  return exclusive(`commerce:${id}`, async () => {
    const c = await collection();
    const owner = randomUUID();
    const d = await c.findOneAndUpdate({ id, expiresAt: { $gt: new Date() }, $or: [{ lease: { $exists: false } }, { "lease.until": { $lt: new Date() } }] }, { $set: { lease: { owner, until: new Date(Date.now() + 120000) } } }, { returnDocument: "after" });
    if (!d) throw new AppError(409, "This demo is busy or expired. Refresh and try again.");
    const save = async () => {
      d.revision++;
      const result = await c.replaceOne({ id, "lease.owner": owner }, d);
      if (!result.matchedCount) throw new AppError(409, "The operation lock expired. Refresh before continuing.");
    };
    try {
      const result = await fn(d, save);
      await save();
      return { result, state: view(d) };
    } finally { await c.updateOne({ id, "lease.owner": owner }, { $unset: { lease: "" } }); }
  });
}
export function message(t: CommerceTicket, role: "customer" | "agent" | "human" | "system", text: string, channel: "text" | "voice" = "text") {
  t.messages.push({ id: randomUUID(), role, text, channel, at: new Date().toISOString() });
  t.updatedAt = new Date().toISOString();
}
export function step(t: CommerceTicket, agent: string, detail: string) {
  t.steps.push({ id: randomUUID(), agent, detail, at: new Date().toISOString() });
  t.updatedAt = new Date().toISOString();
}
export function recost(t: CommerceTicket) {
  // Estimates, not invoices. Rates must be reviewed before any production launch.
  t.estimatedCost = Number((t.inputTokens * 0.075 / 1e6 + t.outputTokens * 0.30 / 1e6 + t.voiceSeconds / 60 * 0.0077 + t.speechCharacters / 1000 * 0.015).toFixed(6));
}
