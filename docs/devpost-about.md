# Flamingo AI: support that resolves, not just responds

## Inspiration

A customer's Bluetooth speaker arrives with a torn cone. Today, they write to support, explain the problem, upload photos, wait days for someone to review it, and then follow up to get their money back.

On the other side, the store's support team repeats the same five steps hundreds of times a week: find the order, read the policy, look at the photo, make a decision, issue the refund.

That isn't really a conversation. It's a **decision process** wearing a chat window. Chatbots can answer questions, but somebody still has to close the case.

So I asked one question:

_Can an AI agent own a return or refund from the first message to the money moving, and still be safe enough that a business would trust it with its money?_

Flamingo AI is my answer.

## What it does

Flamingo is an AI resolution agent for online stores, built for **returns and refunds**. The demo includes a working store (KikoStore), the Flamingo support agent, and a staff portal.

**A real case from testing:** a customer calls and says the speaker "has no sound", then sends a close-up of the torn speaker cone. Within a couple of messages, Flamingo:

- verifies the order,
- checks it against the store's policy,
- inspects the photo,
- approves a **$39 refund (the customer keeps the item)**.

The customer taps **Confirm**, and the refund goes through PayPal Sandbox. No ticket, no waiting, no staff time.

- **Text or live voice:** customers type, or talk to Flamingo with real-time speech-to-text and spoken replies.
- **Knows the order:** product, price, delivery date and payment status are already loaded, so the customer never repeats them.
- **Investigates like a good agent:**
  - It works out the problem: damaged, faulty, wrong item, changed mind, or never arrived.
  - It asks one focused question when something is unclear and never asks the same one twice.
  - It requests a photo once for damage claims.
- **Checks the photo:** vision AI identifies the damage, where it is, and whether the item matches the order. Text in images is read with OCR.
- **Decides within policy, by itself:**

| Situation | Outcome |
|---|---|
| Damaged or faulty, up to $50 | Instant refund, customer keeps the item |
| Other eligible requests, up to $100 | Return approved; refund once the item is received |
| Over $100, final sale, past 30 days, parcel never arrived, or "I want a person" | Handed to staff with the full story |

- **Customer stays in control:** nothing is paid until the customer confirms, and eligibility is checked again at that moment.
- **Staff portal:**
  - a live case queue showing each case's evidence, the AI's reasoning, and the policy passages it relied on;
  - staff overrides that require a written reason;
  - a policy editor with versioning and PDF policy upload;
  - the **AI cost of every case**.

## How I built it

Flamingo is built as an agent workflow, not a chatbot with tools attached. Every customer message runs through a LangGraph pipeline:

**Verify order → Retrieve policy → Understand → Investigate → Decide → Write reply → Log**

| Layer | Technology |
|---|---|
| Agent orchestration | LangGraph |
| Language understanding | Open-weight models on Groq (GPT-OSS, Qwen) |
| Photo inspection | Open-weight vision model on Groq |
| Policy search and OCR | Elasticsearch hybrid search, Jina OCR |
| Voice | Deepgram streaming speech-to-text and Aura-2 text-to-speech |
| Data | MongoDB |
| Evidence storage | ImageKit (private) |
| Payments | PayPal Developer Platform (Sandbox checkout and refunds) |
| Frontend | Next.js, AG Grid staff portal |

### The key design decision: the model talks, the code decides

An LLM should understand a frustrated customer. It should never decide how much money leaves the business. Flamingo enforces that structurally, not with prompts:

- **Money decisions are deterministic code.** The policy engine makes every approval; the model has no payment tools.
- **Model output is constrained.** Interpretations must be valid structured JSON, and any "detail" the model extracts must appear word for word in what the customer actually said.
- **The AI writes only the greeting.** The amount, the approval and the next step are added word for word by code, so the model can't promise a refund that wasn't approved.
- **Uploaded policies can only tighten the rules.** A policy PDF can add conditions, but it can never raise a payment limit.
- **Stale approvals are cancelled.** Changing the policy cancels pending proposals, and every approval is checked again at confirmation.
- **Refunds are a guarded state machine** (proposed → confirmed → pending → refunded), with protection against duplicate payments.

It is also **cheap to run**. Clear requests are resolved by rules with zero model calls, models are only used when language is ambiguous, and every case shows its exact AI cost.

## Challenges I ran into

The hard part wasn't making an AI talk. It was making it **finish the job without crossing a line**. Every challenge below came from a real test conversation.

**1. Speech is not text.** Voice transcription turned "torn" into "Toran" and "a to run from one side". The agent kept asking "what's the reason?" while the customer was clearly describing damage. I added domain-aware interpretation for misheard speech and a rule that the agent never repeats a question. After a few replies, it moves forward with a standard return.

**2. Being too cautious is also a failure.** Early versions handed cases to staff whenever anything was vague. Customers got "I've passed this to the team", again and again. I rebuilt Flamingo around a **resolution-first** principle: the agent resolves everything the policy allows, and staff only see cases the rules actually require.

**3. "I don't know" is not "no".** A clear $39 damage case was escalated because a photo-only message skipped the policy check, and the system read the missing answer as a restriction. The fix taught me the most important lesson of the project: an agent must tell apart _not allowed_, _not sure_ and _technical failure_, and only the first should block a customer.

**4. Photos are evidence, not proof.** The vision model first rejected a close-up of a speaker driver as "the wrong item". Flamingo now accepts close-ups of parts, uses a damage photo to move the case forward, and never lets an unhelpful photo block a valid description.

**5. Free-tier limits.** Open-weight vision on the free tier allows about two photo inspections a minute. Rules-first routing, caching and queued inspections keep conversations responsive inside those limits.

**6. Claiming only what is verified.** One AI service listed a vision endpoint that returned "Forbidden" when called. I only advertise capabilities I have verified with a real request: OCR through Elastic, and vision through Groq.

## What I learned

- **Autonomy comes from boundaries.** The agent can act freely because it physically cannot move money outside the rules.
- **Telling "unknown" apart from "no" matters most.** Most bad AI support comes from treating uncertainty as rejection.
- **Voice is the hardest interface.** Misheard words, half sentences and background noise break naive agents.
- **Test with real conversations.** The 35 automated tests include tests rebuilt from real conversations that failed.
- **Customers want outcomes, not words.** Every iteration made Flamingo say less and do more.

## What's next

Flamingo becomes a **plug-and-play resolution layer for any online store**:

- an SDK, plus Shopify and WooCommerce plugins that connect orders, payments and policies in minutes;
- multi-store support with secure merchant sign-in;
- live PayPal payments, using the PayPal Disputes API to resolve problems _before_ they become chargebacks;
- fraud signals: reused or internet photos, unusual refund frequency, photos that don't match the product;
- return labels and shipment tracking;
- Hindi and multilingual voice support;
- merchant analytics on how many cases are resolved automatically, how long they take, the cost per case, and refund patterns.

**A business shouldn't need a large support team to treat its customers well. Flamingo turns customer support from a conversation about a problem into the solution itself.**
