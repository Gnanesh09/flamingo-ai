"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
    >
      <span className="min-w-0 flex-1 leading-relaxed">{message}</span>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 rounded-md p-0.5 hover:bg-red-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.16em] text-[#858995]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function StatusDot({
  color = "bg-emerald-500",
  pulse = false,
}: {
  color?: string;
  pulse?: boolean;
}) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-50",
            color,
          )}
        />
      )}

      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", color)}
      />
    </span>
  );
}
