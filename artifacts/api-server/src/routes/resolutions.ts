import { Router } from "express";
import { ListResolutionsResponse, DecideResolutionBody, DecideResolutionResponse, AnalyzeResolutionResponse, CreatePortalLinkResponse } from "@workspace/api-zod";
import { audit, mutateWorkspace } from "../lib/flamingo/store";
import { issuePortal } from "../lib/flamingo/portal";
import { findInvoice } from "../lib/flamingo/domain";
import { AppError } from "../lib/flamingo/errors";
import { openInvoice, reconcileResolutions, resolutionMessage, resolutionViews, validatePromise } from "../lib/flamingo/resolution-state";
import { analyzeCase } from "../lib/flamingo/resolution-agent";
import { syncPayPal } from "../lib/flamingo/paypal";

const router = Router();
router.get("/resolutions", (_req, res) => {
  res.json(ListResolutionsResponse.parse(resolutionViews(res.locals.workspace)));
});
router.post("/invoices/:id/portal", async (req, res) => {
  const result = await mutateWorkspace(res.locals.workspace.id, ws => issuePortal(ws, String(req.params.id)));
  res.status(201).json(CreatePortalLinkResponse.parse(result));
});
router.delete("/invoices/:id/portal", async (req, res) => {
  await mutateWorkspace(res.locals.workspace.id, ws => {
    const invoice = findInvoice(ws, String(req.params.id));
    ws.portals = (ws.portals ?? []).filter(p => p.invoiceId !== invoice.id);
    audit(ws, "Customer link revoked", `${invoice.number}: previous links can no longer access this invoice. Conversation records were preserved.`, "info", invoice.id, "resolution");
  });
  res.json({ message: "Customer access revoked. Conversation retained." });
});
router.post("/resolutions/:id/decision", async (req, res) => {
  const input = DecideResolutionBody.parse(req.body);
  if (!input.message.trim()) throw new AppError(400, "Explain your decision to the customer.");
  const result = await mutateWorkspace(res.locals.workspace.id, async ws => {
    reconcileResolutions(ws);
    const r = ws.resolutions?.find(r => r.id === String(req.params.id));
    if (!r) throw new AppError(404, "Resolution not found in this workspace.");
    if (r.version !== input.version) throw new AppError(409, "This conversation changed. Refresh and review it before deciding.");
    if (r.messages.length > 190) throw new AppError(409, "This conversation reached its sandbox limit. Contact the customer directly.");
    const invoice = findInvoice(ws, r.invoiceId);
    openInvoice(invoice);
    if (input.action === "approve_date" || input.action === "propose_plan") {
      if (input.action === "approve_date" && (r.kind !== "needs_time" || r.status !== "needs_review"))
        throw new AppError(409, "There is no pending customer payment-date request to approve.");
      // Establish an actual current baseline; earlier payments cannot fulfill a new promise.
      if (invoice.source === "paypal") {
        await syncPayPal(invoice);
        reconcileResolutions(ws);
        openInvoice(invoice);
      }
      const promise = validatePromise(input.action === "approve_date" ? r.requestedDate : input.date, input.action === "approve_date" ? r.requestedAmount : input.amount, invoice);
      r.commitment = { ...promise, state: input.action === "approve_date" ? "accepted" : "proposed" };
      r.status = input.action === "approve_date" ? "committed" : "waiting_customer";
      r.baselinePaid = invoice.paidAmount;
      resolutionMessage(r, "owner", input.message.trim());
      resolutionMessage(r, "system", input.action === "approve_date"
        ? `Owner accepted the customer's request: $${promise.amount.toFixed(2)} by ${promise.date} (end of day UTC). Reminders paused until then. Original invoice total and due date are unchanged.`
        : `Owner proposed $${promise.amount.toFixed(2)} by ${promise.date}. Customer acceptance is required. This is not a discount or automatic debit.`);
    } else {
      if (input.action === "reject" && r.commitment?.state === "accepted" && !(r.status === "needs_review" && r.requestedDate))
        throw new AppError(409, "An accepted promise cannot be rejected. Propose new terms for customer acceptance instead.");
      resolutionMessage(r, "owner", input.message.trim());
      if (input.action === "reject") {
        if (r.commitment?.state !== "accepted") delete r.commitment;
        delete r.requestedDate;
        delete r.requestedAmount;
        resolutionMessage(r, "system", "The owner declined the request. No invoice amount, due date or payment status changed.");
        if (r.commitment?.state === "accepted") r.status = "committed";
      }
      if (r.commitment?.state !== "accepted") r.status = r.kind === "already_paid" ? "verification_needed" : "waiting_customer";
    }
    reconcileResolutions(ws);
    audit(ws, "Owner resolution decision", `${invoice.number}: ${input.action.replaceAll("_", " ")}. Customer can read this response through their link; no email was sent.`, "success", invoice.id, "resolution");
    return resolutionViews(ws).find(v => v.id === r.id);
  });
  res.json(DecideResolutionResponse.parse(result));
});
router.post("/resolutions/:id/analyze", async (req, res) => {
  const result = await mutateWorkspace(res.locals.workspace.id, async ws => {
    const analysis = await analyzeCase(ws, String(req.params.id));
    const r = ws.resolutions?.find(r => r.id === String(req.params.id));
    audit(ws, "Resolution analysis prepared", `Read-only ${analysis.engine} recommendation. No customer response or financial action was executed.`, "success", r?.invoiceId, "assistant");
    return analysis;
  });
  res.json(AnalyzeResolutionResponse.parse(result));
});
export default router;
