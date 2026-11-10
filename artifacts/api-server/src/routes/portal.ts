import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { ViewPortalBody, ViewPortalResponse, RespondPortalBody, SyncPortalBody, TranscribePortalBody } from "@workspace/api-zod";
import { accessPortal, checkPortal, portalView } from "../lib/flamingo/portal";
import { audit, mutateWorkspace } from "../lib/flamingo/store";
import { findInvoice } from "../lib/flamingo/domain";
import { AppError } from "../lib/flamingo/errors";
import { openInvoice, reconcileResolutions, resolutionMessage, validatePromise, type ResolutionRecord } from "../lib/flamingo/resolution-state";
import { syncPayPal } from "../lib/flamingo/paypal";
import { transcribe } from "../lib/flamingo/voice";

const router = Router();
router.use("/portal", rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many portal requests. Please wait a minute." } }));
router.post("/portal/view", async (req, res) => {
  const { token } = ViewPortalBody.parse(req.body);
  const { ws, portal } = await accessPortal(token);
  res.json(ViewPortalResponse.parse(portalView(ws, portal)));
});
router.post("/portal/respond", async (req, res) => {
  const input = RespondPortalBody.parse(req.body);
  if (!input.message.trim()) throw new AppError(400, "Add a short explanation before submitting.");
  const { ws } = await accessPortal(input.token);
  const result = await mutateWorkspace(ws.id, async current => {
    const portal = checkPortal(current, input.token);
    const invoice = findInvoice(current, portal.invoiceId);
    openInvoice(invoice);
    reconcileResolutions(current);
    current.resolutions ??= [];
    let r = current.resolutions.find(r => r.invoiceId === invoice.id);
    if ((r?.version ?? 0) !== input.version) throw new AppError(409, "This conversation changed. Refresh and review the latest response before submitting.");
    if (r && r.messages.length > 190) throw new AppError(409, "This conversation reached its sandbox limit. Contact the business directly.");
    if (input.action === "accept_proposal") {
      if (!r || r.commitment?.state !== "proposed") throw new AppError(409, "There is no current proposal to accept.");
      if (invoice.source === "paypal") {
        await syncPayPal(invoice);
        reconcileResolutions(current);
        openInvoice(invoice);
      }
      validatePromise(r.commitment.date, r.commitment.amount, invoice);
      r.commitment.state = "accepted";
      r.baselinePaid = invoice.paidAmount;
      r.status = "committed";
      resolutionMessage(r, "customer", input.message.trim());
      resolutionMessage(r, "system", `Customer accepted $${r.commitment.amount.toFixed(2)} by ${r.commitment.date} (end of day UTC). This is a payment promise, not a payment or automatic debit.`);
    } else if (input.action === "reply") {
      if (!r) throw new AppError(400, "Choose a request type to start a conversation.");
      resolutionMessage(r, "customer", input.message.trim());
      // A message does not silently cancel an already agreed promise.
      if (r.commitment?.state !== "accepted") r.status = r.kind === "already_paid" ? "verification_needed" : "needs_review";
    } else {
      const promise = input.action === "needs_time" ? validatePromise(input.date, input.amount, invoice) : undefined;
      if (!r) {
        r = { id: randomUUID(), invoiceId: invoice.id, invoiceNumber: invoice.number, customerName: invoice.customerName,
          balance: invoice.balance, source: invoice.source, kind: input.action, status: "needs_review", messages: [],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 0, reminderPaused: false };
        current.resolutions.push(r);
      }
      r.kind = input.action;
      r.status = input.action === "already_paid" ? "verification_needed" : "needs_review";
      // A new request never silently cancels a previously accepted agreement.
      if (r.commitment?.state !== "accepted") {
        delete r.commitment;
        delete r.baselinePaid;
      }
      if (promise) {
        r.requestedDate = promise.date;
        r.requestedAmount = promise.amount;
      } else {
        delete r.requestedDate;
        delete r.requestedAmount;
      }
      resolutionMessage(r, "customer", input.message.trim());
      if (promise) resolutionMessage(r, "system", `Requested $${promise.amount.toFixed(2)} by ${promise.date}. Waiting for owner approval; no invoice terms or balances changed.`);
      if (input.action === "already_paid") resolutionMessage(r, "system", "Customer reports payment. This is not verified payment evidence; a PayPal check is required.");
    }
    reconcileResolutions(current);
    audit(current, "Customer response received", `${invoice.number}: ${input.action.replaceAll("_", " ")}. No payment status was changed.`, "info", invoice.id, "resolution");
    return portalView(current, portal);
  }, true);
  res.json(ViewPortalResponse.parse(result));
});
router.post("/portal/sync", async (req, res) => {
  const { token } = SyncPortalBody.parse(req.body);
  const { ws } = await accessPortal(token);
  const result = await mutateWorkspace(ws.id, async current => {
    const portal = checkPortal(current, token);
    const invoice = findInvoice(current, portal.invoiceId);
    if (invoice.source !== "paypal") throw new AppError(409, "Sample invoices cannot be verified or paid. The business must send a PayPal Sandbox invoice first.");
    if (!invoice.lastSyncedAt || Date.now() - Date.parse(invoice.lastSyncedAt) >= 15000) {
      await syncPayPal(invoice);
      audit(current, "Customer requested PayPal verification", `${invoice.number}: PayPal reports ${invoice.status}, balance $${invoice.balance.toFixed(2)}.`, "success", invoice.id, "paypal");
    }
    reconcileResolutions(current);
    return portalView(current, portal);
  }, true);
  res.json(ViewPortalResponse.parse(result));
});
router.post("/portal/transcribe", async (req, res) => {
  const input = TranscribePortalBody.parse(req.body);
  await accessPortal(input.token);
  res.json(await transcribe(input.audio, input.mimeType));
});
export default router;
