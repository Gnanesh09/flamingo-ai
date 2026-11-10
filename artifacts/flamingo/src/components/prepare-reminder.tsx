"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { usePrepareReminder, type ReminderInputTone } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNotify, useRefreshAll } from "@/hooks/use-flamingo";
import { cn } from "@/lib/utils";

const TONES: { id: ReminderInputTone; label: string; hint: string }[] = [
  { id: "friendly", label: "Friendly", hint: "Warm, assumes good faith" },
  { id: "professional", label: "Professional", hint: "Clear and neutral" },
  { id: "firm", label: "Firm", hint: "Direct, sets a date" },
];

export function PrepareReminderDialog({
  open,
  onOpenChange,
  invoiceId,
  label,
  defaultTone = "friendly",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: string;
  label: string;
  defaultTone?: ReminderInputTone;
}) {
  const [tone, setTone] = useState<ReminderInputTone>(defaultTone);
  const prep = usePrepareReminder();
  const refresh = useRefreshAll();
  const notify = useNotify();
  const router = useRouter();

  async function go() {
    try {
      await prep.mutateAsync({ data: { invoiceId, tone } });
      await refresh();
      notify.ok("Draft ready for review", "Nothing was sent. It's waiting in Reminders.");
      onOpenChange(false);
      router.push("/app/reminders");
    } catch (e) {
      notify.fail(e, "Couldn't draft a reminder");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Draft a reminder</DialogTitle>
          <DialogDescription>For {label}. It goes to your approval queue — never straight out.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {TONES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTone(t.id)}
              data-testid={`button-prep-tone-${t.id}`}
              className={cn("flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors", tone === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}
            >
              <span className="font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={go} disabled={prep.isPending} data-testid="button-prepare-reminder">
            {prep.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
