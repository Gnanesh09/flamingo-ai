import type { Resolution, ResolutionKind, ResolutionStatus } from "@workspace/api-client-react";

export const KIND_LABEL: Record<ResolutionKind, string> = {
  needs_time: "Needs more time",
  dispute: "Something is wrong",
  already_paid: "Says already paid",
  question: "Has a question",
};

export const STATUS_LABEL: Record<ResolutionStatus, string> = {
  needs_review: "Needs your decision",
  waiting_customer: "Waiting on customer",
  committed: "Commitment in place",
  missed: "Commitment missed",
  verification_needed: "Check PayPal",
  resolved: "Resolved",
};

export const STATUS_STYLE: Record<ResolutionStatus, string> = {
  needs_review: "bg-primary text-primary-foreground",
  waiting_customer: "bg-muted text-muted-foreground",
  committed: "bg-accent text-accent-foreground",
  missed: "bg-coral/20 text-[hsl(12_70%_34%)]",
  verification_needed: "bg-sun/30 text-[hsl(30_70%_28%)]",
  resolved: "bg-lagoon text-[hsl(var(--card))]",
};

export type Bucket = "decide" | "waiting" | "committed" | "verified";

export function bucketOf(r: Resolution): Bucket {
  if (r.status === "resolved") return "verified";
  if (r.status === "committed") return "committed";
  if (r.status === "waiting_customer") return "waiting";
  return "decide";
}

export const BUCKETS: { id: Bucket; label: string; hint: string }[] = [
  { id: "decide", label: "Needs decision", hint: "Customer requests, missed promises and payment claims to check" },
  { id: "waiting", label: "Waiting", hint: "You replied or proposed a plan; the customer is next" },
  { id: "committed", label: "Commitments", hint: "Agreed date and amount. Reminders paused until then" },
  { id: "verified", label: "Verified", hint: "Closed by a PayPal sync, never by a claim" },
];

export function isConflict(e: unknown) {
  return (e as { status?: number } | null)?.status === 409;
}
