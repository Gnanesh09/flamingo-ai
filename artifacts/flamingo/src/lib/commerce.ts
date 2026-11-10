import type {
  CommerceOrder,
  CommerceProduct,
  CommerceState,
  CommerceTicket,
  CommerceTicketRefundState,
  CommerceTicketStatus,
  CommerceOrderStatus,
} from "@workspace/api-client-react";

export const CLOSED: CommerceTicketStatus[] = ["resolved", "rejected"];
export const isClosed = (t: CommerceTicket) => CLOSED.includes(t.status);

export function usd(n: number | undefined | null, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n ?? 0);
}
export function costUsd(n: number) {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
}
export function when(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function day(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function daysSince(s?: string) {
  if (!s) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000));
}
export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Tone = "coral" | "teal" | "amber" | "blue" | "plum" | "mute";

export const TICKET_STATUS: Record<CommerceTicketStatus, { label: string; tone: Tone; hint: string }> = {
  open: { label: "Open", tone: "blue", hint: "Flamingo is working with the customer." },
  awaiting_confirmation: { label: "Needs customer OK", tone: "amber", hint: "An exact proposal is waiting for the customer to confirm." },
  escalated: { label: "With a person", tone: "coral", hint: "Handed to KikoStore staff. A human decides next." },
  awaiting_return: { label: "Awaiting return receipt", tone: "plum", hint: "Return authorized, not a shipment booking. Stays open until the warehouse confirms receipt." },
  refund_pending: { label: "Refund pending", tone: "amber", hint: "Refund submitted. Waiting for the payment provider to settle." },
  resolved: { label: "Resolved", tone: "teal", hint: "Closed. Read only unless staff reopen it." },
  rejected: { label: "Declined", tone: "mute", hint: "Closed with a recorded reason. Staff can reopen." },
};

export const REFUND_STATE: Record<CommerceTicketRefundState, { label: string; tone: Tone; hint: string }> = {
  none: { label: "No refund", tone: "mute", hint: "No money has moved." },
  simulated: { label: "Simulated refund", tone: "plum", hint: "Sample order. No real or sandbox money moved." },
  submitted: { label: "Refund submitted", tone: "amber", hint: "Sent to PayPal Sandbox, not yet confirmed." },
  completed: { label: "Refund completed", tone: "teal", hint: "PayPal Sandbox confirmed the refund." },
  uncertain: { label: "Refund uncertain", tone: "coral", hint: "Provider response was unclear. Sync before acting again." },
  failed: { label: "Refund failed", tone: "coral", hint: "Provider rejected the refund. Nothing was returned." },
};

export const ORDER_STATUS: Record<CommerceOrderStatus, { label: string; tone: Tone }> = {
  created: { label: "Awaiting payment", tone: "amber" },
  paid: { label: "Paid", tone: "blue" },
  delivered: { label: "Delivered", tone: "teal" },
  refund_pending: { label: "Refund pending", tone: "amber" },
  refunded: { label: "Refunded", tone: "plum" },
  cancelled: { label: "Cancelled", tone: "mute" },
};

export const productOf = (s: CommerceState, id: string): CommerceProduct | undefined => s.products.find((p) => p.id === id);
export const orderOf = (s: CommerceState, id: string): CommerceOrder | undefined => s.orders.find((o) => o.id === id);
export const ticketForOrder = (s: CommerceState, orderId: string): CommerceTicket | undefined =>
  [...s.tickets].filter((t) => t.orderId === orderId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

export function errStatus(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}
export function errText(e: unknown): string {
  const data = (e as { data?: unknown } | null)?.data;
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; message?: unknown };
    if (typeof d.error === "string") return d.error;
    if (typeof d.message === "string") return d.message;
  }
  if (errStatus(e) === 409) return "This case changed while you were looking at it. The latest version is loaded; please try again.";
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}
export function retryAfterSeconds(e: unknown): number | null {
  if (errStatus(e) !== 429) return null;
  const err = e as { data?: { retryAfter?: number }; headers?: Headers };
  const v = err.data?.retryAfter ?? Number(err.headers?.get?.("retry-after"));
  return Number.isFinite(v) && v ? Number(v) : 10;
}
