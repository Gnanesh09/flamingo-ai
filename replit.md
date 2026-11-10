# Flamingo AI

A KikoStore-integrated ecommerce returns and refunds assistant, built for the PayPal + AI hackathon. The prior receivables app is retained on its old routes and on main.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (use the managed workflow's PORT)
- `pnpm --filter @workspace/flamingo run dev` — run Next.js (use the managed workflow's PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- See README.md for secure setup. Uses MONGODB_URI, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, GROQ_API_KEY, DEEPGRAM_API_KEY and SESSION_SECRET; never print credentials.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Frontend: Next.js App Router, Tailwind, Rubik
- DB: MongoDB Atlas; explicitly labeled local demo storage only when no MongoDB URI is configured
- Agent: LangGraph with Groq; voice: Deepgram
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

See README.md for repo layout and docs/HACKATHON.md for submission requirements.

## Architecture decisions

- The user pivoted the product to an ecommerce plugin: KikoStore purchases → Flamingo text/voice support → real-time organization staff escalation and operational oversight.
- Build the pivot on feature/kikostore-flamingo-returns; preserve the prior receivables work.
- KikoStore is a fictional Amazon-inspired demo storefront, with original branding, not an Amazon impersonation.
- Current commerce sessions are explicitly isolated demo-controller sessions with both customer and staff views. They are not production customer/staff identity or organization RBAC.
- Username/role entry is deliberately a sandbox demo, not production authentication. Do not represent it as secure business identity.
- User explicitly chose Next.js, Tailwind, Rubik, MongoDB, LangGraph, Groq, Deepgram, PayPal Sandbox and Elasticsearch for policy retrieval. Staff must be able to import and publish policy PDFs. Do not replace these with starter defaults.
- PayPal connector authorization failed; the app uses direct REST client credentials instead.
- Never silently fall back to local storage if a configured MongoDB connection fails.

## Product

KikoStore catalog and purchases, order-linked text/voice support, policy-checked LangGraph agents, customer-confirmed automatic requests, human escalation over WebSockets, return tracking, PayPal Sandbox capture/refund verification and estimated per-case provider usage. External actions are Sandbox-only.

## User preferences

Light flamingo pink/coral identity and Rubik typography. The user requested Google and Uber design inspiration: clear actions, easy navigation, and an approachable real-world product rather than a decorative AI dashboard. Protect free-tier AI usage; never promise guaranteed zero cost.

Customers must be able to upload 1–5 evidence images inside an active call without ending it. The user wants live WebSocket transcription and conversational progress acknowledgments while agents investigate. Use Elastic OCR for image text; never equate OCR with proof of product damage. The user chose ImageKit for evidence image storage (private files, fetched server-side with short-lived signed URLs; never expose ImageKit URLs to browsers).
The user does not want paid closed models (ChatGPT/Claude). Damage photos use the open-weight Qwen vision model on Groq's free tier; agent replies stream token by token over the WebSocket, with decisions and amounts kept deterministic. Staff portal tables use AG Grid Community (hackathon prize). Flamingo's primary goal is to resolve and approve the return/refund itself within policy; staff handoff is only for hard policy limits. The user wants a low-text, Google-like professional UI in Rubik: short summaries first, detail on tap/click.

## Gotchas

- PayPal's current reminder endpoint ignores custom text; display that limitation and log standard-notification acceptance, not personalized delivery.
- PayPal allows only two reminder calls/day. Ambiguous external outcomes must not be retried automatically.
- Build hooks from OpenAPI before using changed contracts. Orval is pinned to React Query v5 types; client TypeScript needs dom.iterable.
- Local demo data/quota files are not durable across published instances. Keep this sandbox single-instance until quotas and demo sessions are hardened.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
