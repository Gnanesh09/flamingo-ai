"use client";

import type { Commitment, ResolutionMessage, ResolutionStatus } from "@workspace/api-client-react";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/resolution";
import { dateTime, money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ResolutionStatusPill({ status, className }: { status: ResolutionStatus; className?: string }) {
  return (
    <span data-testid={`status-resolution-${status}`} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium leading-4", STATUS_STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const COMMIT_LABEL: Record<Commitment["state"], string> = {
  proposed: "Proposed by owner, awaiting customer",
  accepted: "Agreed",
  fulfilled: "Fulfilled",
  missed: "Missed",
};

/** Requested vs agreed terms side by side. */
export function TermsCompare({ requestedDate, requestedAmount, commitment, currency = "USD" }: { requestedDate?: string; requestedAmount?: number; commitment?: Commitment; currency?: string }) {
  if (!requestedDate && !requestedAmount && !commitment) return null;
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2" data-testid="terms-compare">
      <div className="bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer asked for</p>
        {requestedDate || requestedAmount ? (
          <p className="mt-1.5 text-lg font-semibold tnum">{requestedAmount ? money(requestedAmount, currency) : "Amount not given"} <span className="font-normal text-muted-foreground">by</span> {requestedDate ? shortDate(requestedDate) : "no date"}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">No specific terms requested.</p>
        )}
      </div>
      <div className={cn("p-4", commitment?.state === "accepted" ? "bg-accent/60" : "bg-card")}>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{commitment ? COMMIT_LABEL[commitment.state] : "Agreed terms"}</p>
        {commitment ? (
          <p className="mt-1.5 text-lg font-semibold tnum">{money(commitment.amount, currency)} <span className="font-normal text-muted-foreground">by</span> {shortDate(commitment.date)}</p>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">Nothing agreed yet.</p>
        )}
      </div>
      <p className="bg-card px-4 py-2 text-xs text-muted-foreground sm:col-span-2">A commitment is a promise, not a guarantee. Nothing is debited automatically and the invoice due date does not change.</p>
    </div>
  );
}

export function Thread({ messages, viewer }: { messages: ResolutionMessage[]; viewer: "owner" | "customer" }) {
  if (messages.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>;
  return (
    <ol className="space-y-3" data-testid="thread">
      {messages.map((m) => {
        if (m.author === "system")
          return (
            <li key={m.id} className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span className="max-w-[80%] text-center">{m.text} · {dateTime(m.createdAt)}</span>
              <span className="h-px flex-1 bg-border" />
            </li>
          );
        const mine = m.author === viewer;
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", mine ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md border border-border bg-card")}>
              <p className={cn("text-[0.68rem] font-medium uppercase tracking-wider", mine ? "text-background/60" : "text-primary")}>
                {m.author === "owner" ? (viewer === "owner" ? "You" : "Business") : viewer === "customer" ? "You" : "Customer"}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
              <p className={cn("mt-1 text-[0.68rem]", mine ? "text-background/55" : "text-muted-foreground")}>{dateTime(m.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
