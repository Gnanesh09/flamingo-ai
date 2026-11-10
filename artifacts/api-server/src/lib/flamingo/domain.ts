import { randomUUID } from "node:crypto";
import type { Dashboard, Invoice, InvoiceInput, Reminder, ReminderInput } from "@workspace/api-zod";
import type { Workspace } from "./store";
import { audit } from "./store";
import { AppError } from "./errors";
import { reminderIsPaused } from "./resolution-state";

export const money = (value: number) => Math.round(value * 100) / 100;
export const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function normalized(invoice: Invoice): Invoice {
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(invoice.dueDate)) / 86400000));
  const collectible = !["draft", "paid", "cancelled"].includes(invoice.status) && invoice.balance > 0;
  return {
    ...invoice,
    daysOverdue: collectible ? days : 0,
    status: collectible && days > 0 && invoice.status !== "partially_paid" ? "overdue" : invoice.status,
  };
}

export function findInvoice(ws: Workspace, id: string): Invoice {
  const invoice = ws.invoices.find(i => i.id === id);
  if (!invoice) throw new AppError(404, "Invoice not found in this workspace.");
  return invoice;
}

export function collectibleInvoices(ws: Workspace) {
  return ws.invoices.map(normalized).filter(i => !["draft", "paid", "cancelled"].includes(i.status) && i.balance > 0);
}

export function customersWithTotals(ws: Workspace) {
  return ws.customers.map(customer => {
    const invoices = ws.invoices.filter(i => i.customerId === customer.id);
    return { ...customer,
      outstanding: money(invoices.filter(i => !["draft", "cancelled"].includes(i.status)).reduce((sum, i) => sum + i.balance, 0)),
      received: money(invoices.reduce((sum, i) => sum + i.paidAmount, 0)),
      invoiceCount: invoices.length,
    };
  });
}

export function summary(ws: Workspace): Dashboard {
  const collect = collectibleInvoices(ws);
  const overdue = collect.filter(i => i.daysOverdue > 0);
  const outstanding = money(collect.reduce((sum, i) => sum + i.balance, 0));
  const received = money(ws.invoices.reduce((sum, i) => sum + i.paidAmount, 0));
  return {
    outstanding, received,
    overdue: money(overdue.reduce((sum, i) => sum + i.balance, 0)),
    overdueCount: overdue.length,
    draftAmount: money(ws.invoices.filter(i => i.status === "draft").reduce((sum, i) => sum + i.amount, 0)),
    invoiceCount: ws.invoices.length,
    pendingApprovals: ws.reminders.filter(r => r.status === "pending").length,
    collectionRate: outstanding + received ? Math.round(100 * received / (outstanding + received)) : 0,
    priorityInvoices: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance).slice(0, 5),
    recentActivity: ws.activity.slice(0, 8),
    aging: [["Not due", 0, 0], ["1–7 days", 1, 7], ["8–30 days", 8, 30], ["31+ days", 31, Infinity]].map(([label, min, max]) => {
      const values = collect.filter(i => i.daysOverdue >= Number(min) && i.daysOverdue <= Number(max));
      return { label: String(label), amount: money(values.reduce((sum, i) => sum + i.balance, 0)), count: values.length };
    }),
  };
}

export function invoiceFields(ws: Workspace, input: InvoiceInput) {
  const customer = ws.customers.find(c => c.id === input.customerId);
  if (!customer) throw new AppError(400, "Select a customer in this workspace.");
  const items = input.items.map(i => ({ ...i, name: i.name.trim(), unitPrice: money(i.unitPrice) }));
  if (items.some(i => !i.name || i.unitPrice < 0.01)) throw new AppError(400, "Each item needs a name and a positive price.");
  const amount = money(items.reduce((sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity / 100, 0));
  if (amount > 1000000) throw new AppError(400, "Sandbox invoices are limited to $1,000,000.");
  return {
    customerId: customer.id, customerName: customer.name, customerEmail: customer.email,
    dueDate: input.dueDate.toISOString().slice(0, 10), notes: input.notes.trim(), items, amount, balance: amount,
  };
}

export function prepareTemplate(ws: Workspace, input: ReminderInput): Reminder {
  if (reminderIsPaused(ws, input.invoiceId)) throw new AppError(409, "Follow-ups are paused while this customer's resolution or payment commitment is active. Open the Resolution center.");
  const invoice = normalized(findInvoice(ws, input.invoiceId));
  if (["paid", "draft", "cancelled"].includes(invoice.status) || invoice.balance <= 0) {
    throw new AppError(409, "Only sent, unpaid invoices can have a reminder. Drafts must be sent first.");
  }
  const existing = ws.reminders.find(r => r.invoiceId === invoice.id && ["pending", "approved"].includes(r.status));
  if (existing) return existing;
  const greeting = input.tone === "firm" ? "Please arrange payment" : input.tone === "professional" ? "This is a reminder regarding payment" : "Just a friendly reminder";
  const reminder: Reminder = {
    id: randomUUID(), invoiceId: invoice.id, invoiceNumber: invoice.number,
    customerName: invoice.customerName, customerEmail: invoice.customerEmail,
    amount: invoice.balance, tone: input.tone,
    message: `Hi ${invoice.customerName},\n\n${greeting} for invoice ${invoice.number}. The outstanding balance is ${dollars(invoice.balance)}, due on ${invoice.dueDate}.${invoice.daysOverdue > 0 ? ` It is now ${invoice.daysOverdue} days overdue.` : ""}\n\nIf you have already paid, please share the payment reference so we can check it. Please let us know if you have any questions.\n\nThank you,\n${ws.settings.businessName}`,
    status: "pending", createdAt: new Date().toISOString(), source: "template",
  };
  ws.reminders.unshift(reminder);
  audit(ws, "Reminder prepared", `${invoice.number}: a ${input.tone} draft is waiting for your review. Nothing was sent.`, "pending", invoice.id, "reminder");
  return reminder;
}
