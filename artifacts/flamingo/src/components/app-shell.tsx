"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  AudioLines,
  FlaskConical,
  Inbox,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  ReceiptText,
  Repeat,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  useEndSession,
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetSession,
  useListResolutions,
  getListResolutionsQueryKey,
  getGetSessionQueryKey,
  useStartSession,
} from "@workspace/api-client-react";
import { Wordmark } from "@/components/brand";
import { Skel } from "@/components/bits";
import { useIntegrationFlags, useNotify } from "@/hooks/use-flamingo";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/app/resolutions", label: "Resolution center", icon: MessagesSquare, decide: true },
  { href: "/app/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/reminders", label: "Reminders", icon: Inbox, badge: true },
  { href: "/app/assistant", label: "Assistant", icon: AudioLines },
  { href: "/app/activity", label: "Activity", icon: ActivityIcon },
  { href: "/app/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const notify = useNotify();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const active = !!session.data?.active;
  const dash = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), enabled: active } });
  const res = useListResolutions({ query: { queryKey: getListResolutionsQueryKey(), enabled: active } });
  const flags = useIntegrationFlags();
  const end = useEndSession();
  const start = useStartSession();

  useEffect(() => {
    if (session.isError || (session.data && !session.data.active)) router.replace("/start");
  }, [session.isError, session.data, router]);

  if (!active) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <div className="flex w-64 flex-col items-center gap-3">
          <Skel className="h-10 w-10 rounded-full" />
          <Skel className="h-3 w-40" />
          <p className="text-xs text-muted-foreground">Checking your sandbox session</p>
        </div>
      </div>
    );
  }
  const s = session.data!;
  const isAdmin = s.role === "admin";
  const nav = isAdmin ? [...NAV, { href: "/app/admin", label: "Admin", icon: ShieldCheck }] : NAV;
  const pending = dash.data?.pendingApprovals ?? 0;
  const decideCount = (res.data ?? []).filter((r) => ["needs_review", "missed", "verification_needed"].includes(r.status)).length;
  const configured = flags.list.filter((i) => i.configured).length;

  async function logout() {
    try {
      await end.mutateAsync();
      qc.clear();
      router.push("/");
    } catch (e) {
      notify.fail(e, "Couldn't end session");
    }
  }
  async function switchRole() {
    const role = isAdmin ? "business" : "admin";
    try {
      await start.mutateAsync({ data: { username: s.username, role } });
      qc.clear();
      router.push(role === "admin" ? "/app/admin" : "/app");
    } catch (e) {
      notify.fail(e, "Couldn't switch role");
    }
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname?.startsWith(href));

  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <Link href="/" className="px-5 pb-4 pt-5" data-testid="link-home">
          <Wordmark />
        </Link>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((n) => {
            const on = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`link-nav-${n.label.toLowerCase().replace(/ /g, "-")}`}
                className={cn(
                  "group relative flex min-h-10 items-center gap-3 rounded-full px-4 py-2 text-sm transition-colors",
                  on ? "bg-primary/10 font-medium text-primary" : "text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
                )}
              >
                                <n.icon className={cn("h-4 w-4 transition-transform group-hover:-rotate-6", on && "text-primary")} />
                <span className="flex-1">{n.label}</span>
                {"decide" in n && n.decide && decideCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold text-primary-foreground tnum" data-testid="badge-decide">{decideCount}</span>
                )}
                {"badge" in n && n.badge && pending > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[0.65rem] font-semibold text-primary-foreground tnum" data-testid="badge-pending">
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-xl border border-dashed border-primary/40 bg-card/70 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-primary">
            <FlaskConical className="h-3.5 w-3.5" /> Sandbox demo
          </p>
          <p className="mt-1 text-muted-foreground">
            {configured} of {flags.list.length || "—"} integrations connected. No real money moves here.
          </p>
        </div>
        <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">{initials(s.username)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" data-testid="text-username">{s.username}</p>
            <p className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">{s.role} · demo</p>
          </div>
          <button onClick={switchRole} disabled={start.isPending} title={`Switch to ${isAdmin ? "business" : "admin"}`} className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" data-testid="button-switch-role">
            <Repeat className="h-4 w-4" />
          </button>
          <button onClick={logout} disabled={end.isPending} title="End session" className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" data-testid="button-logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* mobile bar */}
        <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/"><Wordmark /></Link>
            <div className="flex gap-1">
              <button onClick={switchRole} className="rounded-lg p-2" aria-label="Switch role"><Repeat className="h-4 w-4" /></button>
              <button onClick={logout} className="rounded-lg p-2" aria-label="End session"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-xs", isActive(n.href) ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 border-b border-dashed border-primary/30 bg-secondary/60 px-4 py-1.5 text-[0.72rem] text-secondary-foreground md:px-8" data-testid="banner-sandbox">
          <FlaskConical className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <b className="font-medium">Sandbox demo.</b> Sample invoices are labeled. Nothing is sent or charged unless an integration is connected and you confirm it.
          </span>
        </div>
        <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
