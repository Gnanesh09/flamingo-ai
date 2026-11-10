"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Loader2, Save } from "lucide-react";
import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings, type Settings, type SettingsReminderTone } from "@workspace/api-client-react";
import { ErrorState, PageHeader, Panel, PanelHead, Skel } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { useIntegrationFlags, useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { errMsg } from "@/lib/format";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const TONES: SettingsReminderTone[] = ["friendly", "professional", "firm"];
const GUIDE: Record<string, string> = {
  paypal: "Sends real invoices and PayPal's standard reminders. Custom reminder wording is not delivered by PayPal.",
  groq: "Powers the AI assistant and reminder drafts. Without it, offline demo rules and templates are used.",
  deepgram: "Speech-to-text and text-to-speech for the voice line.",
  mongo: "Persists workspaces. Without it, a local demo store is used.",
};

export default function SettingsPage() {
  const q = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const upd = useUpdateSettings();
  const flags = useIntegrationFlags();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const [f, setF] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data, f]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    if (f.businessName.trim().length < 2) return setError("Business name needs at least 2 characters.");
    const days = Number(f.minimumOverdueDays);
    if (!Number.isInteger(days) || days < 0 || days > 90) return setError("Minimum overdue days must be 0–90.");
    setError(null);
    try { const s = await upd.mutateAsync({ data: { ...f, businessName: f.businessName.trim(), senderEmail: f.senderEmail.trim(), minimumOverdueDays: days } }); setF(s); await refresh(); notify.ok("Settings saved"); }
    catch (err) { setError(errMsg(err)); }
  }

  return (
    <div>
      <PageHeader eyebrow="Settings" title="How Flamingo speaks for you" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Panel>
          <PanelHead title="Business" />
          {q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !f ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skel key={i} className="h-10" />)}</div> : (
            <form onSubmit={save} className="space-y-4 p-4">
              <label className="block text-sm"><span className="mb-1 block font-medium">Business name</span><input className={field} maxLength={80} value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} data-testid="input-business-name" /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium">Sender email</span><input className={field} maxLength={120} value={f.senderEmail} onChange={(e) => setF({ ...f, senderEmail: e.target.value })} data-testid="input-sender-email" /></label>
              <div className="text-sm"><span className="mb-1 block font-medium">Default reminder tone</span>
                <div className="flex gap-1 rounded-full border border-border bg-background p-1">{TONES.map((t) => <button type="button" key={t} onClick={() => setF({ ...f, reminderTone: t })} className={cn("flex-1 rounded-full py-1.5 capitalize", f.reminderTone === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")} data-testid={`button-tone-${t}`}>{t}</button>)}</div>
              </div>
              <label className="block text-sm"><span className="mb-1 block font-medium">Start nudging after (days overdue)</span><input type="number" min={0} max={90} className={field + " tnum"} value={f.minimumOverdueDays} onChange={(e) => setF({ ...f, minimumOverdueDays: Number(e.target.value) })} data-testid="input-min-days" /></label>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={upd.isPending} data-testid="button-save-settings">{upd.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save</Button>
            </form>
          )}
        </Panel>
        <Panel>
          <PanelHead title="Integrations" right={<span className="text-xs text-muted-foreground">credentials live in server secrets</span>} />
          {flags.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-14" />)}</div> : flags.isError ? <div className="p-4"><ErrorState error={flags.error} onRetry={() => flags.refetch()} /></div> : (
            <ul>{flags.list.map((i) => {
              const key = Object.keys(GUIDE).find((k) => i.id.toLowerCase().includes(k) || i.name.toLowerCase().includes(k));
              return (
                <li key={i.id} className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0" data-testid={`row-integration-${i.id}`}>
                  {i.configured ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-lagoon" /> : <CircleDashed className="mt-0.5 h-5 w-5 text-muted-foreground" />}
                  <div className="flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">{i.name}<span className={cn("rounded-full px-2 py-px text-[0.65rem]", i.configured ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{i.configured ? "credentials present" : "not configured"}</span></p>
                    <p className="text-xs text-muted-foreground">Status: {i.status}. {i.description}</p>
                    {key && <p className="mt-1 text-xs">{GUIDE[key]}</p>}
                    {!i.configured && <p className="mt-1 text-xs text-primary">Ask your workspace owner to add this provider's credentials as server secrets, then restart the API.</p>}
                  </div>
                </li>
              );
            })}</ul>
          )}
          <p className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">"Credentials present" means keys are set — not that a live call has succeeded. Check the status line for verification.</p>
        </Panel>
      </div>
    </div>
  );
}
