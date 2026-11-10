"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { useListActivity, getListActivityQueryKey } from "@workspace/api-client-react";
import { EmptyState, ErrorState, PageHeader, Panel, RowsSkeleton } from "@/components/bits";
import { ActivityList } from "@/components/activity-list";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "success", "pending", "info", "error"] as const;
export default function ActivityPage() {
  const q = useListActivity({ query: { queryKey: getListActivityQueryKey() } });
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");
  const items = (q.data ?? []).filter((a) => f === "all" || a.status === f);
  return (
    <div>
      <PageHeader eyebrow="Activity" title="The receipts" sub="Every draft, approval, send and sync — written down as it happened." />
      <div className="mb-4 flex gap-1">{FILTERS.map((x) => <button key={x} onClick={() => setF(x)} className={cn("rounded-full px-3 py-1.5 text-xs capitalize", f === x ? "bg-foreground text-background" : "bg-card text-muted-foreground")} data-testid={`filter-activity-${x}`}>{x}</button>)}</div>
      <Panel className="max-h-[75dvh] overflow-y-auto">
        {q.isLoading ? <RowsSkeleton /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : items.length === 0 ? <EmptyState icon={<History className="h-6 w-6" />} title="Nothing logged" body="Actions you take will appear here." /> : <ActivityList items={items} />}
      </Panel>
    </div>
  );
}
