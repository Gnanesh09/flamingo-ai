"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import type { InvoiceStatus, InvoiceSource, ReminderStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/format";

const statusStyle: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-accent text-accent-foreground border-lagoon/20",
  overdue: "bg-primary text-primary-foreground border-primary",
  partially_paid: "bg-sun/25 text-[hsl(30_70%_28%)] border-sun/40",
  paid: "bg-lagoon text-[hsl(var(--card))] border-lagoon",
  cancelled: "bg-transparent text-muted-foreground border-border line-through",
};

export function InvoiceStatusPill({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <span
      data-testid={`status-invoice-${status}`}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium capitalize leading-4",
        statusStyle[status],
        className,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const reminderStyle: Record<ReminderStatus, string> = {
  pending: "bg-sun/25 text-[hsl(30_70%_28%)]",
  approved: "bg-accent text-accent-foreground",
  rejected: "bg-muted text-muted-foreground line-through",
  sent: "bg-lagoon text-[hsl(var(--card))]",
  failed: "bg-destructive/10 text-destructive",
};

export function ReminderStatusPill({ status }: { status: ReminderStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-medium capitalize", reminderStyle[status])}>
      {status}
    </span>
  );
}

export function SourceTag({ source }: { source: InvoiceSource }) {
  const label = source === "demo" ? "Sample" : source === "local" ? "Local draft" : "PayPal";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] border border-dashed px-1.5 py-px font-mono text-[0.62rem] uppercase tracking-wider",
        source === "demo" ? "border-primary/50 text-primary" : source === "paypal" ? "border-lagoon/50 text-lagoon" : "border-border text-muted-foreground",
      )}
      title={source === "demo" ? "Sample/demo invoice — cannot be sent or synced to PayPal" : undefined}
    >
      {label}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rise mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-[2.2rem]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn("skel h-4", className)} />;
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skel className="h-4 w-20" />
          <Skel className="h-4 flex-1" />
          <Skel className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Couldn't load this" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-8 text-center" data-testid="state-error">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{errMsg(error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry">
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" data-testid="state-empty">
      <div className="relative grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary">
        <span className="absolute inset-0 rounded-full border border-dashed border-primary/40" />
        {icon}
      </div>
      <p className="text-lg font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-card-border bg-card shadow-sm", className)}>{children}</section>;
}

export function PanelHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {right}
    </div>
  );
}
