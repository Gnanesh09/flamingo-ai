"use client";

import { useMemo } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type RowClickedEvent } from "ag-grid-community";
import type { CommerceState, CommerceTicket } from "@workspace/api-client-react";
import { costUsd, orderOf, productOf, usd, when } from "@/lib/commerce";
import { ProductImage, TicketStatusChip } from "@/components/commerce/kit";
import { cn } from "@/lib/utils";

ModuleRegistry.registerModules([AllCommunityModule]);

export const flamingoGridTheme = themeQuartz.withParams({
  fontFamily: "var(--font-rubik), Rubik, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 500,
  accentColor: "#d9396f",
  backgroundColor: "#fefeff",
  foregroundColor: "#1d1b22",
  textColor: "#1d1b22",
  subtleTextColor: "#77737f",
  borderColor: "#ebeaef",
  headerBackgroundColor: "#f8f8fa",
  headerTextColor: "#77737f",
  rowHoverColor: "#fbf6f8",
  selectedRowBackgroundColor: "#fdecf2",
  oddRowBackgroundColor: "#fefeff",
  wrapperBorderRadius: 16,
  borderRadius: 8,
  spacing: 7,
  rowBorder: { color: "#f1f0f4" },
  columnBorder: false,
  headerColumnResizeHandleColor: "#dcdbe2",
  inputFocusBorder: { color: "#d9396f" },
});

type CaseRow = {
  id: string;
  ticket: CommerceTicket;
  customer: string;
  product: string;
  image?: string;
  reason: string;
  amount: number;
  assigned: string;
  updated: string;
  evidence: number;
  assessment: "damage" | "clear" | "unclear" | "pending" | "none";
  cost: number;
};

const ASSESS_LABEL: Record<CaseRow["assessment"], { label: string; cls: string }> = {
  damage: { label: "Damage seen", cls: "bg-[#FDE4DF] text-[#B93428]" },
  clear: { label: "No damage", cls: "bg-[#DCF1EC] text-[#1F6F62]" },
  unclear: { label: "Unclear", cls: "bg-[#FDF0D6] text-[#8A5A12]" },
  pending: { label: "Processing", cls: "bg-[#F2F0F3] text-[#626671]" },
  none: { label: "", cls: "" },
};

function assessOf(t: CommerceTicket): CaseRow["assessment"] {
  const ev = t.evidence ?? [];
  if (!ev.length) return "none";
  if (ev.some((e) => e.assessment === "visible_damage")) return "damage";
  if (ev.some((e) => e.status === "processing")) return "pending";
  if (ev.some((e) => e.assessment === "unclear")) return "unclear";
  if (ev.some((e) => e.assessment === "no_visible_damage")) return "clear";
  return "pending";
}

function CaseCell(p: CustomCellRendererProps<CaseRow>) {
  const r = p.data;
  if (!r) return null;
  return (
    <span className="flex h-full min-w-0 items-center gap-2.5" data-testid={`row-ticket-${r.id}`}>
      <ProductImage src={r.image} alt={r.product} className="h-8 w-8 shrink-0 rounded-lg border border-[var(--ks-line)]" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-medium">{r.product}</span>
        <span className="block truncate text-[11px] capitalize text-[var(--ks-mute)]">{r.reason.replaceAll("_", " ") || r.customer}</span>
      </span>
    </span>
  );
}

function StatusCell(p: CustomCellRendererProps<CaseRow>) {
  if (!p.data) return null;
  return (
    <span className="flex h-full items-center gap-1">
      <TicketStatusChip status={p.data.ticket.status} />
    </span>
  );
}

function EvidenceCell(p: CustomCellRendererProps<CaseRow>) {
  const r = p.data;
  if (!r) return null;
  if (!r.evidence) return <span className="text-[var(--ks-mute)]">-</span>;
  const a = ASSESS_LABEL[r.assessment];
  return (
    <span className="flex h-full items-center gap-1.5">
      <span className="mono tabular-nums">{r.evidence}</span>
      {a.label && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none", a.cls)}>{a.label}</span>}
    </span>
  );
}

export function CaseGrid({
  s, tickets, quick, selectedId, onOpen,
}: {
  s: CommerceState; tickets: CommerceTicket[]; quick: string; selectedId?: string; onOpen: (id: string) => void;
}) {
  const rows = useMemo<CaseRow[]>(
    () =>
      tickets.map((t) => {
        const o = orderOf(s, t.orderId);
        const p = o ? productOf(s, o.productId) : undefined;
        return {
          id: t.id,
          ticket: t,
          customer: s.customer,
          product: p?.name ?? t.orderId,
          image: p?.image,
          reason: t.reason || t.messages[t.messages.length - 1]?.text || "",
          amount: o?.amount ?? 0,
          assigned: t.assignedTo ?? "",
          updated: t.updatedAt,
          evidence: t.evidence?.length ?? 0,
          assessment: assessOf(t),
          cost: t.estimatedCost,
        };
      }),
    [s, tickets],
  );

  const cols = useMemo<ColDef<CaseRow>[]>(
    () => [
      { headerName: "Case", field: "product", cellRenderer: CaseCell, minWidth: 190, flex: 1.6, getQuickFilterText: (p) => `${p.data?.product} ${p.data?.customer} ${p.data?.reason} ${p.data?.id}` },
      { headerName: "Status", colId: "status", valueGetter: (p) => p.data?.ticket.status, cellRenderer: StatusCell, minWidth: 130, flex: 1 },
      { headerName: "Amount", field: "amount", type: "rightAligned", width: 96, valueFormatter: (p) => usd(p.value), cellClass: "font-semibold tabular-nums" },
      { headerName: "Assigned", field: "assigned", width: 120, hide: true, valueFormatter: (p) => p.value || "Flamingo", cellClass: (p) => (p.value ? "" : "text-[var(--ks-mute)]") },
      { headerName: "Photos", field: "evidence", cellRenderer: EvidenceCell, width: 96 },
      { headerName: "AI cost", field: "cost", type: "rightAligned", width: 104, hide: true, valueFormatter: (p) => costUsd(p.value), cellClass: "mono tabular-nums text-[var(--ks-ink-2)]" },
      { headerName: "Updated", field: "updated", width: 100, sort: "desc", valueFormatter: (p) => when(p.value), cellClass: "text-[var(--ks-mute)]" },
    ],
    [],
  );

  return (
    <div className="ks-grid h-[420px] w-full xl:h-[calc(100dvh-210px)] xl:min-h-[420px]" data-testid="grid-cases">
      <AgGridReact<CaseRow>
        theme={flamingoGridTheme}
        rowData={rows}
        columnDefs={cols}
        defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
        getRowId={(p) => p.data.id}
        quickFilterText={quick}
        rowHeight={52}
        headerHeight={38}
        animateRows
        tooltipShowDelay={400}
        rowClassRules={{ "ks-row-sel": (p) => p.data?.id === selectedId }}
        onRowClicked={(e: RowClickedEvent<CaseRow>) => e.data && onOpen(e.data.id)}
        overlayNoRowsTemplate='<span style="color:#77737f">No cases match.</span>'
      />
    </div>
  );
}

type CostRow = { id: string; product: string; ticket: CommerceTicket; aiCalls: number; tokens: number; tokenText: string; voice: number; tts: number; cost: number };

function CostCaseCell(p: CustomCellRendererProps<CostRow>) {
  if (!p.data) return null;
  return <span className="truncate font-medium" data-testid={`row-cost-${p.data.id}`}>{p.data.product}</span>;
}

export function CostGrid({ s, onOpen }: { s: CommerceState; onOpen: (id: string) => void }) {
  const rows = useMemo<CostRow[]>(
    () =>
      s.tickets.map((t) => ({
        id: t.id,
        ticket: t,
        product: productOf(s, orderOf(s, t.orderId)?.productId ?? "")?.name ?? t.orderId,
        aiCalls: t.aiCalls,
        tokens: t.inputTokens + t.outputTokens,
        tokenText: `${t.inputTokens.toLocaleString()} / ${t.outputTokens.toLocaleString()}`,
        voice: t.voiceSeconds,
        tts: t.speechCharacters,
        cost: t.estimatedCost,
      })),
    [s],
  );
  const cols = useMemo<ColDef<CostRow>[]>(
    () => [
      { headerName: "Case", field: "product", cellRenderer: CostCaseCell, minWidth: 200, flex: 1.5 },
      { headerName: "Status", colId: "status", valueGetter: (p) => p.data?.ticket.status, cellRenderer: (p: CustomCellRendererProps<CostRow>) => (p.data ? <span className="flex h-full items-center"><TicketStatusChip status={p.data.ticket.status} /></span> : null), minWidth: 150, flex: 1 },
      { headerName: "AI calls", field: "aiCalls", type: "rightAligned", width: 100, cellClass: "mono" },
      { headerName: "Tokens in / out", field: "tokens", type: "rightAligned", width: 150, valueFormatter: (p) => p.data?.tokenText ?? "", cellClass: "mono" },
      { headerName: "Voice s", field: "voice", type: "rightAligned", width: 100, valueFormatter: (p) => Number(p.value).toFixed(1), cellClass: "mono" },
      { headerName: "TTS chars", field: "tts", type: "rightAligned", width: 110, cellClass: "mono" },
      { headerName: "Est. cost", field: "cost", type: "rightAligned", width: 120, sort: "desc", valueFormatter: (p) => costUsd(p.value), cellClass: "mono font-semibold" },
    ],
    [],
  );
  return (
    <div className="ks-grid w-full" style={{ height: Math.min(520, 40 + Math.max(rows.length, 3) * 46) }} data-testid="grid-costs">
      <AgGridReact<CostRow>
        theme={flamingoGridTheme}
        rowData={rows}
        columnDefs={cols}
        defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
        getRowId={(p) => p.data.id}
        rowHeight={46}
        headerHeight={38}
        onRowClicked={(e: RowClickedEvent<CostRow>) => e.data && onOpen(e.data.id)}
        overlayNoRowsTemplate='<span style="color:#77737f">No cases yet, so no usage.</span>'
      />
    </div>
  );
}
