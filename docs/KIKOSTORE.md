# KikoStore × Flamingo AI

## What this branch demonstrates

An ecommerce support plugin that starts from the customer's actual purchase, understands a return/refund request, applies a published store policy, and either proposes a safe resolution or hands the entire case to a person. This is a **hackathon demo**, not a production retail or identity system.

- `/kikostore`: original KikoStore-branded, Amazon-inspired catalog, search, categories and single-product purchases with quantity.
- `/kikostore/orders`: purchase history, Sandbox capture confirmation, and an order-linked support entry.
- `/flamingo-support`: conversation history, text or browser call, customer confirmation, case status and return reference.
- `/flamingo-portal`: organization staff queue, human replies/decisions, warehouse receipt confirmation, audit steps, estimated costs and policy/integration reference.
- `/api/commerce/widget.js`: small same-origin demo adapter exporting `Flamingo.open({ orderId })`.

The older receivables implementation remains at `/start` and `/app`. The new work is on `feature/kikostore-flamingo-returns`; main was not replaced.

## Two-minute demo

1. Open KikoStore and select **Open my demo store**. This creates an isolated MongoDB workspace with three sample purchases.
2. Visit **Orders**. Select the Pebble speaker's **Return or refund**, then **Type it**.
3. Send: **The speaker arrived with a cracked case and I want a refund.** If you only say “damaged,” Flamingo first asks for a brief description.
4. Read the proposed $39 sample refund and confirm. The case closes with an explicit **simulated refund—no money moved** entry.
5. Open the headphones order. Send: **I changed my mind and want to return this.** Confirm the return.
6. In a second tab of the same browser, open the **Staff** view. Select that case, enter an explanation and confirm **Warehouse received it**. Watch the customer tab update via WebSocket.
7. Use the $149 watch to demonstrate a high-value case that requires human review.
8. Open **Costs and usage** and the case's actual agent trace. Clear explicit requests use rules to save tokens; ambiguous requests use Groq.

## PayPal Sandbox payment and refund demo

1. Open a product and explicitly choose **PayPal Sandbox**, not sample order.
2. Approve checkout with a **Sandbox buyer account** distinct from the merchant app's account. Never use live credentials.
3. Return to KikoStore and select **Confirm capture**. The server retrieves the bound PayPal order and verifies its identity, USD amount and completed capture.
4. Start support from the paid order. A damaged $39 speaker can qualify for an instant full refund after customer confirmation. Other eligible items use return authorization and staff-confirmed receipt.
5. The refund is submitted against the server-stored original capture. A completed PayPal result closes the case. A pending or uncertain result leaves it open; use **Sync with PayPal** to reconcile.

Flamingo never accepts a capture ID, price or refund amount supplied by the browser. Purchase IDs and financial-operation journals are persisted before outbound money requests. MongoDB leases serialize mutations; deterministic PayPal request IDs and operation journals prevent duplicate submissions. Uncertain captures/refunds are not silently retried. Refunds are full original-payment refunds only, with no payout to a different account.

**Verified in this workspace:** Sandbox checkout creation and rejection of unapproved capture. **Not exercised with a buyer:** actual checkout approval → capture → real Sandbox refund. Do not describe that entire external flow as tested.

## Policy and agent execution

LangGraph executes order verification → policy retrieval → context-aware interpretation → investigation → deterministic policy checks and response → next-step tracking. The trace reflects executed nodes, not fabricated model reasoning. Follow-up replies fill remembered intent and reason rather than replacing the whole request. Damage/fault claims get a targeted question before a proposal when no specific condition has been stated. Groq handles ambiguity and assesses supplemental policy; it cannot call payment APIs or change policy. Customer and document text are untrusted input.

Policy interpretation evaluates the next proposed step: future customer confirmation and warehouse receipt do not prevent proposing an eligible return. Small published policies are supplied in full; longer policies use complete retrieved chunks within the token guard. Collecting a missing reason or basic damage detail does not spend a model call. A failed AI check leaves the case open with an explicit retry message rather than inventing a policy restriction; genuine uncertain/restrictive policy assessments still go to staff. Refund-timing questions and thanks are answered without changing the pending decision. A legacy technical-failure handoff can be retried by saying “Check the policy again,” but not after a staff response or an explicit human handoff.

Policy:
- 30 days from delivery (or purchase date for unshipped Sandbox demo orders).
- Returnable purchases up to $100 may be authorized automatically after customer confirmation.
- Reported damage/defect up to $50 may qualify for a no-return refund after confirmation.
- High value, expired window, final-sale, missing delivery and human requests escalate.
- Return authorization is not warehouse receipt and not a refund.
- Staff decisions require explanations. A closed or declined case can be reopened without erasing previous financial records.

The demo is a single fictional organization per isolated session, not a general multi-merchant provisioning system.

### Staff policy library

The staff **Policy and integrations** tab supports browser-side PDF text extraction, page-by-page preview, saved drafts, explicit publication, and archival. Only extracted text and metadata go to MongoDB; original PDF bytes are not uploaded or retained. Text PDFs only: 5 MB, 40 pages, 12,000 characters per page, 120,000 characters total. Scanned documents need OCR outside this demo.

One supplemental document is published at a time. Publishing a replacement archives the previous document. Staff can separately edit the return window and automatic thresholds within server-enforced caps. Changing active rules/documents creates a new policy version and withdraws outstanding automatic proposals; historical citations remain. Confirmation rechecks the version and current order eligibility. Drafts never affect decisions.

Retrieved excerpts include title, page and version. Built-in rules govern financial authorization; supplemental documents can restrict eligibility, not bypass payment checks or raise the hard $100/$50 caps. Uncertain or restrictive supplemental-policy matches go to staff. Retrieval is local text ranking unless Elasticsearch is configured and indexing succeeds. It is never labeled vector search when local text ranking is used.

Optional Elasticsearch setup: provide `ELASTICSEARCH_URL` (HTTPS origin), `ELASTICSEARCH_API_KEY`, and `ELASTICSEARCH_INFERENCE_ID` through Secrets. Use a deployed Elasticsearch `semantic_text`-compatible inference endpoint and permissions to create/index/search `flamingo-policy-v1`. Publishing indexes page chunks using a bounded bulk request. Search combines semantic and text matching with workspace/document/version filters. Failed indexing leaves the old policy active; failed search is explicitly labeled local-text fallback and uncertain cases require staff. Rule edits re-index the current published document under the new version, without requiring a PDF re-upload. Elasticsearch and inference capacity may incur charges; these are not included in the displayed Groq/Deepgram estimate. Production needs explicit indexed-document retention and deletion. The configured cluster has passed a real index-and-semantic-retrieval check; replacing credentials or inference endpoints requires re-verification.

## Realtime and voice

The authenticated WebSocket `/api/commerce/ws` sends invalidations; MongoDB-backed HTTP state remains authoritative. Clients reconnect with backoff and reload state after reconnection. Both tabs must use the **same browser session** for the demo.

Voice uses browser microphone consent and streams MediaRecorder chunks over an authenticated WebSocket to Deepgram. The call displays interim captions while the customer speaks; final transcripts enter the same persisted ticket message pipeline. The microphone closes each recording turn after a short silence, or when **Done speaking** is pressed. Saved replies use Deepgram speech synthesis. A cached, fixed acknowledgment may play while a slow request is actually running; it never claims approval. Server-pushed progress identifies policy/evidence work. Empty transcripts, connection and playback failures remain visible. Hangup releases microphone/audio/socket resources; unsent transcripts can be recovered into text. Transcription is streamed, but conversation remains turn-based: no interrupting the agent mid-sentence, PSTN calls, or guaranteed zero latency. Audio is transient and is not stored in MongoDB.

### Evidence during calls

Customers can attach 1–5 JPEG/PNG/WebP images per case, in text or from the call’s Photos drawer without hanging up. Sending waits for the current speech stream to finalize, pauses recording during upload/review, then resumes the call. Closing the drawer cannot interrupt an in-flight batch. The server decodes and normalizes images, strips metadata, caps dimensions/size, rejects duplicates, and uploads originals to ImageKit as private files. The API fetches them with 60-second signed URLs and serves them only through the session-checked route; no public ImageKit URL reaches the browser. Older demo images remain readable from App Storage. MongoDB stores only metadata and analysis, not image bytes. Image serving requires the same signed demo session and ticket ownership; this remains demo-session authority, not production customer/staff RBAC.

Elastic Jina OCR reads visible text from receipts, labels and photos. Damage photos are additionally inspected by an open-weight vision model (Qwen `qwen/qwen3.8-27b`, served on Groq's free tier; Elastic's hosted chat vision returned HTTP 403 for this account, and paid closed models are out of scope). It returns structured findings: whether the item type matches the order, image quality, damage types, location, severity and a confidence score. Deterministic post-rules force `unclear` for poor-quality or low-confidence (<0.6) photos, flag packaging-only damage, and ask for a photo of the ordered item when it doesn't match. Visible brand/label mismatches are recorded for staff only. Off-the-shelf detectors such as YOLO/COCO were rejected: they recognize object classes, not damage, and would need a custom labeled dataset. On six synthetic test photos (cracked, intact, crushed box, scratched/dented, dark/blurry, wrong product) all findings matched expectations; this is a small sanity check, not an accuracy guarantee. Each photo costs ≈2.4K tokens of a ≈7K-per-minute free limit, so inspections are paced server-side (about two per minute) and the customer sees a queued message instead of an error. OCR is not damage detection, and image observations do not establish authenticity, ownership, cause, payment or refund eligibility. Customers and staff see the original, extracted text, observations/questions and explicit errors. New evidence invalidates an unconfirmed proposal; it never moves money. Partial OCR survives a visual-model failure. Retrying is explicit, with at most three attempts per image.

**Provider access:** a real Jina OCR request succeeded. The configured visual endpoint is listed by Elastic but its completion requests currently return HTTP 403. Automatic visual damage assessment is therefore blocked pending account/model access; saved photos remain available for staff review. Do not present this as successful visual verification.

Image analysis is separately metered by Elastic, excluded from the displayed Groq/Deepgram cost estimate, and bounded to 40 provider calls globally and 12 per demo workspace per UTC day. Damage assessment reserves two calls. ImageKit files currently have no automated expiry/deletion job; add retention enforcement before using real customer evidence.

## Costs and quotas

Per-ticket totals show observed Groq usage tokens, recorded audio duration and spoken character count. Dollar amounts are **estimates, not actual provider invoices**. The UI exposes the rate assumptions. Free credits are not guaranteed, and failed provider requests can incur charges not reflected in successful-response usage.

Agent replies stream token by token over the session WebSocket (`reply_start`/`reply_delta`/`reply_reset`/`reply_end`). Decisions, amounts and outcomes stay deterministic: the open-weight writer model only phrases the conversational opener or clarifying question, the exact outcome sentence is appended verbatim, and a lookahead guard holds back the last 64 characters so money, approval, policy, logistics or link phrases are never shown; any violation, timeout or busy budget resets the stream to the exact template. The saved message remains the record. Groq quota protections: a per-model sliding token window (Groq limits are per model), daily caps, cache, Groq retry-after blocking, and no automatic provider retries; Deepgram daily and per-minute limits. These provider quota counters use the original local single-instance ledger. Production needs durable distributed quota accounting.

## Setup

Use workspace Secrets for `MONGODB_URI`, `SESSION_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`. PayPal credentials must be Sandbox credentials. Only the optional Elasticsearch connection requires the additional settings above. Never log or commit values.

MongoDB stores commerce workspaces in a separate collection, leaving receivables data intact. Configured MongoDB failures do not switch to local storage. Demo sessions expire after seven days; records are not automatically erased by a TTL index.

Managed workflows:
- `artifacts/api-server: API Server`
- `artifacts/flamingo: web`

```sh
pnpm run typecheck
pnpm --filter @workspace/flamingo run build
pnpm --filter @workspace/api-spec run codegen
node artifacts/api-server/check-commerce-flow.mjs
# Optional real provider checks: no checkout approval or money capture.
node artifacts/api-server/check-commerce-flow.mjs --ai --voice --paypal-checkout
# Context, policy versioning and independent Mongo reload regression:
node artifacts/api-server/check-support-regression.mjs
# Optional one Groq call and real Deepgram speech/transcription:
node artifacts/api-server/check-support-regression.mjs --ai --voice
```

## Required before production

- Verified customer and staff authentication, server-enforced organization membership/roles and secure session lifecycle. **Current demo cookie deliberately authorizes the demo operator to exercise both views; selecting Staff is not production authentication.**
- A signed merchant-to-Flamingo handoff and merchant installation credentials. The current widget is a same-origin demonstration, not a secure cross-domain production SDK.
- PayPal webhook verification and durable payment reconciliation workers, plus reconciliation tooling for ambiguous outbound outcomes.
- Actual shipping/return-label/carrier integrations and warehouse evidence. This demo does not sell or ship real inventory.
- Durable provider quota/cost ledger, model-rate configuration, retention/privacy controls, abuse controls and production security review.
- Live PayPal merchant onboarding and explicit live-mode authorization. This implementation intentionally has no live-money switch.
