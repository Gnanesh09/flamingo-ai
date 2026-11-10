"use client";

import type { CommerceTicket } from "@workspace/api-client-react";
import { useCommerceState } from "@/hooks/use-commerce";
import { day, daysSince, orderOf, productOf, usd } from "@/lib/commerce";
import { ProductImage, RefundChip, Reveal, TicketStatusChip } from "@/components/commerce/kit";

export function OrderContext({ ticket }: { ticket: CommerceTicket }) {
  const s = useCommerceState();
  const o = orderOf(s, ticket.orderId);
  const p = o ? productOf(s, o.productId) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-[var(--ks-line)] px-4 py-3 sm:px-5">
      <ProductImage src={p?.image} alt={p?.name ?? "Order"} className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[14.5px] font-semibold tracking-tight">
          {p?.name ?? ticket.orderId}{o && o.quantity > 1 ? ` × ${o.quantity}` : ""}
        </h2>
        <Reveal className="max-w-md !text-[12px]" summary={o ? `${usd(o.amount)} · ${o.deliveredAt ? `Delivered ${daysSince(o.deliveredAt)}d ago` : "Not delivered"}` : "Order"}>
          <p className="text-[var(--ks-mute)]">
            Ordered {day(o?.createdAt)} · {o?.source === "sample" ? "Sample order" : "PayPal Sandbox"} · <span className="mono break-all">{ticket.orderId}</span>
          </p>
        </Reveal>
      </div>
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
        <TicketStatusChip status={ticket.status} />
        <RefundChip state={ticket.refundState} />
      </div>
    </div>
  );
}
