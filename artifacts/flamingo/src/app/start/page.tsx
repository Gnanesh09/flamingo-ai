"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Briefcase, Loader2, ShieldCheck } from "lucide-react";
import { useGetSession, getGetSessionQueryKey, useStartSession, type SessionInputRole } from "@workspace/api-client-react";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/format";

const ROLES: { id: SessionInputRole; title: string; body: string; icon: typeof Briefcase }[] = [
  { id: "business", title: "Business owner", body: "Resolution center, invoices, customer links, reminders and the assistant.", icon: Briefcase },
  { id: "admin", title: "Workspace admin", body: "Everything above, plus integration health, usage limits and safety rails.", icon: ShieldCheck },
];

export default function StartPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const start = useStartSession();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<SessionInputRole>("business");
  const [error, setError] = useState<string | null>(null);
  const valid = username.trim().length >= 2 && username.trim().length <= 40;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return setError("Pick a name between 2 and 40 characters.");
    setError(null);
    try {
      const s = await start.mutateAsync({ data: { username: username.trim(), role } });
      qc.clear();
      router.push(s.role === "admin" ? "/app/admin" : "/app");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  const existing = session.data?.active ? session.data : null;

  return (
    <div className="relative grid min-h-[100dvh] md:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-secondary md:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/flamingo-hero.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 to-transparent p-10 text-background">
          <p className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">Resolve unpaid invoices by asking, not chasing.</p>
          <p className="mt-2 max-w-sm text-sm text-background/75">A demo workspace for this browser. Choosing a role is demo access, not authentication. Sample invoices are loaded and labeled.</p>
        </div>
      </div>
      <div className="flex flex-col px-6 py-6 md:px-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Wordmark />
        </div>
        <form onSubmit={submit} className="rise mx-auto my-auto w-full max-w-md py-12">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Sandbox entry</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">What should we call you?</h1>

          {existing && (
            <button
              type="button"
              onClick={() => router.push(existing.role === "admin" ? "/app/admin" : "/app")}
              className="mt-6 flex w-full items-center justify-between rounded-2xl border border-lagoon/30 bg-accent px-4 py-3 text-left text-sm text-accent-foreground"
              data-testid="button-continue-session"
            >
              <span>Continue as <b>{existing.username}</b> ({existing.role})</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          <label className="mt-8 block text-sm font-medium" htmlFor="username">Display name</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={40}
            placeholder="e.g. Priya at Fieldnote Studio"
            className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/15"
            data-testid="input-username"
            autoFocus
          />

          <fieldset className="mt-7">
            <legend className="text-sm font-medium">Open as</legend>
            <div className="mt-2 grid gap-3">
              {ROLES.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all",
                    role === r.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40",
                  )}
                  data-testid={`option-role-${r.id}`}
                >
                  <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", role === r.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <r.icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-medium">{r.title}</span>
                    <span className="block text-sm text-muted-foreground">{r.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-start-error">{error}</p>}

          <button
            type="submit"
            disabled={start.isPending || !valid}
            className="group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-medium text-primary-foreground shadow-md transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
            data-testid="button-start-session"
          >
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enter the sandbox <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">Your demo workspace is isolated to this browser. Returning or switching roles keeps its saved data.</p>
        </form>
      </div>
    </div>
  );
}
