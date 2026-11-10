# PayPal + AI hackathon submission guide

## Product description

Small businesses often have to reconcile invoice lists, determine which payments are late, and write follow-ups manually. Flamingo AI brings that work into one owner-controlled workflow: inspect receivables, investigate the records, prepare a reminder, obtain approval, execute a supported PayPal action, and verify the result.

The emphasis is **overdue invoice management and payment collection**, not a complete accounting suite. It does not claim that overdue status proves why a customer has not paid.

## Meaningful PayPal use

The backend integrates PayPal Sandbox Invoicing v2 for:

1. Creating a draft invoice from validated customer and line-item data.
2. Explicitly owner-authorized invoice sending.
3. Retrieving the recipient's sandbox payment link when PayPal provides one.
4. Verifying invoice statuses and balances with PayPal.
5. Sending PayPal's standard reminder after owner approval.

Sandbox sample records cannot be falsely presented as PayPal invoices. A new connected invoice is visibly distinguished from the sample records.

## Meaningful AI use

LangGraph orchestrates the workflow. Groq analyzes bounded, workspace-scoped receivables and chooses only allowlisted actions: answer, investigate, or prepare reminder drafts. Server validation filters unknown invoice IDs and checks eligibility. Financial arithmetic and payment execution are not delegated to a language model.

Deepgram enables spoken questions and spoken responses through short browser audio turns. All financial actions still require a visible owner review, not a voice-only authorization.

Without provider credentials, labeled deterministic demo rules allow interface exploration. That offline mode alone is **not** evidence of a working PayPal + LLM integration for the hackathon.

## Suggested demo under three minutes

The strongest updated narrative is a complete resolution rather than another reminder:

1. Show an overdue invoice and create its scoped customer link.
2. Customer explains a blocker and requests a specific payment date.
3. Owner reviews the evidence-backed AI suggestion and approves or counterproposes.
4. Customer accepts any counterproposal; show the reminder pause.
5. For a connected sandbox invoice, open PayPal, make a test payment using a test buyer, then explicitly verify the balance.
6. Show the closed resolution, remaining balance if partially paid, and audit trail.

Keep sample conversation records distinct from the PayPal-connected invoice used for the actual payment demonstration. Do not claim automatic background verification or customer email delivery.

Alternative reminder-focused walkthrough:

- **0:00–0:20:** State the problem: unpaid invoices create cash-flow uncertainty and follow-up work. Show the landing page and enter a business demo workspace.
- **0:20–0:50:** Show outstanding and overdue invoices. Ask which invoices need follow-up. Explain the distinction between sample records and PayPal-connected records.
- **0:50–1:20:** Show a Groq-powered investigation and LangGraph's visible execution steps. Prepare a reminder and review its evidence.
- **1:20–1:45:** Edit the draft, approve it, and explain that approval alone does not send anything. Disclose that PayPal uses standard reminder text; custom wording is available to copy.
- **1:45–2:20:** Demonstrate a real Sandbox invoice that was created through Flamingo. Open its recipient payment link, pay using a Sandbox buyer, and sync the verified balance.
- **2:20–2:45:** Ask a question through the browser voice interface and show the transcript/spoken response.
- **2:45–2:58:** Show the activity log, one-in-flight AI protection, and owner-control safety boundaries.

Prepare your sandbox business and buyer accounts beforehand. Do not expose developer credentials in the recording. Do not claim a notification arrived in an inbox based solely on an API acceptance response.

## Submission checklist from the supplied brief

- [ ] Meaningful PayPal developer-platform integration.
- [ ] Meaningful AI integration demonstrated with actual provider responses.
- [ ] A working, interactive build—not a static mockup.
- [ ] A public source repository containing source, assets, instructions and a visible license.
- [ ] A hosted demo URL **or** complete setup/run instructions.
- [ ] Text description explaining capabilities, limitations and business impact.
- [ ] Tools identified and their roles explained.
- [ ] Public YouTube demo video under three minutes.
- [ ] No exposed credentials, copyrighted music, or unauthorized third-party assets.
- [ ] Official Rules and eligibility reviewed by the entrant.

The repository contains the software and instructions. Creating a public repository, publishing a URL, recording/uploading a video and submitting the entry remain owner actions; this document does not imply they have happened.

## Official technical references

- PayPal REST setup: https://developer.paypal.com/api/rest/
- PayPal Invoicing v2: https://developer.paypal.com/api/invoicing/v2/
- Reminder behavior and limits: https://developer.paypal.com/api/invoicing/v2/invoices-remind
- Groq limits: https://console.groq.com/docs/rate-limits
- Deepgram speech recognition: https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
- Deepgram speech synthesis: https://developers.deepgram.com/reference/text-to-speech/speak-request
