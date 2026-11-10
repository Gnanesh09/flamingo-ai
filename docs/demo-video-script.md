# Flamingo AI: 3-minute keynote-style demo script

**Length:** 2:55 to 3:00  
**Narration:** about 470 words. Speak slowly, keep sentences short and pause after the key lines.  
**Story arc:** one customer and one $39 speaker. Follow the money from purchase to refund, and show every step in KikoStore **and** in PayPal Sandbox.

```
The problem → Meet Flamingo AI → The purchase (PayPal) → It breaks → One conversation → Refund (PayPal)
→ Proof in PayPal → Staff view: cases that need a person → Staff view: policy rules and PDFs → The vision
```

### Keynote style rules (how Musk and Huang present)

- **Start from the first principle, not the product.** "Support isn't a chat problem. It's a decision problem."
- **Short sentences, then silence.** Say the line, wait one beat and let the screen speak.
- **Show, don't claim.** Every claim in the script is followed by the screen proving it.
- **One villain, one hero.** The villain is waiting. The hero is a finished case.
- **Return to the same thread.** The $39 speaker opens the story and closes it.
- **End on the bigger future,** not on a feature list.

---

## Part 1: Before you record

### PayPal Sandbox accounts (one-time setup)

1. Go to **developer.paypal.com → Testing Tools → Sandbox Accounts**. Note the **Personal (buyer)** test login. You'll use it on the PayPal checkout page.
2. In a second browser profile, sign in to **sandbox.paypal.com** with the same buyer account. You'll show the payment and the refund there.
3. Optional: sign in to **sandbox.paypal.com** with the **Business (merchant)** account in a third profile to show the store's side.

> Don't show passwords on screen. Type them before recording, or blur them when editing.

### Prepare the demo

1. **Pre-create the "limits" case:** place a sample order for the **Orbit Smart Watch ($149)**, click **Get help** and type "The screen is cracked, I want a refund." It goes to staff. You'll show it in the portal later, which saves about 20 seconds of recording.
2. Have a clear **torn speaker cone photo** on your desktop (`speaker-torn.jpg`).
3. **Make the policy PDF** for the staff scene. In Google Docs, write a short page titled "KikoStore Electronics Addendum", for example:
   - "Electronics returned for a change of mind must include all original accessories and packaging."
   - "Items with water damage are not eligible for a return."
   
   Then use **File → Download → PDF**. It must be a text PDF, not a scan.
4. **Check the Policy tab before recording:** Return window **30**, Automatic limit **100**, Instant refund limit **50**, and no published supplemental document. If a document is published, **Archive** it.
5. Browser at 1920×1080 with notifications off and only these tabs:
   - Tab 1: KikoStore home (`/kikostore`)
   - Tab 2: Staff portal (`/flamingo-portal`)
   - Profile 2: sandbox.paypal.com (buyer), signed in, on **Activity**
6. Wear headphones for the voice call.
7. Do one full practice run, then record using a **new** purchase.

### Record the scenes in this order

Record **scenes 2 to 4 (the speaker refund) before scene 6 (policy changes)**. Changing the policy cancels any refund that's still waiting for the customer to confirm, and a published document can change what Flamingo decides.

**After recording:** in the Policy tab, set the return window back to **30** days and **Archive** the demo PDF, so retakes behave the same way.

### Recording approach

- Record the screen first in separate clips, one per scene. Record the narration afterwards over the edited video.
- Speed up all waiting (PayPal redirects and AI replies) to 2× to 4×.
- Leave at least 30 seconds between photo uploads, because the free AI plan allows about two photo checks a minute.

---

## Part 2: The script

> **SCREEN** = what to show. **SAY** = narration. Keep the pause markers (…).

### 1. The problem, then Flamingo AI (0:00 to 0:20)

**SCREEN:** Black screen with white text that appears one line at a time:  
*"Your order arrived broken."* → *"Ticket #48213."* → *"Response time: 3 to 5 business days."*  
Hard cut to the **pink Flamingo AI title card**: logo, then *"Flamingo AI"*, then underneath: *"The AI agent that resolves returns and refunds. End to end."* Hold for 3 seconds.

**SAY:**
> "You buy something online… and it arrives broken. A ticket. A queue. Days of waiting.
> Here's the thing: support isn't a conversation problem. It's a decision problem."
>
> *(title card appears, pause)*
>
> "So we built **Flamingo AI**. An agent that doesn't just answer customers… it **resolves** their problem. Order, photo, policy, refund. All by itself.
> Let me show you."

---

### 2. The purchase: real money flow (0:20 to 0:40)

**SCREEN:**
1. KikoStore home page. Click the **Pebble Mini Bluetooth Speaker ($39)**.
2. Click **Pay with PayPal Sandbox**, then **Continue to PayPal Sandbox**.
3. **The PayPal Sandbox checkout page** shows "KikoStore Sandbox" and $39.00. Sign in as the buyer and click **Pay**. *(Zoom in on the PayPal page.)*
4. You're back on KikoStore with the banner **"Back from PayPal Sandbox"**. Click **Confirm capture**, then **Capture $39.00**.
5. The banner changes to **"PayPal Sandbox payment captured"** with the capture ID. *(Zoom in.)*
6. **Quick cut to sandbox.paypal.com (buyer) → Activity:** the **$39.00 payment to the store** is there.

**SAY:**
> "This is KikoStore, a demo shop. I'm buying a thirty-nine dollar speaker with PayPal, PayPal's real checkout, running in Sandbox.
> Payment captured… and there it is in my PayPal account.
> Now, the speaker arrives… broken."

---

### 3. One conversation with Flamingo AI (0:40 to 1:15), the main moment

**SCREEN:**
1. **My orders** → the speaker order → **Get help**. Flamingo already shows the order.
2. Click **Call Flamingo**. Let the greeting play.
3. Say: *"Hi, my speaker has no sound, and the cone is torn on one side."*
4. Flamingo asks for a photo. Tap **Photos** and upload `speaker-torn.jpg` **without hanging up**.
5. Let Flamingo's spoken reply play: damage confirmed, $39 refund, keep the item.

**SAY** (in the gaps in the call audio):
> "I tap Get help, and this is Flamingo AI. It already knows what I bought, when, and how I paid.
> I just… talk to it."
>
> *(let the call play)*
>
> "It asks for one photo. I send it mid-call. A vision model reads it. Right product. Torn cone.
> And then it does what no chatbot does… it decides. Thirty-nine dollars back, and I keep the speaker."

**EDIT:** Zoom in on the photo. Caption: *"Vision check: product matches, damage confirmed."*

---

### 4. The refund: money moves back (1:15 to 1:35)

**SCREEN:**
1. Show the proposal card. Click **Confirm refund**.
2. The case shows **"PayPal Sandbox confirmed the full $39.00 refund to the original payment. Reference: …"**. *(Zoom in.)*
3. **Cut to sandbox.paypal.com (buyer) → Activity → refresh:** the **$39.00 refund** appears. Click it to open the detail.

**SAY:**
> "Nothing moves until I say yes. I confirm… Flamingo checks the policy one more time… and refunds through PayPal.
> There it is in my PayPal account. Same payment, same amount, back where it came from.
> From broken to refunded… in one conversation."

**EDIT:** Show the PayPal Activity screen and the Flamingo case side by side for 2 seconds. Caption: *"Purchase → refund, verified in PayPal."*

---

### 5. The staff view: the cases that need a person (1:35 to 2:00)

**SCREEN:**
1. Switch to the **Staff portal → Support desk → Live queue**. Click the **Needs staff** filter. The pre-created **Orbit Smart Watch ($149)** case is at the top.
2. Open it. Slowly scroll the right panel: the **conversation**, the **evidence** (photo and vision notes), the **Reasoning** steps and the **quoted policy passage**. *(Zoom in on the policy quote.)*
3. In **Staff decision**, type: *"Crack confirmed from the photo. Approving a return as an exception."*
4. Point at the **"Owner override · over $100"** tag, then click **Approve return**. The status changes to awaiting return.

**SAY:**
> "Now, the other side. This is the staff view.
> An agent that says yes to everything is dangerous. This watch is a hundred and forty-nine dollars, over the store's limit. So Flamingo doesn't guess. It hands it to a person… with the full story, the evidence, and the exact policy it used.
> The manager makes the call, and has to write a reason. Every human decision is on the record too."

---

### 6. The staff view: the business sets the rules (2:00 to 2:40)

**SCREEN:**
1. Click the **Policy** tab. Show **Active policy** with the version and the **Elastic semantic retrieval** label.
2. **Change a rule:** set **Return window** from 30 to **14** days → **Save rules** → the toast **"Policy rules updated"** appears. *(Zoom in.)*
3. **Try to break it:** type **500** in **Automatic limit**. The red message **"Automatic limit must be between $0 and $100."** appears and **Save rules** is disabled. Pan down to the **Immutable safety caps** box. Click **Reset**.
4. **Add a policy document:** in **Supplemental policy documents**, click **Import PDF** and choose `KikoStore-Electronics-Addendum.pdf`. The preview shows the extracted pages. Click **Save as draft**, then **Publish** → **Publish**. The document shows **Published**.
5. Click the **Costs** tab for 2 seconds: cases, tokens and **Est. AI cost** for each case.

**SAY:**
> "And the business sets the rules.
> A fourteen-day return window? Change it. Save. Flamingo follows it on the next message.
> Now watch. I try to let the AI approve five hundred dollars… and it refuses. Those limits live in code.
> Have your policy as a PDF? Import. Publish. Flamingo searches it with Elastic and quotes it in its decisions. But it can only make the rules stricter… never looser.
> The model talks… the code decides."

**EDIT:** Caption on step 3: *"The AI can't raise its own limits."* Caption on step 4: *"Policy documents can only tighten the rules."* Caption on step 5: *"AI cost of every case."*

---

### 7. The vision (2:40 to 3:00)

**SCREEN:** A slow zoom on the KikoStore home page, then the end card:  
**Flamingo AI**: *Support that resolves.*  
Built with PayPal · LangGraph · Groq · Deepgram · Elastic · MongoDB  
[your live link]

**SAY:**
> "Today, it's one store and one speaker.
> Tomorrow, it's every store, plugged into PayPal, resolving problems before they ever become disputes.
> Support teams shouldn't spend their days writing replies. They should spend them on the cases that need a human.
> Flamingo AI. Support that doesn't just respond… it resolves."

---

## Part 3: Shot list (record these clips separately)

| # | Clip | Where |
|---|---|---|
| 1 | Speaker product, then Pay with PayPal Sandbox | KikoStore |
| 2 | PayPal checkout page, sign in, Pay | PayPal Sandbox |
| 3 | Back to store, Confirm capture, "payment captured" | KikoStore |
| 4 | $39 payment in Activity | sandbox.paypal.com (buyer) |
| 5 | Get help, voice call, photo upload, decision | Flamingo |
| 6 | Confirm refund, PayPal reference message | Flamingo |
| 7 | $39 refund in Activity, plus refund detail | sandbox.paypal.com (buyer) |
| 8 | Refund issued (optional) | sandbox.paypal.com (merchant) |
| 9 | Live queue, Needs staff filter, watch case evidence and reasoning | Staff portal |
| 10 | Type a reason, Owner override tag, Approve return | Staff portal |
| 11 | Policy: 30 → 14 days, Save rules, "Policy rules updated" | Staff portal |
| 12 | Policy: type 500, error message, Immutable safety caps, Reset | Staff portal |
| 13 | Import PDF, preview, Save as draft, Publish, "Published" | Staff portal |
| 14 | Costs tab | Staff portal |
| 15 | Title cards: problem, Flamingo AI and end card | Editor |

## Part 4: Editing checklist

- [ ] Under 3:00 in total.
- [ ] PayPal screens are zoomed so "$39.00" and "Refund" are readable.
- [ ] Passwords and email addresses are blurred.
- [ ] Waiting is sped up or cut. Nothing stays still for more than 2 seconds.
- [ ] Narration pauses are kept, not cut. The pauses create the keynote feel.
- [ ] Music: calm and building, about 10% volume, lowered under the voice call.
- [ ] Captions or subtitles on.
- [ ] Exported at 1080p MP4 and uploaded to YouTube as Public or Unlisted.

## If something goes wrong

| Problem | Fix |
|---|---|
| The refund doesn't appear in PayPal Activity yet | Refresh after 10 to 30 seconds. Sandbox can lag. You can also open the transaction from the original payment. |
| Confirm capture shows an error | Make sure you clicked **Pay** on the PayPal page. Use **Open PayPal again** if needed. |
| Flamingo hands the speaker case to staff | Check that the order shows "PayPal Sandbox payment captured" before clicking Get help. Then start a new purchase. |
| The photo check is slow | Free-tier limit: wait 30 to 60 seconds and try again. |
| Import PDF says it couldn't read the file | Use a text PDF exported from Google Docs or Word, not a scan or a photo. |
| "Policy not changed" error | Click **Reset** to load the current rules, then make the change again. |
| The voice call doesn't start | Allow the microphone in the browser and reload. As a backup, record the conversation in text and show voice in a short separate clip. |
