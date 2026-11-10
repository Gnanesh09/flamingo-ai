"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, Database, ShieldAlert, ShieldCheck, Zap } from "lucide-react";
import { useGetAdmin, getGetAdminQueryKey, useGetSession, getGetSessionQueryKey } from "@workspace/api-client-react";
import { ActivityList } from "@/components/activity-list";
import { ErrorState, PageHeader, Panel, PanelHead, Skel } from "@/components/bits";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const isAdmin = session.data?.role === "admin";
  const q = useGetAdmin({ query: { queryKey: getGetAdminQueryKey(), enabled: isAdmin } });

  if (session.data && !isAdmin)
    return (
      <div className="grid place-items-center py-24 text-center">
        <ShieldAlert className="h-10 w-10 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">Admins only</h1>
        <p className="mt-1 text-sm text-muted-foreground">Switch to the admin role from the sidebar to view workspace operations.</p>
        <Link href="/app" className="mt-5 rounded-full bg-foreground px-5 py-2 text-sm text-background">Back to overview</Link>
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const pct = d ? Math.min(100, (d.groqCallsToday / Math.max(1, d.groqDailyLimit)) * 100) : 0;

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Workspace operations" sub="Integration health, AI budget and the safety rails that keep the sandbox honest." />
      <div className="grid gap-3 md:grid-cols-3">
        <Panel className="p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><Zap className="h-3.5 w-3.5 text-primary" /> Groq calls today</p>
          {d ? <>
            <p className="mt-1 text-3xl font-semibold tnum" data-testid="text-groq-calls">{d.groqCallsToday}<span className="text-base text-muted-foreground"> / {d.groqDailyLimit}</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full origin-left rounded-full", pct > 80 ? "bg-primary" : "bg-lagoon")} style={{ transform: `scaleX(${pct / 100})` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{d.groqCooldownSeconds}s cooldown between calls, one at a time.</p>
          </> : <Skel className="mt-2 h-16" />}
        </Panel>
        <Panel className="p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><Database className="h-3.5 w-3.5 text-primary" /> Storage</p>
          {d ? <p className="mt-1 text-2xl font-semibold" data-testid="text-storage">{d.storage}</p> : <Skel className="mt-2 h-8" />}
          <p className="mt-2 text-xs text-muted-foreground">Workspaces are isolated per browser session and persist across role switches.</p>
        </Panel>
        <Panel className="p-5">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Integrations</p>
          {d ? <p className="mt-1 text-2xl font-semibold tnum">{d.integrations.filter((i) => i.configured).length} of {d.integrations.length} configured</p> : <Skel className="mt-2 h-8" />}
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Panel>
            <PanelHead title="Integration status" />
            {!d ? <div className="p-4"><Skel className="h-32" /></div> : <ul>{d.integrations.map((i) => (
              <li key={i.id} className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                {i.configured ? <CheckCircle2 className="h-5 w-5 text-lagoon" /> : <CircleDashed className="h-5 w-5 text-muted-foreground" />}
                <div><p className="text-sm font-medium">{i.name} <span className="ml-1 font-mono text-[0.65rem] text-muted-foreground">{i.status}</span></p><p className="text-xs text-muted-foreground">{i.description}</p></div>
              </li>
            ))}</ul>}
          </Panel>
          <Panel>
            <PanelHead title="Safety rails" />
            {!d ? <div className="p-4"><Skel className="h-24" /></div> : <ul className="space-y-2 p-4 text-sm">{d.safety.map((s, i) => <li key={i} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lagoon" />{s}</li>)}</ul>}
          </Panel>
        </div>
        <Panel className="max-h-[70dvh] overflow-y-auto">
          <PanelHead title="Operations log" />
          {!d ? <div className="p-4"><Skel className="h-48" /></div> : d.activity.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No operations yet.</p> : <ActivityList items={d.activity} />}
        </Panel>
      </div>
    </div>
  );
}
