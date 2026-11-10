import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { CommerceCitation, CommercePolicyDocument, CommercePolicyInput } from "@workspace/api-zod";
import { AppError } from "../flamingo/errors";
import { policy as defaults } from "./catalog";
import { message, step, type CommerceDocument } from "./store";

const INDEX = "flamingo-policy-v1";
const elasticResponse = z.object({
  error: z.object({ type: z.string().optional() }).optional(),
  errors: z.boolean().optional(),
  hits: z.object({ hits: z.array(z.object({ _source: z.object({
    documentId: z.string(), title: z.string().max(160), page: z.number().int().min(1).max(40),
    excerpt: z.string().max(800), version: z.string(),
  }) })) }).optional(),
});
export const elasticConfigured = () => !!(process.env.ELASTICSEARCH_URL && process.env.ELASTICSEARCH_API_KEY && process.env.ELASTICSEARCH_INFERENCE_ID);

async function elastic(path: string, method: string, body?: unknown) {
  const url = new URL(process.env.ELASTICSEARCH_URL!);
  if (url.protocol !== "https:" || url.username || url.password) throw new AppError(503, "Elasticsearch requires an HTTPS endpoint without embedded credentials.");
  const response = await fetch(`${url.origin}/${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(25000),
    headers: { Authorization: `ApiKey ${process.env.ELASTICSEARCH_API_KEY}`, "Content-Type": typeof body === "string" ? "application/x-ndjson" : "application/json" },
    ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  const data = elasticResponse.parse(await response.json());
  if (!response.ok && !(method === "PUT" && data?.error?.type === "resource_already_exists_exception")) {
    throw new AppError(503, `Elasticsearch could not complete policy indexing/search (HTTP ${response.status}). Check endpoint, API key permissions and inference deployment. No financial action was taken.`);
  }
  return data;
}
export function chunks(doc: CommercePolicyDocument, version: string): CommerceCitation[] {
  return doc.pages.flatMap(p => {
    const text = p.text.replace(/\s+/g, " ").trim();
    const out: CommerceCitation[] = [];
    for (let start = 0; start < text.length; start += 650) {
      out.push({ documentId: doc.id, title: doc.title, page: p.page, excerpt: text.slice(start, start + 800), version });
    }
    return out;
  });
}
async function indexDocument(d: CommerceDocument, doc: CommercePolicyDocument, version: string) {
  await elastic(INDEX, "PUT", { mappings: { properties: {
    workspace: { type: "keyword" }, documentId: { type: "keyword" }, version: { type: "keyword" },
    title: { type: "text" }, page: { type: "integer" }, excerpt: { type: "text" },
    meaning: { type: "semantic_text", inference_id: process.env.ELASTICSEARCH_INFERENCE_ID },
  } } });
  const batch = chunks(doc, version);
  // One bounded bulk request stays within the workspace lease. Never activate partial indexing.
  const lines: string[] = [];
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    const key = createHash("sha256").update(`${d.id}|${doc.id}|${version}|${i}`).digest("hex");
    lines.push(JSON.stringify({ index: { _index: INDEX, _id: key } }), JSON.stringify({ ...c, workspace: d.id, meaning: c.excerpt }));
  }
  const result = await elastic("_bulk?refresh=wait_for", "POST", lines.join("\n") + "\n");
  if (result.errors) throw new AppError(503, "Some policy passages could not be indexed. The previous policy remains active. Check Elasticsearch inference capacity before retrying.");
}
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(x => x.length > 2));
export async function retrievePolicy(d: CommerceDocument, query: string): Promise<CommerceCitation[]> {
  const builtin: CommerceCitation = { documentId: "builtin", title: d.policy.name, version: d.policy.version, page: 1,
    excerpt: `Return window: ${d.policy.returnDays} days. Automatic return limit: $${d.policy.automaticLimit}. No-return damage/defect refund limit: $${d.policy.instantRefundLimit}. Final-sale and missing-delivery requests need staff review. Other refunds require confirmed receipt.` };
  const active = d.policyDocuments?.find(p => p.status === "published");
  if (!active) return [builtin];
  if (elasticConfigured() && active.indexed) {
    try {
      const data = await elastic(`${INDEX}/_search`, "POST", {
        size: 3, _source: ["documentId", "title", "page", "excerpt", "version"],
        query: { bool: {
          filter: [{ term: { workspace: d.id } }, { term: { documentId: active.id } }, { term: { version: d.policy.version } }],
          should: [{ match: { meaning: query.slice(0, 700) } }, { match: { excerpt: query.slice(0, 700) } }], minimum_should_match: 1,
        } },
      });
      const hits = (data.hits?.hits || []).map((h: { _source: CommerceCitation }) => h._source) as CommerceCitation[];
      if (hits.length) {
        d.retrievalMode = "elastic_semantic"; d.retrievalNotice = "Elasticsearch hybrid semantic + text retrieval, scoped to this workspace and published policy version.";
        return [builtin, ...hits];
      }
    } catch {
      d.retrievalNotice = "Elasticsearch search is unavailable. Using local text retrieval; uncertain policy decisions go to staff.";
    }
  }
  d.retrievalMode = "local_text";
  const terms = words(`${query} return refund exception exclude condition eligible`);
  const ranked = chunks(active, d.policy.version).map(c => ({
    c, score: [...words(c.excerpt)].reduce((n, w) => n + (terms.has(w) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return [builtin, ...ranked.slice(0, 3).map(r => r.c)];
}
export async function updatePolicy(d: CommerceDocument, input: CommercePolicyInput, indexer = indexDocument) {
  if (input.version !== d.policy.version) throw new AppError(409, "The policy changed in another window. Refresh before saving.");
  d.policyDocuments ||= [];
  const nextVersion = `policy-${randomUUID().slice(0, 8)}`;
  if (input.action === "import") {
    if (!input.title?.trim() || !input.pages?.length) throw new AppError(400, "A title and extracted PDF pages are required.");
    if (d.policyDocuments.length >= 12) throw new AppError(409, "This demo supports up to 12 policy documents.");
    const total = input.pages.reduce((sum, p) => sum + p.text.length, 0);
    if (total > 120000 || total < 30 || new Set(input.pages.map(p => p.page)).size !== input.pages.length) throw new AppError(400, "Use unique page numbers and 30–120,000 characters of selectable policy text.");
    d.policyDocuments.unshift({ id: randomUUID(), title: input.title.trim(), status: "draft", createdAt: new Date().toISOString(), pages: input.pages, indexed: false });
    return;
  }
  if (input.action === "update_rules") {
    if (input.returnDays == null || input.automaticLimit == null || input.instantRefundLimit == null) throw new AppError(400, "All three policy limits are required.");
    if (input.instantRefundLimit > input.automaticLimit) throw new AppError(400, "The instant-refund limit cannot exceed the automatic return limit.");
    d.policy = { ...d.policy, returnDays: input.returnDays, automaticLimit: input.automaticLimit, instantRefundLimit: input.instantRefundLimit };
    const active = d.policyDocuments.find(p => p.status === "published");
    if (active) {
      // Keep the active document searchable under the new rule version without requiring re-upload.
      if (elasticConfigured()) { await indexer(d, active, nextVersion); active.indexed = true; }
      else active.indexed = false;
    }
  } else {
    const doc = d.policyDocuments.find(p => p.id === input.documentId);
    if (!doc) throw new AppError(404, "Policy document not found in this workspace.");
    if (input.action === "publish") {
      if (doc.status === "published") throw new AppError(409, "This policy is already published.");
      if (doc.status === "archived") throw new AppError(409, "Import a new draft to publish an archived document again.");
      // Index before activation. An external indexing failure leaves the prior policy active.
      if (elasticConfigured()) { await indexer(d, doc, nextVersion); doc.indexed = true; }
      else doc.indexed = false;
      for (const p of d.policyDocuments) if (p.status === "published") p.status = "archived";
      doc.status = "published";
    } else {
      if (doc.status === "archived") throw new AppError(409, "This document is already archived.");
      doc.status = "archived";
    }
  }
  d.policy.version = nextVersion;
  d.policy.text = `Returns within ${d.policy.returnDays} days of delivery (purchase date if no delivery is recorded). Automatic return authorization up to $${d.policy.automaticLimit}. Damage/defect refunds up to $${d.policy.instantRefundLimit} may be proposed without a return; customer confirmation is required. Other refunds follow staff-confirmed receipt. Final-sale, missing delivery, higher value or policy uncertainty go to staff. Published supplemental documents may restrict eligibility; they cannot raise the hard safety caps of $${defaults.automaticLimit}/$${defaults.instantRefundLimit}.`;
  d.retrievalMode = d.policyDocuments.some(p => p.status === "published" && p.indexed) ? "elastic_semantic" : "local_text";
  d.retrievalNotice = d.retrievalMode === "elastic_semantic" ? "Elasticsearch semantic indexing completed for the published policy." : "Local text retrieval is active. Elasticsearch semantic retrieval requires a configured HTTPS endpoint, API key and inference endpoint.";
  for (const t of d.tickets) {
    if (t.status !== "awaiting_confirmation") continue;
    t.status = "open"; delete t.proposedAction; t.version++;
    message(t, "system", "KikoStore updated its policy. The previous proposal has been withdrawn; send a message so Flamingo can check the current policy before you confirm.");
    step(t, "Policy version guard", `Proposal invalidated after policy change to ${nextVersion}.`);
  }
}
