import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PortalView } from "@workspace/api-zod";
import { audit, readWorkspace, type Workspace } from "./store";
import { findInvoice, normalized } from "./domain";
import { AppError } from "./errors";
import { openInvoice, resolutionViews, type PortalRecord } from "./resolution-state";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export function issuePortal(ws: Workspace, invoiceId: string) {
  openInvoice(findInvoice(ws, invoiceId));
  const token = `${ws.id}.${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  ws.portals = (ws.portals ?? []).filter(p => p.invoiceId !== invoiceId);
  ws.portals.push({ invoiceId, digest: hash(token), expiresAt });
  audit(ws, "Customer access link created", "A seven-day, one-invoice link replaced any previous link. Share it only with the intended customer.", "success", invoiceId, "resolution");
  return { path: `/resolve#${token}`, expiresAt };
}
export function checkPortal(ws: Workspace, token: string): PortalRecord {
  const digest = hash(token);
  const portal = ws.portals?.find(p => p.digest.length === digest.length && timingSafeEqual(Buffer.from(p.digest), Buffer.from(digest)));
  if (!portal || Date.parse(portal.expiresAt) <= Date.now()) throw new AppError(404, "This access link is invalid, expired or revoked. Ask the business for a new link.");
  return portal;
}
export async function accessPortal(token: string) {
  if (!/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(404, "This access link is invalid, expired or revoked. Ask the business for a new link.");
  const ws = await readWorkspace(token.split(".")[0]);
  if (!ws) throw new AppError(404, "This access link is invalid, expired or revoked. Ask the business for a new link.");
  return { ws, portal: checkPortal(ws, token) };
}
export function portalView(ws: Workspace, portal: PortalRecord): PortalView {
  const i = normalized(findInvoice(ws, portal.invoiceId));
  return {
    businessName: ws.settings.businessName, expiresAt: portal.expiresAt,
    voiceEnabled: Boolean(process.env.DEEPGRAM_API_KEY),
    invoice: {
      number: i.number, customerName: i.customerName, balance: i.balance, amount: i.amount,
      paidAmount: i.paidAmount, dueDate: i.dueDate, currency: i.currency, status: i.status,
      source: i.source, items: i.items, paymentUrl: i.paymentUrl, lastSyncedAt: i.lastSyncedAt,
    },
    resolution: resolutionViews(ws).find(r => r.invoiceId === i.id),
  };
}
