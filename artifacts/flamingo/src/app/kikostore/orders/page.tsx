"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleDashed, CreditCard, Headset, PackageOpen, RotateCcw, XCircle } from "lucide-react";
import type { CommerceOrder } from "@workspace/api-client-react";
import { useCommerce, useCommerceState } from "@/hooks/use-commerce";
import { ORDER_STATUS, day, daysSince, productOf, ticketForOrder, usd, isClosed } from "@/lib/commerce";
import { ConfirmDialog, ProductImage, RefundChip, TicketStatusChip, Tone } from "@/components/commerce/kit";

export default function OrdersPage() {
  const s = useCommerceState();
  const params = useSearchParams();
  const checkoutId = params.get("checkout");
  const cancelId = params.get("cancel");
  const placedId = params.get("placed");
  const orders = useMemo(() => [...s.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [s.orders]);

  const totals = useMemo(() => {
    const live = (o: CommerceOrder) => o.status !== "created" && o.status !== "cancelled";
    const sample = s.orders.filter((o) => o.source === "sample" && live(o));
    const pp = s.orders.filter((o) => o.source === "paypal_sandbox" && live(o));
    return {
      sample: sample.reduce((n, o) => n + o.amount, 0), sampleN: sample.length,
      paypal: pp.reduce((n, o) => n + o.amount, 0), paypalN: pp.length,
    };
  }, [s.orders]);

  return (
    <main className="relative z-10 mx-auto max-w-[1100px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
                    <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Your orders</h1>
          <p className="mt-1 text-sm text-[var(--ks-ink-2)]">{s.customer}</p>
        </div>
        <div className="flex gap-2">
          <MoneyBox label="Sample orders" sub="simulated, no money" value={usd(totals.sample)} n={totals.sampleN} tone="plum" />
          <MoneyBox label="PayPal Sandbox" sub="test money captured" value={usd(totals.paypal)} n={totals.paypalN} tone="blue" />
        </div>
      </div>

      {checkoutId && <CapturePanel orderId={checkoutId} returned={!!params.get("token")} />}
      {cancelId && (
        <div className="ks-card ks-rise mt-6 flex items-center gap-3 border-[var(--ks-line-2)] p-4 text-sm">
          <XCircle className="h-5 w-5 text-[var(--ks-mute)]" />
          <span title={`Order ${cancelId} stays unpaid.`}>Payment cancelled. Nothing was charged.</span>
          <Link href="/kikostore/orders" className="ml-auto text-[var(--ks-coral-d)] hover:underline" data-testid="link-dismiss-cancel">Dismiss</Link>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="ks-card mt-8 flex flex-col items-center px-6 py-16 text-center">
          <PackageOpen className="h-10 w-10 text-[var(--ks-coral)]" />
          <h3 className="mt-4 text-lg font-semibold">No orders yet</h3>
          <p className="mt-1 text-sm text-[var(--ks-ink-2)]">Place a sample order to see how returns work.</p>
          <Link href="/kikostore" className="ks-btn ks-btn-coral mt-5" data-testid="link-shop">Start shopping</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o, i) => <OrderCard key={o.id} order={o} highlight={o.id === placedId || o.id === checkoutId} delay={i * 50} />)}
        </div>
      )}
    </main>
  );
}

function MoneyBox({ label, sub, value, n, tone }: { label: string; sub: string; value: string; n: number; tone: string }) {
  return (
    <div className="ks-card min-w-[140px] px-4 py-2.5" data-testid={`text-total-${tone}`}>
      <Tone tone={tone}>{label}</Tone>
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[0.7rem] text-[var(--ks-mute)]" title={sub}>{n} order{n === 1 ? "" : "s"}</p>
    </div>
  );
}

function CapturePanel({ orderId, returned }: { orderId: string; returned: boolean }) {
  const s = useCommerceState();
  const { run, busyAction } = useCommerce();
  const order = s.orders.find((o) => o.id === orderId);
  const [open, setOpen] = useState(false);
  const busy = busyAction === `capture:${orderId}`;
  if (!order) return null;
  const done = order.status !== "created" && order.status !== "cancelled";
  return (
    <div className="ks-card ks-rise mt-6 overflow-hidden border-[var(--ks-blue)]/30">
      <div className="flex flex-wrap items-center gap-4 bg-[var(--ks-blue-l)] p-5">
        {done ? <CheckCircle2 className="h-7 w-7 text-[var(--ks-teal)]" /> : <CreditCard className="h-7 w-7 text-[var(--ks-blue)]" />}
        <div className="flex-1">
          <p className="font-semibold">{done ? "PayPal Sandbox payment captured" : returned ? "Back from PayPal Sandbox" : "PayPal Sandbox order waiting"}</p>
          <p className="text-sm text-[var(--ks-ink-2)]">
            {done ? `${usd(order.amount)} in sandbox test money. Capture ${order.captureId ?? "recorded"}.` : `Approve on PayPal, then confirm here to capture ${usd(order.amount)} of sandbox test money. Safe to press twice.`}
          </p>
        </div>
        {!done && (
          <div className="flex gap-2">
            {order.approvalUrl && <button className="ks-btn ks-btn-ghost bg-white" onClick={() => window.location.assign(order.approvalUrl!)} data-testid="button-reopen-paypal">Open PayPal again</button>}
            <button className="ks-btn ks-btn-plum" onClick={() => setOpen(true)} data-testid="button-capture">Confirm capture</button>
          </div>
        )}
      </div>
      <ConfirmDialog open={open} onOpenChange={setOpen} tone="plum" pending={busy} title="Capture this sandbox payment?" confirmLabel={`Capture ${usd(order.amount)}`}
        onConfirm={() => { void run({ action: "capture", orderId }).then(() => setOpen(false), () => setOpen(false)); }}
        body={<p>This asks PayPal Sandbox to capture the approved order. Only sandbox test money is involved. If it was already captured, nothing happens twice.</p>} />
    </div>
  );
}

function OrderCard({ order: o, highlight, delay }: { order: CommerceOrder; highlight: boolean; delay: number }) {
  const s = useCommerceState();
  const { run, busyAction } = useCommerce();
  const router = useRouter();
  const p = productOf(s, o.productId);
  const t = ticketForOrder(s, o.id);
  const st = ORDER_STATUS[o.status];
  const age = daysSince(o.deliveredAt);
  const opening = busyAction === `open_ticket:${o.id}`;
  const canHelp = o.status !== "created" && o.status !== "cancelled";

  const openHelp = async () => {
    try {
      const r = await run({ action: "open_ticket", orderId: o.id });
      if (r.ticketId) router.push(`/flamingo-support?ticket=${r.ticketId}&order=${o.id}`);
    } catch { /* toast shown */ }
  };

  const helpLabel = opening ? "Opening..." : t ? "New request" : "Get help";
  return (
    <article className="ks-card ks-rise overflow-hidden" style={{ animationDelay: `${delay}ms`, outline: highlight ? "2px solid var(--ks-coral)" : undefined, outlineOffset: 2 }} data-testid={`card-order-${o.id}`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <ProductImage src={p?.image} alt={p?.name ?? o.productId} className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tone tone={st.tone}>{st.label}</Tone>
              {t && <TicketStatusChip status={t.status} />}
              {t && <RefundChip state={t.refundState} />}
            </div>
            <p className="mt-1.5 truncate text-[15.5px] font-medium">{p?.name ?? o.productId}{o.quantity > 1 && <span className="text-[var(--ks-mute)]"> × {o.quantity}</span>}</p>
            <p className="mt-0.5 text-[13px] text-[var(--ks-ink-2)]">
              <span className="font-medium text-[var(--ks-ink)]">{usd(o.amount, o.currency)}</span>
              {" · "}
              {o.status === "delivered" ? (age <= s.policy.returnDays ? `Delivered ${age}d ago · ${s.policy.returnDays - age}d left to return` : `Delivered ${day(o.deliveredAt)} · Return window closed`) : o.status === "created" ? "Payment not captured yet" : day(o.createdAt)}
            </p>
            {t?.returnCode && <p className="mt-1 text-[13px]">Return code <span className="mono font-medium">{t.returnCode}</span></p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-48">
          {o.status === "created" && o.source === "paypal_sandbox" && (
            <Link href={`/kikostore/orders?checkout=${o.id}`} className="ks-btn ks-btn-plum h-11" data-testid={`link-finish-payment-${o.id}`}><CircleDashed className="h-4 w-4" /> Finish payment</Link>
          )}
          {canHelp && t && !isClosed(t) ? (
            <Link href={`/flamingo-support?ticket=${t.id}&order=${o.id}`} className="ks-btn ks-btn-coral h-11" data-testid={`link-continue-case-${o.id}`}>
              <Headset className="h-4 w-4" /> Continue
            </Link>
          ) : canHelp ? (
            <button className="ks-btn ks-btn-coral h-11" onClick={() => void openHelp()} disabled={opening} data-testid={`button-return-refund-${o.id}`}>
              <Headset className="h-4 w-4" /> {helpLabel}
            </button>
          ) : null}
          <div className="flex items-center justify-center gap-3 text-[12.5px]">
            {t && isClosed(t) && (
              <Link href={`/flamingo-support?ticket=${t.id}&order=${o.id}`} className="font-medium text-[var(--ks-ink-2)] hover:text-[var(--ks-coral-d)]" data-testid={`link-view-case-${o.id}`}>Past case</Link>
            )}
            <Link href={`/kikostore?product=${o.productId}`} className="text-[var(--ks-ink-2)] hover:text-[var(--ks-coral-d)]" data-testid={`link-buy-again-${o.id}`}>Buy again</Link>
          </div>
        </div>
      </div>
      <Details o={o} />
    </article>
  );
}

function Details({ o }: { o: CommerceOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[var(--ks-line)] bg-[#fbfbfc] px-4 text-[12.5px] text-[var(--ks-ink-2)] sm:px-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between py-2 text-left hover:text-[var(--ks-ink)]">
        <span>Order details</span><span className="text-[var(--ks-mute)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <dl className="ks-fade-in grid grid-cols-2 gap-x-6 gap-y-1.5 pb-3 sm:grid-cols-4">
          <div><dt className="text-[var(--ks-mute)]">Placed</dt><dd>{day(o.createdAt)}</dd></div>
          <div><dt className="text-[var(--ks-mute)]">Paid with</dt><dd>{o.source === "sample" ? "Sample (simulated)" : "PayPal Sandbox"}</dd></div>
          <div className="col-span-2"><dt className="text-[var(--ks-mute)]">Order</dt><dd className="mono break-all">{o.id}</dd></div>
          {o.paymentNote && <div className="col-span-2 sm:col-span-4"><dt className="text-[var(--ks-mute)]">Note</dt><dd>{o.paymentNote}</dd></div>}
        </dl>
      )}
    </div>
  );
}
