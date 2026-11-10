"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Plus, ShoppingBag } from "lucide-react";
import { useCommerceState } from "@/hooks/use-commerce";
import { orderOf, productOf, when, TICKET_STATUS, isClosed } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { ProductImage, Reveal } from "@/components/commerce/kit";
import { ShieldCheck } from "lucide-react";
import { Landing, StartFromOrder } from "@/components/commerce/support/landing";
import { TicketView } from "@/components/commerce/support/ticket-view";

export default function SupportPage() {
  const s = useCommerceState();
  const params = useSearchParams();
  const ticketId = params.get("ticket");
  const orderId = params.get("order");
  const tickets = useMemo(() => [...s.tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [s.tickets]);
  const ticket = s.tickets.find((item) => item.id === ticketId);

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1320px] px-3 py-4 sm:px-6 lg:py-6">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="order-2 min-w-0 lg:sticky lg:top-6 lg:order-1">
          <div className="overflow-hidden rounded-[20px] border border-[var(--ks-line)] bg-[var(--ks-paper)]">
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
              <h2 className="text-[15px] font-semibold tracking-tight">Conversations</h2>
              <Link href="/kikostore/orders" aria-label="Choose an order" title="New request from an order" data-testid="link-orders"
                className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--ks-coral-l)] px-3 text-xs font-semibold text-[var(--ks-coral-d)] transition hover:bg-[#fadde7]">
                <Plus className="h-3.5 w-3.5" /> New
              </Link>
            </div>

            <div className="ks-scroll max-h-[50dvh] overflow-y-auto px-2 pb-2 lg:max-h-[calc(100dvh-16rem)]">
              {tickets.length === 0 && (
                <div className="mx-2 mb-2 rounded-2xl bg-[#f8f8fa] px-4 py-8 text-center">
                  <MessageCircle className="mx-auto h-5 w-5 text-[var(--ks-mute)]" />
                  <p className="mt-2 text-sm font-medium">No conversations yet</p>
                  <Link href="/kikostore/orders" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--ks-coral-d)] hover:underline">
                    <ShoppingBag className="h-3.5 w-3.5" /> Pick an order
                  </Link>
                </div>
              )}
              {tickets.map((t) => {
                const order = orderOf(s, t.orderId);
                const product = productOf(s, order?.productId ?? "");
                const last = t.messages[t.messages.length - 1];
                const selected = t.id === ticketId;
                const needsYou = t.status === "awaiting_confirmation";
                return (
                  <Link key={t.id}
                    href={`/flamingo-support?ticket=${encodeURIComponent(t.id)}&order=${encodeURIComponent(t.orderId)}`}
                    data-testid={`link-ticket-${t.id}`} aria-current={selected ? "page" : undefined}
                    className={cn("flex min-w-0 items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
                      selected ? "bg-[var(--ks-coral-l)]" : "hover:bg-[#f5f4f7]")}>
                    <ProductImage src={product?.image} alt={product?.name ?? "Order"} className="h-11 w-11 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn("min-w-0 flex-1 truncate text-[13.5px]", selected || needsYou ? "font-semibold" : "font-medium")}>{product?.name ?? t.orderId}</p>
                        <span className="shrink-0 text-[11px] text-[var(--ks-mute)]">{when(t.updatedAt)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ks-ink-2)]">{last?.text ?? "No messages yet"}</p>
                        {needsYou ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ks-coral)]" aria-label="Needs your OK" />
                        ) : isClosed(t) ? null : null}
                      </div>
                      <p className="sr-only" data-testid={`status-ticket-${t.status}`}>{TICKET_STATUS[t.status].label}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          <Reveal className="mt-3 hidden px-2 lg:block" icon={<ShieldCheck />} summary="Your order and chat stay together">
            <p>You never have to repeat order details.</p>
          </Reveal>
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          {ticket ? <TicketView key={ticket.id} ticket={ticket} /> : orderId ? <StartFromOrder orderId={orderId} /> : <Landing hasTickets={tickets.length > 0} />}
        </section>
      </div>
    </main>
  );
}
