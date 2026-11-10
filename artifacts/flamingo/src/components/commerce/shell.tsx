"use client";

import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Headset, Package, RefreshCw, Search, ShieldCheck, ShoppingBag } from "lucide-react";
import { CommerceProvider, useCommerce } from "@/hooks/use-commerce";
import { errText } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { FlamingoMark, KikoMark, KikoWordmark } from "./kit";

type Surface = "store" | "orders" | "support" | "portal";

export function CommerceRoot({ surface, children }: { surface: Surface; children: ReactNode }) {
  return (
    <div className="ks ks-grain relative">
      <CommerceProvider>
        <Gate surface={surface}>{children}</Gate>
      </CommerceProvider>
    </div>
  );
}

function ConnBadge() {
  const { conn } = useCommerce();
  const map = {
    live: { c: "bg-[#3fbf9f]", t: "Live", pulse: true },
    connecting: { c: "bg-[var(--ks-saffron)]", t: "Connecting", pulse: false },
    reconnecting: { c: "bg-[var(--ks-saffron)]", t: "Reconnecting", pulse: false },
    idle: { c: "bg-[var(--ks-mute)]", t: "Offline", pulse: false },
  }[conn];
  return (
    <span className="flex items-center gap-1.5 text-[0.72rem]" data-testid="status-connection" title="Realtime updates over WebSocket. Data always reloads from the server.">
      <span className={cn("ks-pulse-dot", map.c, map.pulse && "live")} />
      {map.t}
    </span>
  );
}

function DemoStrip({ surface }: { surface: Surface }) {
  const staff = surface === "portal";
  const { state } = useCommerce();
  return (
    <div className="relative z-10 bg-[var(--ks-plum)] text-[#f3dfe4]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-1.5 text-[0.74rem]">
        <span className="flex items-center gap-1.5 font-medium text-[#fbeef0]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#f48fb1]" /> Demo
        </span>
        <span className="hidden opacity-70 md:inline" title={`Isolated session, sample catalog, no shipping. PayPal Sandbox test payments only${state && !state.paypalConfigured ? " (not configured here)" : ""}.`}>
          Test payments only
        </span>
        <div className="ml-auto flex items-center gap-3">
          {state && <ConnBadge />}
          <div className="flex rounded-full bg-white/10 p-0.5" role="tablist" aria-label="Demo role">
            <Link href="/kikostore" data-testid="link-role-customer" className={cn("rounded-full px-3 py-1 transition-colors", !staff ? "bg-[#fffcf9] text-[var(--ks-plum)] font-medium" : "hover:bg-white/10")}>
              Shopper view
            </Link>
            <Link href="/flamingo-portal" data-testid="link-role-staff" className={cn("rounded-full px-3 py-1 transition-colors", staff ? "bg-[#fffcf9] text-[var(--ks-plum)] font-medium" : "hover:bg-white/10")}>
              Staff view
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/kikostore?q=${encodeURIComponent(q.trim())}` : "/kikostore");
  };
  return (
    <form onSubmit={submit} className="flex h-11 flex-1 overflow-hidden rounded-full border border-[var(--ks-line-2)] bg-[#f4f3f6] transition focus-within:border-[var(--ks-coral)] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(217,57,111,.14)]" role="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search KikoStore" className="min-w-0 flex-1 bg-transparent px-5 text-[0.95rem] outline-none" data-testid="input-search" />
      <button type="submit" className="flex w-12 items-center justify-center text-[var(--ks-ink-2)] hover:text-[var(--ks-coral)]" aria-label="Search" data-testid="button-search">
        <Search className="h-5 w-5" />
      </button>
    </form>
  );
}

function Header({ surface }: { surface: Surface }) {
  const path = usePathname();
  const customerNav = [
    { href: "/kikostore", label: "Shop", icon: ShoppingBag },
    { href: "/kikostore/orders", label: "Your orders", icon: Package },
    { href: "/flamingo-support", label: "Help with Flamingo", icon: Headset },
  ];
  if (surface === "portal") {
    return (
      <header className="relative z-10 border-b border-[var(--ks-line)] bg-[var(--ks-paper)]">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3">
          <Link href="/flamingo-portal" className="flex items-center gap-2" data-testid="link-portal-home">
            <FlamingoMark className="h-8 w-8" />
            <span className="leading-tight">
              <span className="block text-[1.05rem] font-semibold">Flamingo Desk</span>
              <span className="block text-[0.7rem] text-[var(--ks-mute)]">KikoStore support staff</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/kikostore" className="rounded-full px-3 py-1.5 text-[var(--ks-ink-2)] hover:bg-[#f3f2f6]" data-testid="link-nav-store">Storefront</Link>
            <Link href="/flamingo-support" className="rounded-full px-3 py-1.5 text-[var(--ks-ink-2)] hover:bg-[#f3f2f6]" data-testid="link-nav-support">Customer help</Link>
          </nav>
        </div>
      </header>
    );
  }
  return (
    <header className="relative z-10 border-b border-[var(--ks-line)] bg-[var(--ks-paper)]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/kikostore" data-testid="link-home"><KikoWordmark /></Link>
        <div className="order-3 w-full md:order-none md:w-auto md:flex-1"><StoreSearch /></div>
        <nav className="ml-auto flex items-center gap-1">
          {customerNav.map((n) => {
            const on = n.href === "/kikostore" ? path === "/kikostore" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.split(" ").pop()?.toLowerCase()}`}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors", on ? "bg-[var(--ks-coral-l)] text-[var(--ks-coral-d)] font-medium" : "text-[var(--ks-ink-2)] hover:bg-[#f3f2f6]")}>
                <n.icon className="h-4 w-4" /> <span className="hidden sm:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function Welcome() {
  const { startDemo, starting } = useCommerce();
  return (
    <main className="relative z-10 mx-auto grid min-h-[80dvh] max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-[1.1fr_1fr]">
      <div className="ks-rise">
        <KikoWordmark />
        <h1 className="mt-8 text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[3.2rem]">
          Shop like normal.<br /><span className="text-[var(--ks-coral)]">Help that knows your order.</span>
        </h1>
        <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-[var(--ks-ink-2)]">
          A private store with three past orders. Ask Flamingo for a refund by text or voice, then see what it did from the staff desk.
        </p>
        <button className="ks-btn ks-btn-coral mt-8 h-12 px-6 text-base" onClick={() => void startDemo()} disabled={starting} data-testid="button-start-demo">
          {starting ? "Setting up your store..." : "Open my demo store"} <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-4 text-xs text-[var(--ks-mute)]" title="Not production auth. Your session is isolated and seeded with sample data.">No sign-in needed.</p>
      </div>
      <div className="ks-rise ks-card relative overflow-hidden p-6" style={{ animationDelay: ".1s" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--ks-coral-l)]" />
        <div className="relative space-y-3 text-sm">
          {[
            ["Shopper", "My lamp arrived with a cracked base."],
            ["Flamingo", "Order KS-lamp, delivered 6 days ago, $45.00. That is within the damaged-item policy. I can refund $45.00 now. Confirm?"],
            ["Shopper", "Yes, go ahead."],
          ].map(([who, text], i) => (
            <div key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", who === "Shopper" ? "ml-auto bg-[var(--ks-plum)] text-[#fbeef0]" : "bg-[#f4f3f6]")}>
              <div className="mb-0.5 text-[0.68rem] uppercase tracking-wider opacity-60">{who}</div>
              {text}
            </div>
          ))}
          <p className="pt-2 text-[0.7rem] text-[var(--ks-mute)]">Example conversation</p>
        </div>
      </div>
    </main>
  );
}

function Gate({ surface, children }: { surface: Surface; children: ReactNode }) {
  const { state, loading, needsSession, loadError, refetch } = useCommerce();
  let body: ReactNode;
  if (state) body = <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
  else if (loading) body = <PageSkeleton />;
  else if (needsSession) body = <Welcome />;
  else
    body = (
      <div className="relative z-10 mx-auto max-w-md px-6 py-24 text-center">
        <KikoMark className="mx-auto h-12 w-12 opacity-80" />
        <h2 className="mt-5 text-xl font-semibold">KikoStore could not load</h2>
        <p className="mt-2 text-sm text-[var(--ks-ink-2)]">{errText(loadError)}</p>
        <button className="ks-btn ks-btn-coral mt-6" onClick={refetch} data-testid="button-retry"><RefreshCw className="h-4 w-4" /> Try again</button>
      </div>
    );
  return (
    <>
      <DemoStrip surface={surface} />
      <Header surface={surface} />
      {body}
      <Footer />
    </>
  );
}

function PageSkeleton() {
  return (
    <div className="relative z-10 mx-auto max-w-[1400px] space-y-4 px-4 py-8">
      <div className="ks-skel h-40" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="ks-skel h-64" />)}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mt-16 border-t border-[var(--ks-line)] bg-[var(--ks-paper)]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-[var(--ks-mute)]">
        <span className="flex items-center gap-2"><KikoMark className="h-5 w-5" /> KikoStore demo, support by Flamingo AI</span>
        <Link href="/kikostore" className="hover:text-[var(--ks-ink)]">Store</Link>
        <Link href="/kikostore/orders" className="hover:text-[var(--ks-ink)]">Orders</Link>
        <Link href="/flamingo-support" className="hover:text-[var(--ks-ink)]">Support</Link>
        <Link href="/flamingo-portal" className="hover:text-[var(--ks-ink)]">Staff desk</Link>
        <span className="ml-auto">Sample data. Nothing ships.</span>
      </div>
    </footer>
  );
}
