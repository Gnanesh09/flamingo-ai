"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { REFUND_STATE, TICKET_STATUS } from "@/lib/commerce";
import type { CommerceTicketRefundState, CommerceTicketStatus } from "@workspace/api-client-react";

export function KikoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="#d9396f" />
      <path d="M13 11v18M13 21l9-10M16.5 18.5 25 29" stroke="#fffcf9" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="28.5" cy="12.5" r="2.6" fill="#f6b73c" />
    </svg>
  );
}

export function FlamingoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18" fill="#2a2233" />
      <path d="M23 10c-3.5 0-5.5 2.6-5 5.4.4 2.3 3 3 3 5.4 0 2.6-3.6 3.6-6.5 2.4M21 23.5v7.5M21 31h4" stroke="#f48fb1" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M23 10l4.5 1.5-3 1.8" fill="#f6b73c" />
    </svg>
  );
}

export function KikoWordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <KikoMark className="h-8 w-8" />
      <span className={cn("text-[1.35rem] font-bold tracking-tight", light ? "text-[#fbeef0]" : "text-[var(--ks-ink)]")}>
        kiko<span className="text-[var(--ks-coral)]">store</span>
      </span>
    </span>
  );
}

export function Tone({ tone, children, className, "data-testid": testId }: { tone: string; children: ReactNode; className?: string; "data-testid"?: string }) {
  return <span className={cn("ks-chip", `ks-chip-${tone}`, className)} data-testid={testId}>{children}</span>;
}

/** Progressive disclosure: a one-line summary that expands to the full detail on tap. */
export function Reveal({
  summary, children, icon, className, tone = "mute", defaultOpen = false, testId,
}: {
  summary: ReactNode; children: ReactNode; icon?: ReactNode; className?: string;
  tone?: "mute" | "amber" | "plum" | "light"; defaultOpen?: boolean; testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("ks-reveal", `ks-reveal-${tone}`, className)} data-open={open || undefined}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid={testId}
        className="flex w-full min-w-0 items-center gap-1.5 text-left">
        {icon && <span className="shrink-0 opacity-80 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown className="ks-reveal-chev h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      <div className="ks-reveal-body"><div className="min-h-0 overflow-hidden"><div className="pt-1.5">{children}</div></div></div>
    </div>
  );
}

export function TicketStatusChip({ status }: { status: CommerceTicketStatus }) {
  const s = TICKET_STATUS[status];
  return <Tone tone={s.tone} data-testid={`status-ticket-${status}`}>{s.label}</Tone>;
}
export function RefundChip({ state }: { state: CommerceTicketRefundState }) {
  if (state === "none") return null;
  const s = REFUND_STATE[state];
  return <Tone tone={s.tone}>{s.label}</Tone>;
}

export function Stars({ rating, reviews }: { rating: number; reviews?: number }) {
  return (
    <span className="flex items-center gap-1 text-[0.78rem] text-[var(--ks-ink-2)]">
      <span className="flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={cn("h-3.5 w-3.5", rating >= i + 0.75 ? "fill-[var(--ks-saffron)] text-[var(--ks-saffron)]" : rating >= i + 0.25 ? "fill-[var(--ks-saffron)]/50 text-[var(--ks-saffron)]" : "text-[var(--ks-line-2)]")} />
        ))}
      </span>
      <span>{rating.toFixed(1)}</span>
      {reviews !== undefined && <span className="text-[var(--ks-mute)]">({reviews.toLocaleString()})</span>}
    </span>
  );
}

export function ProductImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("ks-product-img flex items-center justify-center overflow-hidden", className)}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-contain p-[8%]" onError={() => setBroken(true)} />
      ) : (
        <span className="text-3xl font-bold text-[var(--ks-coral)]/60">{alt.slice(0, 1)}</span>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, body, confirmLabel, onConfirm, pending, tone = "coral", children,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: ReactNode; confirmLabel: string;
  onConfirm: () => void; pending?: boolean; tone?: "coral" | "plum" | "gold"; children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ks border-[var(--ks-line)] bg-[var(--ks-paper)] sm:max-w-md" style={{ minHeight: 0 }}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription asChild><div className="text-sm leading-relaxed text-[var(--ks-ink-2)]">{body}</div></DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <button className="ks-btn ks-btn-ghost" onClick={() => onOpenChange(false)} data-testid="button-confirm-cancel">Not yet</button>
          <button className={cn("ks-btn", `ks-btn-${tone}`)} disabled={pending} onClick={onConfirm} data-testid="button-confirm-accept">
            {pending ? "Working..." : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Skeletons({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="ks-skel h-20" />)}
    </div>
  );
}
