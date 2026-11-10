"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Headset, LoaderCircle, MessageCircle, ShieldCheck, ShoppingBag } from "lucide-react";
import { useCommerce, useCommerceState } from "@/hooks/use-commerce";
import { day, orderOf, productOf, usd, when } from "@/lib/commerce";
import { FlamingoMark, ProductImage } from "@/components/commerce/kit";
import { InlineError, SectionLabel, StatusDot } from "./ui";
import Link from "next/link";

export function Landing({ hasTickets }: { hasTickets: boolean }) {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-[#E9EAED] bg-white px-6 py-14 text-center shadow-[0_2px_12px_rgba(20,20,30,0.025)] sm:min-h-[580px] sm:px-12">
      <div className="relative">
        <div className="absolute -inset-5 rounded-full bg-[#FDECF2]" />

        <div className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[25px] border border-[#F6D3E0] bg-white shadow-[0_8px_30px_rgba(217,57,111,0.08)]">
          <FlamingoMark className="h-12 w-12" />
        </div>
      </div>

      <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E9EAED] bg-[#F8F9FB] px-3 py-1.5">
        <StatusDot />

        <span className="text-[11px] font-medium text-[#626671]">
          Flamingo Support
        </span>
      </div>

      <h1 className="mt-5 max-w-lg text-3xl font-semibold tracking-[-0.045em] text-[#191919] sm:text-[40px] sm:leading-[1.15]">
        Let&apos;s get things
        <br />
        <span className="text-[#D9396F]">sorted out.</span>
      </h1>

      <p className="mt-4 max-w-md text-sm leading-7 text-[#747780] sm:text-[15px]">
        Returns, refunds, delivery. Pick the order.
      </p>

      <Link
        href="/kikostore/orders"
        data-testid="link-choose-order"
        className="mt-8 inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-[#D9396F] px-6 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(217,57,111,0.16)] transition hover:bg-[#B92A5B] active:scale-[0.98]"
      >
        <ShoppingBag className="h-4 w-4" />
        Choose an order
        <ArrowRight className="h-4 w-4" />
      </Link>

      {hasTickets && (
        <p className="mt-5 text-xs text-[#858995]">
          Or pick up a recent conversation.
        </p>
      )}

      <div className="mt-12 grid w-full max-w-lg grid-cols-1 gap-3 border-t border-[#E9EAED] pt-7 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: "Order-aware",
            description: "No need to repeat order details.",
          },
          {
            icon: MessageCircle,
            title: "One conversation",
            description: "Everything stays together.",
          },
          {
            icon: Headset,
            title: "Human support",
            description: "Ask a person when needed.",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="flex items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F7F8FA] text-[#626671]">
                <Icon className="h-4 w-4" />
              </div>

              <div>
                <p className="text-xs font-semibold text-[#30243A]">
                  {item.title}
                </p>

                <p className="mt-1 text-[11px] leading-relaxed text-[#858995]">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   START FROM ORDER
   ========================================================= */

export function StartFromOrder({ orderId }: { orderId: string }) {
  const s = useCommerceState();

  const { run, busyAction } = useCommerce();

  const router = useRouter();

  const o = orderOf(s, orderId);

  const p = o ? productOf(s, o.productId) : undefined;

  const tried = useRef<string | null>(null);

  const runRef = useRef(run);

  runRef.current = run;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !o ||
      tried.current === o.id ||
      o.status === "created" ||
      o.status === "cancelled"
    ) {
      return;
    }

    tried.current = o.id;

    void runRef
      .current({
        action: "open_ticket",
        orderId: o.id,
      })
      .then((result) => {
        if (result.ticketId) {
          router.replace(
            `/flamingo-support?ticket=${encodeURIComponent(result.ticketId)}&order=${encodeURIComponent(o.id)}`,
          );
        } else {
          setError(
            "We couldn't open a conversation for this order. Please try again.",
          );
        }
      })
      .catch(() => {
        setError(
          "We couldn't open a conversation for this order. Please try again.",
        );
      });
  }, [o, router]);

  if (!o) {
    return <Landing hasTickets={s.tickets.length > 0} />;
  }

  const busy = busyAction === `open_ticket:${o.id}`;

  const openConversation = async () => {
    if (busy) return;

    setError(null);

    try {
      const result = await run({
        action: "open_ticket",
        orderId: o.id,
      });

      if (result.ticketId) {
        router.replace(
          `/flamingo-support?ticket=${encodeURIComponent(result.ticketId)}&order=${encodeURIComponent(o.id)}`,
        );
      } else {
        setError("We couldn't open a conversation. Please try again.");
      }
    } catch {
      setError("We couldn't open a conversation. Please try again.");
    }
  };

  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center rounded-3xl border border-[#E9EAED] bg-white px-6 py-12 text-center shadow-sm sm:px-12">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FDECF2] text-[#B92A5B]">
        {busy ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </div>

      <SectionLabel>Order support</SectionLabel>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#191919] sm:text-3xl">
        Get help with your order
      </h1>

      <div className="mt-7 flex w-full max-w-md items-center gap-4 rounded-2xl border border-[#E9EAED] bg-[#F8F9FB] p-4 text-left">
        <ProductImage
          src={p?.image}
          alt={p?.name ?? o.id}
          className="h-[72px] w-[72px] shrink-0 rounded-xl border border-[#E9EAED] bg-white"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#191919]">
            {p?.name ?? "Your order"}
          </p>

          <p className="mt-1 text-xs text-[#747780]">
            {usd(o.amount)} · {day(o.createdAt)}
          </p>

          <p className="mt-1 truncate font-mono text-[10px] text-[#858995]">
            {o.id}
          </p>
        </div>
      </div>


      {error && (
        <div className="mt-5 w-full max-w-md">
          <InlineError message={error} />
        </div>
      )}

      <button
        type="button"
        onClick={() => void openConversation()}
        disabled={busy}
        data-testid="button-open-ticket"
        className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D9396F] px-6 text-sm font-semibold text-white transition hover:bg-[#B92A5B] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Opening...
          </>
        ) : (
          <>
            Start a conversation
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
