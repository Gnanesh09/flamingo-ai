import { z } from "zod";
import type { Invoice, Reminder } from "@workspace/api-zod";
import { AppError, requireConfigured } from "./errors";
import { audit, exclusive, loadGlobal, saveGlobal, saveWorkspace, type Workspace } from "./store";
import { money, normalized } from "./domain";
import { reconcileResolutions, reminderIsPaused } from "./resolution-state";

// Deliberately not configurable: this product cannot call PayPal's live API.
const BASE = "https://api-m.sandbox.paypal.com";
let token: { value: string; expires: number } | undefined;
class Rejected extends AppError {}

export const paypalConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

async function accessToken(): Promise<string> {
  requireConfigured(paypalConfigured(), "PayPal Sandbox");
  return exclusive("paypal-token", async () => {
    if (token && token.expires > Date.now()) return token.value;
    let response: Response;
    try {
      response = await fetch(`${BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(15000),
      });
    } catch { throw new AppError(502, "PayPal authentication could not be reached. No invoice action was attempted."); }
    if (!response.ok) throw new AppError(503, "PayPal rejected the Sandbox app credentials. Check the sandbox Client ID and Secret.");
    const result = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await response.json());
    token = { value: result.access_token, expires: Date.now() + Math.max(0, result.expires_in - 120) * 1000 };
    return token.value;
  });
}

export async function paypalRequest(endpoint: string, method = "GET", body?: unknown, requestId?: string): Promise<unknown> {
  const bearer = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`, "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AppError(502, "PayPal did not return a result. The action may have reached PayPal. Check the Sandbox dashboard before retrying; no automatic retry was made.");
  }
  if (!response.ok) {
    if (response.status === 401) token = undefined;
    const data = await response.json().catch(() => ({})) as { name?: string };
    const code = typeof data.name === "string" && /^[A-Z0-9_]+$/.test(data.name) ? data.name : `HTTP_${response.status}`;
    if (response.status < 500) {
      throw new Rejected(response.status === 429 ? 429 : 422, `PayPal Sandbox rejected the request (${code}). Check the invoice and sandbox account setup.`, response.status === 429 ? 60 : undefined);
    }
    throw new AppError(502, "PayPal reported a server error; the outcome is uncertain. Check Sandbox before retrying.");
  }
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

const request = paypalRequest;

const amountSchema = z.object({ value: z.string(), currency_code: z.string() });
const paypalInvoice = z.object({
  id: z.string(), status: z.string(),
  amount: amountSchema,
  due_amount: amountSchema.optional(),
  payments: z.object({ paid_amount: amountSchema.optional() }).optional(),
  detail: z.object({
    metadata: z.object({ recipient_view_url: z.string().optional() }).optional(),
  }).optional(),
});

export async function syncPayPal(invoice: Invoice): Promise<void> {
  requireConfigured(paypalConfigured(), "PayPal Sandbox");
  if (!invoice.paypalId || invoice.source !== "paypal") {
    throw new AppError(409, "This is not a PayPal invoice. Sample invoices cannot be synced. Create and send a new sandbox invoice first.");
  }
  const remote = paypalInvoice.parse(await request(`/v2/invoicing/invoices/${encodeURIComponent(invoice.paypalId)}`));
  if (remote.id !== invoice.paypalId || remote.amount.currency_code !== "USD") throw new AppError(502, "Unexpected PayPal invoice identity or currency. No balance was changed.");
  const statuses: Record<string, Invoice["status"]> = {
    DRAFT: "draft", SENT: "sent", UNPAID: "sent", SCHEDULED: "draft",
    PARTIALLY_PAID: "partially_paid", PAYMENT_PENDING: "sent",
    PAID: "paid", MARKED_AS_PAID: "paid", CANCELLED: "cancelled",
    REFUNDED: "cancelled", PARTIALLY_REFUNDED: "partially_paid",
  };
  const status = statuses[remote.status];
  if (!status) throw new AppError(502, `PayPal returned an unsupported invoice status (${remote.status.slice(0, 40)}). Check the Sandbox dashboard.`);
  const amount = Number(remote.amount.value);
  const balance = remote.due_amount ? Number(remote.due_amount.value) : status === "paid" ? 0 : undefined;
  const paid = remote.payments?.paid_amount ? Number(remote.payments.paid_amount.value) : undefined;
  if (!Number.isFinite(amount) || amount < 0 || balance === undefined || !Number.isFinite(balance) || balance < 0 || (paid !== undefined && !Number.isFinite(paid))) {
    throw new AppError(502, "PayPal did not return a valid balance. Existing financial data was kept.");
  }
  invoice.amount = money(amount);
  invoice.balance = money(balance);
  invoice.paidAmount = money(paid ?? Math.max(0, amount - balance));
  invoice.status = status;
  invoice.lastSyncedAt = new Date().toISOString();
  const viewUrl = remote.detail?.metadata?.recipient_view_url;
  if (viewUrl) {
    try {
      const url = new URL(viewUrl);
      if (url.protocol === "https:" && (url.hostname === "sandbox.paypal.com" || url.hostname === "www.sandbox.paypal.com")) {
        invoice.paymentUrl = url.toString();
      }
    } catch { /* Never expose malformed or live checkout links. */ }
  }
  Object.assign(invoice, normalized(invoice));
}

async function externalOperation(ws: Workspace, key: string, fn: () => Promise<unknown>) {
  if (ws.operations[key] === "complete") return;
  if (ws.operations[key] === "started") throw new AppError(409, "A previous PayPal attempt has an uncertain outcome. Check PayPal Sandbox and sync the invoice. Automatic resend is blocked to prevent duplicates.");
  await accessToken(); // Credential failures must not mark an operation as attempted.
  ws.operations[key] = "started";
  await saveWorkspace(ws);
  try {
    await fn();
    ws.operations[key] = "complete";
    await saveWorkspace(ws);
  } catch (error) {
    if (error instanceof Rejected) ws.operations[key] = "rejected";
    throw error;
  }
}

export async function sendPayPalInvoice(ws: Workspace, invoice: Invoice) {
  requireConfigured(paypalConfigured(), "PayPal Sandbox");
  if (invoice.source === "demo") throw new AppError(409, "Sample invoices cannot be sent. Create a new invoice with a sandbox customer.");
  if (invoice.status !== "draft") throw new AppError(409, "Only a draft invoice can be sent.");
  if (!z.string().email().safeParse(ws.settings.senderEmail).success) throw new AppError(400, "Set the PayPal Sandbox business email in Business Settings first.");
  if (!invoice.paypalId) {
    await externalOperation(ws, `create:${invoice.id}`, async () => {
      const raw = await request("/v2/invoicing/invoices", "POST", {
        detail: {
          invoice_number: `FL-${invoice.id.replaceAll("-", "").slice(0, 20)}`,
          currency_code: "USD",
          invoice_date: invoice.createdAt.slice(0, 10),
          payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: invoice.dueDate },
          ...(invoice.notes ? { note: invoice.notes } : {}),
        },
        invoicer: { email_address: ws.settings.senderEmail, business_name: ws.settings.businessName },
        primary_recipients: [{ billing_info: { email_address: invoice.customerEmail } }],
        items: invoice.items.map(item => ({ name: item.name, quantity: String(item.quantity), unit_amount: { currency_code: "USD", value: item.unitPrice.toFixed(2) } })),
        configuration: { partial_payment: { allow_partial_payment: true }, allow_tip: false },
      }, invoice.id);
      const data = z.object({ id: z.string().optional(), href: z.string().optional() }).parse(raw);
      const id = data.id ?? data.href?.split("/").pop();
      if (!id || !/^INV2-[A-Z0-9-]+$/.test(id)) throw new AppError(502, "PayPal draft creation returned no usable invoice ID. Check Sandbox before retrying.");
      invoice.paypalId = id;
      invoice.source = "paypal";
      audit(ws, "PayPal draft created", `${invoice.number} was created in PayPal Sandbox.`, "success", invoice.id, "paypal");
    });
  }
  // If a previous send timed out, reconcile first rather than duplicate the send.
  if (ws.operations[`send:${invoice.id}`] === "started") {
    await syncPayPal(invoice);
    if (invoice.status !== "draft") {
      ws.operations[`send:${invoice.id}`] = "complete";
      audit(ws, "PayPal send reconciled", `${invoice.number}: status verified as ${invoice.status}.`, "success", invoice.id, "paypal");
      return;
    }
  }
  await externalOperation(ws, `send:${invoice.id}`, () => request(`/v2/invoicing/invoices/${invoice.paypalId}/send`, "POST", { send_to_recipient: true, send_to_invoicer: false }, `send-${invoice.id}`));
  invoice.status = "sent";
  audit(ws, "PayPal accepted invoice sending", `${invoice.number}: Sandbox accepted the notification request. This is not proof of email delivery.`, "success", invoice.id, "paypal");
  await saveWorkspace(ws);
  await syncPayPal(invoice);
}

export async function sendPayPalReminder(ws: Workspace, reminder: Reminder, invoice: Invoice) {
  requireConfigured(paypalConfigured(), "PayPal Sandbox");
  if (reminder.status !== "approved") throw new AppError(409, "Approve this reminder before sending.");
  if (!invoice.paypalId || invoice.source !== "paypal") throw new AppError(409, "Only a sent PayPal invoice can receive a PayPal reminder. Sample invoices stay local.");
  await syncPayPal(invoice);
  reconcileResolutions(ws);
  if (reminderIsPaused(ws, invoice.id)) throw new AppError(409, "Reminders are paused for this invoice's resolution or accepted payment commitment. Review the Resolution center before contacting the customer.");
  if (invoice.balance <= 0 || ["paid", "cancelled", "draft"].includes(invoice.status)) throw new AppError(409, "PayPal no longer shows this invoice as collectible. No reminder was sent.");
  if (money(reminder.amount) !== money(invoice.balance)) {
    reminder.status = "pending";
    reminder.amount = invoice.balance;
    delete reminder.approvedAt;
    throw new AppError(409, "The PayPal balance changed after approval. Review the message and approve again.");
  }
  await exclusive("paypal-reminder-daily", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const usage = await loadGlobal("paypal-reminder-usage", { date: today, count: 0 });
    if (usage.date !== today) { usage.date = today; usage.count = 0; }
    if (usage.count >= 2) throw new AppError(429, "PayPal allows only two reminder calls per day. Today's safe limit has been reached.");
    if (ws.operations[`remind:${reminder.id}`] === "started") throw new AppError(409, "The previous reminder outcome is uncertain. Check PayPal; automatic resend is blocked.");
    if (ws.operations[`remind:${reminder.id}`] === "complete") {
      reminder.status = "sent";
      return;
    }
    usage.count++;
    await saveGlobal("paypal-reminder-usage", usage);
    await externalOperation(ws, `remind:${reminder.id}`, () => request(`/v2/invoicing/invoices/${invoice.paypalId}/remind`, "POST", {
      send_to_recipient: true, send_to_invoicer: false,
      // PayPal ignores custom note/subject. Do not claim the approved custom draft was delivered.
    }, reminder.id));
    reminder.status = "sent";
    reminder.sentAt = new Date().toISOString();
    delete reminder.error;
    audit(ws, "PayPal reminder accepted", `${invoice.number}: PayPal accepted its standard reminder. Custom draft wording is not delivered by this API. Delivery is not independently verified.`, "success", invoice.id, "reminder");
  });
}
