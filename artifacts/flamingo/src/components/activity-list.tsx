"use client";

import Link from "next/link";
import type { Activity } from "@workspace/api-client-react";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const dot: Record<Activity["status"], string> = { success: "bg-lagoon", pending: "bg-sun", info: "bg-muted-foreground/50", error: "bg-destructive" };

export function ActivityList({ items }: { items: Activity[] }) {
  const groups = items.reduce<Record<string, Activity[]>>((acc, a) => {
    const k = new Date(a.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    (acc[k] ??= []).push(a);
    return acc;
  }, {});
  return (
    <div>
      {Object.entries(groups).map(([day, list]) => (
        <div key={day}>
          <p className="sticky top-0 bg-card/95 px-4 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground backdrop-blur">{day}</p>
          <ul className="relative ml-6 border-l border-border">
            {list.map((a) => (
              <li key={a.id} className="relative py-2.5 pl-5 pr-4" data-testid={`row-activity-${a.id}`}>
                <span className={cn("absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-card", dot[a.status])} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{a.title} <span className="ml-1 font-mono text-[0.65rem] text-muted-foreground">{a.type}</span></p>
                  <span className="text-xs text-muted-foreground">{dateTime(a.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{a.detail}</p>
                {a.invoiceId && <Link href={`/app/invoices/${a.invoiceId}`} className="text-xs text-primary hover:underline">View invoice</Link>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

