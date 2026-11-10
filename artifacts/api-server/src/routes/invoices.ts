import { Router } from "express";
import { reconcileResolutions } from "../lib/flamingo/resolution-state";
import { randomUUID } from "node:crypto";
import {
  CreateInvoiceBody, UpdateInvoiceBody, GetInvoiceParams, ListInvoicesQueryParams,
  ListInvoicesResponse, GetInvoiceResponse, SendInvoiceBody,
  CreateCustomerBody, ListCustomersResponse, CreateCustomerResponse,
} from "@workspace/api-zod";
import type { Invoice } from "@workspace/api-zod";
import { audit, mutateWorkspace, type Workspace } from "../lib/flamingo/store";
import { AppError } from "../lib/flamingo/errors";
import { customersWithTotals, findInvoice, invoiceFields, normalized } from "../lib/flamingo/domain";
import { sendPayPalInvoice, syncPayPal } from "../lib/flamingo/paypal";

const router = Router();
router.get("/invoices", (req, res) => {
  const query = ListInvoicesQueryParams.parse(req.query);
  const ws = res.locals.workspace as Workspace;
  const search = (query.search ?? "").toLowerCase().slice(0, 120);
  const values = ws.invoices.map(normalized).filter(i =>
    (!query.status || query.status === "all" || (query.status === "overdue" ? i.daysOverdue > 0 : i.status === query.status)) &&
    (!query.customerId || i.customerId === query.customerId) &&
    (!search || `${i.number} ${i.customerName} ${i.customerEmail}`.toLowerCase().includes(search)),
  );
  res.json(ListInvoicesResponse.parse(values));
});

router.get("/invoices/:id", (req, res) => {
  const { id } = GetInvoiceParams.parse(req.params);
  res.json(GetInvoiceResponse.parse(normalized(findInvoice(res.locals.workspace, id))));
});

router.post("/invoices", async (req, res) => {
  const input = CreateInvoiceBody.parse(req.body);
  const invoice = await mutateWorkspace(res.locals.workspace.id, ws => {
    if (ws.invoices.length >= 200) throw new AppError(409, "This demo supports up to 200 invoices per workspace.");
    const now = new Date().toISOString();
    const value: Invoice = {
      id: randomUUID(), number: `FL-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: now, ...invoiceFields(ws, input), paidAmount: 0, currency: "USD",
      status: "draft", source: "local", daysOverdue: 0,
    };
    ws.invoices.unshift(value);
    audit(ws, "Invoice draft created", `${value.number}: saved locally. No invoice sent.`, "success", value.id, "invoice");
    return value;
  });
  res.status(201).json(GetInvoiceResponse.parse(invoice));
});

router.patch("/invoices/:id", async (req, res) => {
  const { id } = GetInvoiceParams.parse(req.params);
  const input = UpdateInvoiceBody.parse(req.body);
  const invoice = await mutateWorkspace(res.locals.workspace.id, ws => {
    const value = findInvoice(ws, id);
    if (value.status !== "draft" || value.paypalId || ws.operations[`create:${id}`] === "started") {
      throw new AppError(409, "Only local drafts with no PayPal operation in progress can be edited.");
    }
    Object.assign(value, invoiceFields(ws, input));
    audit(ws, "Invoice draft updated", `${value.number}: saved your changes.`, "success", id, "invoice");
    return value;
  });
  res.json(GetInvoiceResponse.parse(invoice));
});

router.delete("/invoices/:id", async (req, res) => {
  const { id } = GetInvoiceParams.parse(req.params);
  await mutateWorkspace(res.locals.workspace.id, ws => {
    const invoice = findInvoice(ws, id);
    if (invoice.status !== "draft" || invoice.paypalId || ws.operations[`create:${id}`] === "started") throw new AppError(409, "Only local drafts with no PayPal operation in progress can be deleted.");
    ws.invoices = ws.invoices.filter(i => i.id !== id);
    audit(ws, "Invoice draft deleted", `${invoice.number}: deleted a local draft, not a sent invoice.`, "info", id, "invoice");
  });
  res.json({ message: "Draft deleted." });
});

router.post("/invoices/:id/send", async (req, res) => {
  const { id } = GetInvoiceParams.parse(req.params);
  const { approved } = SendInvoiceBody.parse(req.body);
  if (!approved) throw new AppError(400, "Explicit approval is required to send an invoice.");
  const invoice = await mutateWorkspace(res.locals.workspace.id, async ws => {
    const value = findInvoice(ws, id);
    if (ws.operations[`send:${id}`] === "complete" && value.status !== "draft") return value;
    try { await sendPayPalInvoice(ws, value); }
    catch (error) {
      audit(ws, "PayPal invoice action needs attention", error instanceof AppError ? error.message : "PayPal returned an unexpected response. Check Sandbox before retrying.", "error", id, "paypal");
      throw error;
    }
    return normalized(value);
  });
  res.json(GetInvoiceResponse.parse(invoice));
});

router.post("/invoices/:id/sync", async (req, res) => {
  const { id } = GetInvoiceParams.parse(req.params);
  const invoice = await mutateWorkspace(res.locals.workspace.id, async ws => {
    const value = findInvoice(ws, id);
    if (value.lastSyncedAt && Date.now() - Date.parse(value.lastSyncedAt) < 15000) return value;
    try {
      await syncPayPal(value);
      reconcileResolutions(ws);
      if (value.status !== "draft" && ws.operations[`send:${id}`] === "started") ws.operations[`send:${id}`] = "complete";
      audit(ws, "PayPal status verified", `${value.number}: ${value.status}, balance $${value.balance.toFixed(2)}.`, "success", id, "paypal");
    } catch (error) {
      audit(ws, "PayPal verification failed", error instanceof AppError ? error.message : "The response could not be verified.", "error", id, "paypal");
      throw error;
    }
    return normalized(value);
  });
  res.json(GetInvoiceResponse.parse(invoice));
});

router.get("/customers", (_req, res) => { res.json(ListCustomersResponse.parse(customersWithTotals(res.locals.workspace))); });
router.post("/customers", async (req, res) => {
  const input = CreateCustomerBody.parse(req.body);
  const customer = await mutateWorkspace(res.locals.workspace.id, ws => {
    if (ws.customers.length >= 100) throw new AppError(409, "This demo supports up to 100 customers.");
    const name = input.name.trim();
    if (name.length < 2) throw new AppError(400, "Enter a customer name with at least two characters.");
    const email = input.email.trim().toLowerCase();
    if (ws.customers.some(c => c.email.toLowerCase() === email)) throw new AppError(409, "A customer with this email already exists.");
    const value = { id: randomUUID(), name, email, company: input.company.trim(), outstanding: 0, received: 0, invoiceCount: 0 };
    ws.customers.push(value);
    audit(ws, "Customer added", `${name} was added to this workspace.`, "success", undefined, "customer");
    return value;
  });
  res.status(201).json(CreateCustomerResponse.parse(customer));
});
export default router;
