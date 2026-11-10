import { cn } from "@/lib/utils";

/** Flamingo mark: one leg, one curve, one dot — drawn, not stock. */
export function FlamingoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-8 w-8", className)} aria-hidden>
      <circle cx="24" cy="24" r="23" fill="hsl(var(--primary))" />
      <path
        d="M29 11c-3.6 0-5.8 2.6-5.2 5.9.5 2.6 3.4 4.2 3.4 7.3 0 3.6-3.4 5.6-7.2 5.6-3 0-5.2-1.3-6-3.2 2.7 1.1 7.1.3 7.1-2.6 0-2.4-3.7-4.1-3.7-8.4C17.4 10.4 21.6 7 27 7c2.3 0 4.3.7 5.5 1.8L35 9.6l-2 2.1c-1-.5-2.4-.7-4-.7Z"
        fill="hsl(var(--card))"
      />
      <path d="M21 30v11M21 35l4 3" stroke="hsl(var(--card))" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="29.4" cy="10.6" r="1.1" fill="hsl(var(--primary))" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <FlamingoMark />
      <span className="text-[1.15rem] font-semibold tracking-tight">
        Flamingo<span className="text-primary">.</span>
        <span className="ml-1 rounded-md bg-foreground px-1.5 py-0.5 align-middle text-[0.62rem] font-medium uppercase tracking-[0.14em] text-background">
          AI
        </span>
      </span>
    </span>
  );
}
