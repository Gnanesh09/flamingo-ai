import { randomUUID } from "node:crypto";
import type { Invoice } from "@workspace/api-zod";
import type { Workspace } from "./store";
import { audit } from "./store";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export function seedWorkspace(username: string, role: Workspace["role"]): Workspace {
  const customers = [
    { id: randomUUID(), name: "Olivia Chen", company: "Studio Forma", email: "olivia@example.com", outstanding: 0, received: 0, invoiceCount: 0 },
    { id: randomUUID(), name: "James Wilson", company: "Sunday Supply", email: "james@example.com", outstanding: 0, received: 0, invoiceCount: 0 },
    { id: randomUUID(), name: "Amara Okafor", company: "Bloom Collective", email: "amara@example.com", outstanding: 0, received: 0, invoiceCount: 0 },
  ];
  const fixtures: [number, string, number, number, Invoice["status"], number][] = [
    [0, "Brand identity design", 4200, -18, "overdue", 0],
    [1, "Website development", 6800, -9, "overdue", 0],
    [2, "Monthly creative retainer", 3200, -4, "partially_paid", 1200],
    [0, "Packaging design", 1800, 7, "sent", 0],
    [1, "Product photography", 2400, -30, "paid", 2400],
    [2, "Campaign strategy", 3500, -22, "paid", 3500],
    [0, "Social media templates", 950, 14, "draft", 0],
  ];
  const ws: Workspace = {
    id: randomUUID(), version: 0, active: true, username, role, createdAt: new Date().toISOString(),
    customers, reminders: [], activity: [], conversation: [], operations: {},
    settings: { businessName: "Your studio", senderEmail: "", reminderTone: "friendly", minimumOverdueDays: 7 },
    invoices: fixtures.map(([customer, name, amount, due, status, paid], index) => ({
      id: randomUUID(), number: `FL-10${String(index + 1).padStart(2, "0")}`,
      customerId: customers[customer].id, customerName: customers[customer].name, customerEmail: customers[customer].email,
      dueDate: day(due), createdAt: new Date(Date.now() - (40 - index) * 86400000).toISOString(),
      items: [{ name, quantity: 1, unitPrice: amount }], notes: "Sample invoice for exploring Flamingo. Not a real PayPal invoice.",
      amount, balance: amount - paid, paidAmount: paid, currency: "USD", status, source: "demo", daysOverdue: 0,
    })),
  };
  audit(ws, "Your demo workspace is ready", "Sample customers and invoices were added. No real payments or emails have occurred.", "info");
  return ws;
}
