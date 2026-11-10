"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, CreditCard, Headset, Minus, PackageCheck, Plus, RotateCcw, SearchX, X } from "lucide-react";
import type { CommerceProduct } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCommerce, useCommerceState } from "@/hooks/use-commerce";
import { usd, uuid } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { ConfirmDialog, ProductImage, Reveal, Stars, Tone } from "@/components/commerce/kit";

export default function StorePage() {
  const s = useCommerceState();
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const cat = params.get("cat") ?? "all";
  const productId = params.get("product");
  const [sort, setSort] = useState<"featured" | "low" | "high" | "rating">("featured");

  const categories = useMemo(() => Array.from(new Set(s.products.map((p) => p.category))).sort(), [s.products]);
  const list = useMemo(() => {
    let l = s.products.filter((p) => (cat === "all" || p.category === cat) && (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)));
    if (sort === "low") l = [...l].sort((a, b) => a.price - b.price);
    if (sort === "high") l = [...l].sort((a, b) => b.price - a.price);
    if (sort === "rating") l = [...l].sort((a, b) => b.rating - a.rating);
    return l;
  }, [s.products, cat, q, sort]);
  const selected = s.products.find((p) => p.id === productId);

  const href = (next: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) v === null ? u.delete(k) : u.set(k, v);
    const str = u.toString();
    return str ? `/kikostore?${str}` : "/kikostore";
  };

  return (
    <main className="relative z-10">
      {/* category rail */}
      <div className="border-b border-[var(--ks-line)] bg-[var(--ks-paper)]">
        <div className="ks-scroll mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 py-2 text-sm">
          {["all", ...categories].map((c) => (
            <Link key={c} href={href({ cat: c === "all" ? null : c, product: null })} data-testid={`link-category-${c}`}
              className={cn("whitespace-nowrap rounded-full px-3.5 py-1.5 capitalize transition-colors", cat === c ? "bg-[var(--ks-ink)] text-[#fbf5f0]" : "text-[var(--ks-ink-2)] hover:bg-[#f3f2f6]")}>
              {c === "all" ? "Everything" : c}
            </Link>
          ))}
        </div>
      </div>

      {!q && cat === "all" && <Hero />}

      <section className="mx-auto max-w-[1400px] px-4 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ks-label">{q ? "Search" : cat === "all" ? "Catalog" : "Category"}</p>
            <h2 className="mt-1 text-2xl font-semibold capitalize tracking-tight" data-testid="text-results-title">
              {q ? <>Results for &ldquo;{params.get("q")}&rdquo;</> : cat === "all" ? "Popular now" : cat}
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--ks-mute)]">{list.length} items</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ks-ink-2)]">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="ks-input h-9 w-auto py-0" data-testid="select-sort">
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="rating">Sample rating</option>
            </select>
          </label>
        </div>

        {list.length === 0 ? (
          <div className="ks-card mt-6 flex flex-col items-center px-6 py-16 text-center">
            <SearchX className="h-10 w-10 text-[var(--ks-coral)]" />
            <h3 className="mt-4 text-lg font-semibold">Nothing matched that</h3>
            <p className="mt-1 max-w-sm text-sm text-[var(--ks-ink-2)]">The demo catalog has {s.products.length} items. Try a broader word, or browse everything.</p>
            <Link href="/kikostore" className="ks-btn ks-btn-ghost mt-5" data-testid="link-clear-search">Clear search</Link>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((p, i) => (
              <Link key={p.id} href={href({ product: p.id })} scroll={false} data-testid={`card-product-${p.id}`}
                className="ks-rise group flex flex-col rounded-2xl focus-visible:outline-offset-4" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="relative overflow-hidden rounded-2xl bg-[#f4f3f6]">
                  <ProductImage src={p.image} alt={p.name} className="aspect-square w-full transition-transform duration-500 group-hover:scale-[1.04]" />
                  {!p.returnable && <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[var(--ks-coral-d)]">Final sale</span>}
                </div>
                <div className="flex flex-1 flex-col px-1 pt-2.5">
                  <span className="line-clamp-2 text-[14.5px] font-medium leading-snug group-hover:underline group-hover:decoration-[var(--ks-line-2)] group-hover:underline-offset-4">{p.name}</span>
                  <div className="mt-1"><Stars rating={p.rating} reviews={p.reviews} /></div>
                  <span className="mt-1.5 text-[16px] font-semibold tabular-nums" data-testid={`text-price-${p.id}`}>{usd(p.price)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <PolicyBand days={s.policy.returnDays} auto={s.policy.automaticLimit} instant={s.policy.instantRefundLimit} />

      <ProductDialog product={selected} onClose={() => router.push(href({ product: null }), { scroll: false })} />
    </main>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-6">
      <div className="relative overflow-hidden rounded-[28px] bg-[#fdecf2] px-6 py-12 md:px-14 md:py-16">
        <div className="pointer-events-none absolute -right-20 -top-24 hidden h-[420px] w-[420px] rounded-full bg-[#f9d2e0] md:block" aria-hidden />
        <div className="pointer-events-none absolute right-24 bottom-[-120px] hidden h-[260px] w-[260px] rounded-full bg-[#f4b3ca]/60 md:block" aria-hidden />
        <div className="relative max-w-xl">
          <h1 className="text-[2.3rem] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[3.4rem]">
            Shop easy.<br /><span className="text-[var(--ks-coral)]">Returns in a minute.</span>
          </h1>
          <p className="mt-4 text-[1.02rem] text-[var(--ks-ink-2)]">Flamingo knows your order. Just say what went wrong.</p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/kikostore/orders" className="ks-btn ks-btn-coral h-11 px-5" data-testid="link-hero-orders">Your orders <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/flamingo-support" className="ks-btn ks-btn-ghost h-11 bg-white px-5" data-testid="link-hero-support"><Headset className="h-4 w-4" /> Get help</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function PolicyBand({ days, auto, instant }: { days: number; auto: number; instant: number }) {
  const items = [
    { icon: RotateCcw, t: `${days}-day returns`, d: `Up to ${usd(auto)}, approved on confirm.` },
    { icon: BadgeCheck, t: "Damaged on arrival", d: `Up to ${usd(instant)}, refunded instantly.` },
    { icon: Headset, t: "Real people", d: "Staff handle the rest." },
  ];
  return (
    <section className="mx-auto mt-12 max-w-[1400px] px-4">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--ks-line)] bg-[var(--ks-line)] md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="bg-[var(--ks-plum)] p-6 text-[#fbeef0]">
          <p className="ks-label !text-[#c9bfd3]">How help works</p>
          <p className="mt-2 text-lg font-semibold leading-snug">The rules Flamingo follows.</p>
          <Link href="/flamingo-portal?view=policy" className="mt-3 inline-flex items-center gap-1 text-sm text-[#f48fb1] hover:underline" data-testid="link-policy">View policy <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {items.map((it) => (
          <div key={it.t} className="bg-[var(--ks-paper)] p-6">
            <it.icon className="h-5 w-5 text-[var(--ks-coral)]" />
            <p className="mt-3 font-semibold">{it.t}</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ks-ink-2)]">{it.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductDialog({ product, onClose }: { product: CommerceProduct | undefined; onClose: () => void }) {
  const s = useCommerceState();
  const { run, busyAction } = useCommerce();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [paypalOpen, setPaypalOpen] = useState(false);
  const p = product;
  const sampleBusy = !!p && busyAction === `sample_purchase:${p.id}`;
  const payBusy = !!p && busyAction === `checkout:${p.id}`;

  const buySample = async () => {
    if (!p) return;
    try {
      const r = await run({ action: "sample_purchase", productId: p.id, quantity: qty, requestId: uuid() });
      router.push(`/kikostore/orders${r.orderId ? `?placed=${r.orderId}` : ""}`);
    } catch { /* toast shown */ }
  };
  const payPal = async () => {
    if (!p) return;
    try {
      const r = await run({ action: "checkout", productId: p.id, quantity: qty, requestId: uuid() });
      if (r.approvalUrl) window.location.assign(r.approvalUrl);
      else router.push(`/kikostore/orders${r.orderId ? `?checkout=${r.orderId}` : ""}`);
    } catch { setPaypalOpen(false); }
  };

  return (
    <Dialog open={!!p} onOpenChange={(v) => { if (!v) { setQty(1); onClose(); } }}>
      <DialogContent className="ks max-h-[92dvh] overflow-y-auto border-[var(--ks-line)] bg-[var(--ks-paper)] p-0 sm:max-w-4xl [&>button]:hidden" style={{ minHeight: 0 }}>
        {p && (
          <div className="grid md:grid-cols-[1.1fr_1fr]">
            <div className="relative">
              <ProductImage src={p.image} alt={p.name} className="aspect-square w-full md:h-full" />
              <button onClick={onClose} className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm" aria-label="Close" data-testid="button-close-product"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-col gap-4 p-6">
              <div>
                <span className="ks-label">{p.category}</span>
                <DialogTitle className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{p.name}</DialogTitle>
                <div className="mt-2"><Stars rating={p.rating} reviews={p.reviews} /></div>
              </div>
              <p className="text-sm leading-relaxed text-[var(--ks-ink-2)]">{p.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {p.returnable ? <Tone tone="teal">Returnable within {s.policy.returnDays} days</Tone> : <Tone tone="coral">Final sale</Tone>}
                {p.price > s.policy.automaticLimit && <Tone tone="amber">Returns reviewed by staff</Tone>}
              </div>

              <div className="rounded-xl border border-[var(--ks-line)] bg-white p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-semibold" data-testid="text-total">{usd(p.price * qty)}</span>
                  {qty > 1 && <span className="text-xs text-[var(--ks-mute)]">{usd(p.price)} each</span>}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-sm text-[var(--ks-ink-2)]">Quantity</span>
                  <div className="flex items-center rounded-full border border-[var(--ks-line-2)]">
                    <button className="flex h-8 w-8 items-center justify-center disabled:opacity-30" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Fewer" data-testid="button-qty-minus"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-6 text-center text-sm font-medium" data-testid="text-qty">{qty}</span>
                    <button className="flex h-8 w-8 items-center justify-center disabled:opacity-30" onClick={() => setQty((q) => Math.min(5, q + 1))} disabled={qty >= 5} aria-label="More" data-testid="button-qty-plus"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <span className="text-xs text-[var(--ks-mute)]">max 5</span>
                </div>
                <div className="mt-4 grid gap-2">
                  <button className="ks-btn ks-btn-gold h-11 w-full" onClick={() => void buySample()} disabled={sampleBusy || payBusy} data-testid="button-sample-purchase">
                    <PackageCheck className="h-4 w-4" /> {sampleBusy ? "Placing sample order..." : "Place sample order"}
                  </button>
                  <button className="ks-btn ks-btn-plum h-11 w-full" onClick={() => setPaypalOpen(true)} disabled={!s.paypalConfigured || sampleBusy || payBusy} data-testid="button-paypal-checkout">
                    <CreditCard className="h-4 w-4" /> Pay with PayPal Sandbox
                  </button>
                </div>
                <Reveal className="mt-3" summary="Test orders only. Nothing ships." testId="button-checkout-info">
                  <p className="text-[var(--ks-mute)]">
                    Sample orders are simulated and marked delivered instantly so you can try returns. PayPal Sandbox uses test money only.
                    {!s.paypalConfigured && " PayPal Sandbox is not configured on this server."}
                  </p>
                </Reveal>
              </div>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={paypalOpen} onOpenChange={setPaypalOpen} tone="plum" pending={payBusy}
          title="Leave KikoStore for PayPal Sandbox?"
          confirmLabel="Continue to PayPal Sandbox"
          onConfirm={() => void payPal()}
          body={<>
            <p>You will be sent to PayPal&apos;s Sandbox to approve {p ? usd(p.price * qty) : ""} with a sandbox test account. No real money moves.</p>
            <Reveal className="mt-2" summary="What happens after"><p>You come back to Your orders and confirm the capture yourself.</p></Reveal>
          </>}
        />
      </DialogContent>
    </Dialog>
  );
}
