"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, BookOpenCheck, Check, Info, Quote, CircleDollarSign, Code2, Inbox, MessageSquareReply, PackageCheck, RefreshCw, RotateCcw, Route, ScrollText, Search, Undo2, X } from "lucide-react";
import type { CommerceState, CommerceTicket } from "@workspace/api-client-react";
import { PolicyDocuments, PolicyRules } from "@/components/commerce/policy-admin";
import { useCommerce, useCommerceState } from "@/hooks/use-commerce";
import { REFUND_STATE, TICKET_STATUS, costUsd, day, isClosed, orderOf, productOf, usd, when } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { EvidencePanel } from "@/components/commerce/evidence-panel";
import { ConfirmDialog, ProductImage, RefundChip, Reveal, TicketStatusChip, Tone } from "@/components/commerce/kit";

const GridSkeleton = ({ h = 420 }: { h?: number }) => <div className="ks-skel w-full rounded-2xl" style={{ height: h }} />;
const CaseGrid = dynamic(() => import("@/components/commerce/case-grid").then((m) => m.CaseGrid), { ssr: false, loading: () => <GridSkeleton /> });
const CostGrid = dynamic(() => import("@/components/commerce/case-grid").then((m) => m.CostGrid), { ssr: false, loading: () => <GridSkeleton h={240} /> });

type View = "queue" | "costs" | "policy";
type Filter = "action" | "active" | "closed" | "all";
const NEEDS: CommerceTicket["status"][] = ["escalated", "awaiting_return", "refund_pending"];

export default function PortalPage() {
  const s = useCommerceState();
  const params = useSearchParams();
  const view = (params.get("view") as View) || "queue";
  const tabs: { id: View; label: string; icon: typeof Inbox }[] = [
    { id: "queue", label: "Live queue", icon: Inbox },
    { id: "costs", label: "Costs", icon: CircleDollarSign },
    { id: "policy", label: "Policy", icon: ScrollText },
  ];
  return (
    <main className="relative z-10 mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Support desk</h1>
          <p className="text-[13px] text-[var(--ks-mute)]">{s.organization}</p>
        </div>
        <nav className="flex w-full justify-between gap-1 rounded-full bg-[#efeef2] p-1 text-[13px] sm:w-auto">
          {tabs.map((t) => (
            <Link key={t.id} href={`/flamingo-portal?view=${t.id}`} data-testid={`tab-${t.id}`}
              className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors", view === t.id ? "bg-white font-medium text-[var(--ks-ink)] shadow-[0_1px_3px_rgba(29,27,34,.12)]" : "text-[var(--ks-ink-2)] hover:text-[var(--ks-ink)]")}>
              <t.icon className="h-4 w-4" /> <span className="hidden sm:inline">{t.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-5">{view === "costs" ? <Costs s={s} /> : view === "policy" ? <Policy s={s} /> : <Queue />}</div>
    </main>
  );
}

function Queue() {
  const s = useCommerceState();
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("action");
  const [quick, setQuick] = useState("");
  const sorted = useMemo(() => [...s.tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [s.tickets]);
  const groups = useMemo<Record<Filter, CommerceTicket[]>>(() => ({
    action: sorted.filter((t) => NEEDS.includes(t.status) || t.refundState === "uncertain"),
    active: sorted.filter((t) => !isClosed(t)),
    closed: sorted.filter(isClosed),
    all: sorted,
  }), [sorted]);
  const list = groups[filter];
  const selId = params.get("ticket") ?? list[0]?.id;
  const sel = s.tickets.find((t) => t.id === selId);
  const labels: Record<Filter, string> = { action: "Needs staff", active: "Active", closed: "Closed", all: "All" };
  const open = (id: string) => router.push(`/flamingo-portal?view=queue&ticket=${encodeURIComponent(id)}`, { scroll: false });
  const q = quick.trim().toLowerCase();
  const cardList = q
    ? list.filter((t) => `${t.reason} ${t.orderId} ${productOf(s, orderOf(s, t.orderId)?.productId ?? "")?.name ?? ""}`.toLowerCase().includes(q))
    : list;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(440px,1fr)]">
    <div className="min-w-0 space-y-3 xl:sticky xl:top-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="grid grid-cols-4 gap-1 rounded-full bg-[#efeef2] p-1 text-[12.5px] sm:w-[400px]">
          {(Object.keys(labels) as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
              className={cn("rounded-full px-2 py-1.5 transition-colors", filter === f ? "bg-white font-medium text-[var(--ks-ink)] shadow-[0_1px_3px_rgba(29,27,34,.12)]" : "text-[var(--ks-ink-2)] hover:text-[var(--ks-ink)]")}>
              {labels[f]} <span className={cn("ml-0.5 tabular-nums", f === "action" && groups[f].length > 0 ? "font-semibold text-[var(--ks-coral-d)]" : "text-[var(--ks-mute)]")}>{groups[f].length}</span>
            </button>
          ))}
        </div>
        <label className="relative flex-1 sm:max-w-xs sm:ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ks-mute)]" />
          <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search cases" className="ks-input !rounded-full !pl-9 !pr-8" data-testid="input-queue-search" />
          {quick && (
            <button type="button" onClick={() => setQuick("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--ks-mute)] hover:text-[var(--ks-ink)]"><X className="h-3.5 w-3.5" /></button>
          )}
        </label>
      </div>

      {list.length === 0 ? (
        <div className="ks-card px-6 py-14 text-center text-sm text-[var(--ks-ink-2)]">
          <Check className="mx-auto h-7 w-7 rounded-full bg-[var(--ks-teal-l)] p-1.5 text-[var(--ks-teal)]" />
          <p className="mt-2">All clear. <Link href="/kikostore/orders" className="text-[var(--ks-coral-d)] underline">Try a request</Link></p>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <CaseGrid s={s} tickets={list} quick={quick} selectedId={sel?.id} onOpen={open} />
          </div>
          <div className="ks-scroll max-h-[40dvh] space-y-2 overflow-y-auto pr-1 md:hidden">
            {cardList.map((t) => {
              const o = orderOf(s, t.orderId);
              const p = o ? productOf(s, o.productId) : undefined;
              return (
                <Link key={t.id} href={`/flamingo-portal?view=queue&ticket=${t.id}`} scroll={false} data-testid={`card-ticket-${t.id}`}
                  className={cn("ks-card block p-3 transition-colors hover:border-[var(--ks-plum)]/40", t.id === selId && "border-[var(--ks-plum)] bg-[#fbf3f6]")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{p?.name ?? t.orderId}</span>
                    <span className="shrink-0 text-sm font-semibold">{usd(o?.amount)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-[var(--ks-ink-2)]">{t.reason || t.messages[t.messages.length - 1]?.text || "No messages yet"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TicketStatusChip status={t.status} />
                    <RefundChip state={t.refundState} />
                    {(t.evidence?.length ?? 0) > 0 && <span className="text-[0.65rem] text-[var(--ks-mute)]">{t.evidence?.length} photos</span>}
                    <span className="ml-auto text-[0.65rem] text-[var(--ks-mute)]">{when(t.updatedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

    </div>
      <div className="min-w-0">
      {sel ? <CaseDetail key={sel.id} t={sel} /> : list.length > 0 ? (
        <div className="ks-card flex min-h-[300px] items-center justify-center p-10 text-center text-sm text-[var(--ks-mute)]">Pick a case.</div>
      ) : null}
      </div>
    </div>
  );
}

function CaseDetail({ t }: { t: CommerceTicket }) {
  const s = useCommerceState();
  const { run, busy } = useCommerce();
  const [msg, setMsg] = useState("");
  const [dialog, setDialog] = useState<null | "refund" | "received">(null);
  const [tab, setTab] = useState<"conversation" | "trace">("conversation");
  const o = orderOf(s, t.orderId);
  const p = o ? productOf(s, o.productId) : undefined;
  const closed = isClosed(t);
  const has = msg.trim().length > 0;
  const overLimit = !!o && o.amount > s.policy.automaticLimit;

  const act = (action: "human_reply" | "approve_return" | "reject" | "reopen" | "sync_refund" | "approve_refund" | "received_return") =>
    run({ action, ticketId: t.id, version: t.version, ...(action === "sync_refund" ? {} : { message: msg.trim() }) }).then(() => { setMsg(""); setDialog(null); }, () => setDialog(null));

  return (
    <div className="ks-card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--ks-line)] p-4 sm:flex-row sm:items-center md:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
        <ProductImage src={p?.image} alt={p?.name ?? "Order"} className="h-14 w-14 shrink-0 rounded-xl border border-[var(--ks-line)] sm:h-16 sm:w-16" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold tracking-tight">{p?.name ?? t.orderId}{o && o.quantity > 1 ? ` x ${o.quantity}` : ""}</p>
          <p className="text-xs text-[var(--ks-ink-2)]">
            {s.customer} · {usd(o?.amount)} · {o?.source === "sample" ? "Sample" : "PayPal Sandbox"} · {o?.deliveredAt ? `delivered ${day(o.deliveredAt)}` : "not shipped"}
          </p>
          <Reveal className="mt-0.5 max-w-md" summary={<span className="mono">{t.orderId}</span>}>
            <p className="text-[var(--ks-mute)]">Bought {day(o?.createdAt)}. {TICKET_STATUS[t.status].hint}</p>
          </Reveal>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-end" data-testid="status-case">
          <TicketStatusChip status={t.status} />
          <RefundChip state={t.refundState} />
          {t.returnCode && <span className="mono text-xs">RMA {t.returnCode}</span>}
        </div>
      </div>

      <div className="grid grid-cols-4 border-b border-[var(--ks-line)]">
        {[
          ["Intent", t.intent], ["AI calls", String(t.aiCalls)], ["Tokens in/out", `${t.inputTokens}/${t.outputTokens}`], ["Est. cost", costUsd(t.estimatedCost)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 px-4 py-2.5 md:px-5 [&+&]:border-l [&+&]:border-[var(--ks-line)]"><p className="truncate text-[11px] text-[var(--ks-mute)]">{k}</p><p className="mt-0.5 truncate text-[13.5px] font-medium capitalize tabular-nums" data-testid={`text-${k.split(" ")[0].toLowerCase()}`}>{v}</p></div>
        ))}
      </div>

      <Investigation t={t} />

      {(t.evidence?.length ?? 0) > 0 && (
        <div className="border-b border-[var(--ks-line)] p-4 md:p-5" data-testid="panel-case-evidence">
          <EvidencePanel ticket={t} readOnly />
        </div>
      )}

      <div className="flex gap-1 border-b border-[var(--ks-line)] px-4 pt-3 text-sm">
        {(["conversation", "trace"] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)} data-testid={`tab-case-${x}`}
            className={cn("-mb-px border-b-2 px-3 pb-2 capitalize", tab === x ? "border-[var(--ks-coral)] font-medium" : "border-transparent text-[var(--ks-ink-2)]")}>
            {x === "trace" ? <span className="flex items-center gap-1"><Route className="h-3.5 w-3.5" /> Agent trace ({t.steps.length})</span> : `Conversation (${t.messages.length})`}
          </button>
        ))}
      </div>

      <div className="ks-scroll max-h-[42dvh] overflow-y-auto bg-[#fbfbfc] p-4 md:p-5">
        {tab === "conversation" ? (
          <div className="flex flex-col gap-2">
            {t.messages.length === 0 && <p className="text-sm text-[var(--ks-mute)]">No messages yet.</p>}
            {t.messages.map((m) => (
              <div key={m.id} className={cn("max-w-[88%] rounded-2xl px-3.5 py-2 text-[13.5px]", m.role === "customer" ? "bg-white shadow-[0_0_0_1px_var(--ks-line)]" : m.role === "human" ? "ml-auto bg-[var(--ks-teal-l)]" : m.role === "system" ? "mx-auto bg-transparent text-center text-[12px] text-[var(--ks-mute)]" : "ml-auto bg-[var(--ks-coral-l)]")}>
                <p className="mb-0.5 text-[11px] text-[var(--ks-mute)]"><span className="font-medium capitalize text-[var(--ks-ink-2)]">{m.role === "agent" ? "Flamingo" : m.role === "human" ? "Staff" : m.role === "customer" ? "Customer" : m.role}</span>{m.channel === "voice" ? " · voice" : ""} · {when(m.at)}</p>
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-[var(--ks-line-2)] pl-5">
            {t.steps.length === 0 && <p className="text-sm text-[var(--ks-mute)]">No pipeline steps recorded yet.</p>}
            {t.steps.map((st) => (
              <li key={st.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-[var(--ks-paper)] bg-[var(--ks-coral)]" />
                <div className="flex items-center gap-2"><Tone tone="plum">{st.agent}</Tone><span className="text-[0.7rem] text-[var(--ks-mute)]">{when(st.at)}</span></div>
                <Reveal className="mt-1 !text-[0.8rem]" summary={st.detail}>
                  <p className="whitespace-pre-wrap break-words text-[var(--ks-ink-2)]">{st.detail}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-3 border-t border-[var(--ks-line)] bg-[var(--ks-paper)] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="ks-label">{closed ? "Closed case" : "Staff decision"}</p>
          {overLimit && !closed && <Tone tone="amber">Owner override · over {usd(s.policy.automaticLimit)}</Tone>}
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={2000} className="ks-input resize-none !rounded-2xl" data-testid="input-staff-message"
          placeholder={closed ? "Reason for reopening" : "Message to customer (required, audited)"} />
        <div className="flex flex-wrap items-center gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
          {closed ? (
            <button className="ks-btn ks-btn-plum" disabled={!has || busy} onClick={() => void act("reopen")} data-testid="button-reopen"><Undo2 className="h-4 w-4" /> Reopen</button>
          ) : (
            <>
              <button className="ks-btn ks-btn-ghost" disabled={!has || busy} onClick={() => void act("human_reply")} data-testid="button-human-reply"><MessageSquareReply className="h-4 w-4" /> Reply only</button>
              {t.status !== "awaiting_return" && t.status !== "refund_pending" && (
                <>
                  <button className="ks-btn ks-btn-coral" disabled={!has || busy} onClick={() => setDialog("refund")} data-testid="button-approve-refund"><CircleDollarSign className="h-4 w-4" /> Approve refund</button>
                  <button className="ks-btn ks-btn-plum" disabled={!has || busy} onClick={() => void act("approve_return")} data-testid="button-approve-return"><RotateCcw className="h-4 w-4" /> Approve return</button>
                </>
              )}
              {t.status === "awaiting_return" && (
                <button className="ks-btn ks-btn-gold" disabled={!has || busy} onClick={() => setDialog("received")} data-testid="button-received-return"><PackageCheck className="h-4 w-4" /> Warehouse received it</button>
              )}
              {["open", "escalated", "awaiting_confirmation"].includes(t.status) && <button className="ks-btn ks-btn-ghost text-[var(--ks-coral-d)]" disabled={!has || busy} onClick={() => void act("reject")} data-testid="button-reject"><Ban className="h-4 w-4" /> Decline</button>}
            </>
          )}
          {(t.refundState === "submitted" || t.refundState === "uncertain") && (
            <button className="ks-btn ks-btn-ghost" disabled={busy} onClick={() => void act("sync_refund")} data-testid="button-sync-refund"><RefreshCw className="h-4 w-4" /> Sync with PayPal</button>
          )}
          <Link href={`/flamingo-support?ticket=${t.id}&order=${t.orderId}`} className="ks-btn ks-btn-ghost ks-btn-sm ml-auto border-transparent text-[var(--ks-ink-2)]" data-testid="link-customer-view">Customer view</Link>
        </div>
        <Reveal icon={<Info />} summary="Money only moves after you confirm" testId="button-decision-info">
          <p className="text-[var(--ks-mute)]">
            Replies do not close the case. Your message is sent to the customer and stored as the decision reason.
            {overLimit && !closed && ` Over ${usd(s.policy.automaticLimit)}, decisions are owner overrides.`}
            {t.refundState !== "none" && ` ${REFUND_STATE[t.refundState].hint}`}
          </p>
        </Reveal>
      </div>

      <ConfirmDialog open={dialog === "refund"} onOpenChange={(v) => !v && setDialog(null)} pending={busy} title={`Refund ${usd(o?.amount)} to ${s.customer}?`} confirmLabel="Refund now"
        onConfirm={() => void act("approve_refund")}
        body={<>
          <p>{o?.source === "sample" ? "Simulated, no money moves." : "PayPal Sandbox refund against the capture."}</p>
          <Reveal className="mt-2" icon={<Info />} summary="Details">
            <p>{o?.source === "sample" ? "Sample order: the refund is simulated and recorded." : "It shows as submitted or uncertain until PayPal confirms."} Your message is sent to the customer and stored as the decision reason.</p>
          </Reveal>
        </>} />
      <ConfirmDialog open={dialog === "received"} onOpenChange={(v) => !v && setDialog(null)} tone="gold" pending={busy} title="Confirm the warehouse has the item?" confirmLabel="Yes, received"
        onConfirm={() => void act("received_return")}
        body={<p>Triggers the {usd(o?.amount)} refund. Only confirm once return {t.returnCode ? <span className="mono">{t.returnCode}</span> : "for this order"} is checked in.</p>} />
    </div>
  );
}

const STAGE: Record<string, { label: string; tone: string }> = {
  understanding: { label: "Understanding the request", tone: "blue" },
  investigating: { label: "Investigating", tone: "amber" },
  ready: { label: "Ready to decide", tone: "teal" },
  handoff: { label: "Handed to staff", tone: "plum" },
};
const ENGINE: Record<string, string> = { rules: "Policy rules", groq: "Groq model, checked by rules", guarded_fallback: "Guarded fallback" };

function Investigation({ t }: { t: CommerceTicket }) {
  const inv = t.investigation;
  const cites = t.citations ?? [];
  if (!inv && cites.length === 0) return null;
  return (
    <div className="space-y-4 border-b border-[var(--ks-line)] p-4 md:p-5" data-testid="panel-investigation">
      {inv && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="ks-label flex items-center gap-1"><BookOpenCheck className="h-3.5 w-3.5" /> Investigation</p>
            <Tone tone={STAGE[inv.stage]?.tone ?? "mute"}>{STAGE[inv.stage]?.label ?? inv.stage}</Tone>
            <span className="text-[0.7rem] text-[var(--ks-mute)]">{ENGINE[inv.engine] ?? inv.engine}{t.policyVersion ? ` . policy ${t.policyVersion}` : ""}</span>
          </div>
          <p className="mt-2 font-medium leading-snug" data-testid="text-investigation-summary">{inv.summary}</p>
          {inv.detail && (
            <Reveal className="mt-1" summary="Reasoning" testId="button-investigation-detail">
              <p className="text-sm leading-relaxed text-[var(--ks-ink-2)]">{inv.detail}</p>
            </Reveal>
          )}
          {inv.question && <p className="mt-2 rounded-lg border-l-2 border-[var(--ks-coral)] bg-white px-3 py-2 text-sm"><span className="text-[var(--ks-mute)]">Open question: </span>{inv.question}</p>}
        </div>
      )}
      {cites.length > 0 && (
        <div>
          <p className="ks-label">Policy citations ({cites.length})</p>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {cites.map((c, i) => (
              <li key={`${c.documentId}-${c.page}-${i}`} className="rounded-xl border border-[var(--ks-line)] bg-white px-3 py-2 text-sm" data-testid={`citation-${i}`}>
                <Reveal icon={<Quote className="text-[var(--ks-coral)]" />} summary={<><span className="font-medium text-[var(--ks-ink)]">{c.title}</span> <span className="text-[var(--ks-mute)]">p.{c.page} · v{c.version}</span></>}>
                  <p className="text-xs leading-relaxed text-[var(--ks-ink-2)]">{c.excerpt}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Costs({ s }: { s: CommerceState }) {
  const router = useRouter();
  const sum = (k: "aiCalls" | "inputTokens" | "outputTokens" | "voiceSeconds" | "speechCharacters" | "estimatedCost") => s.tickets.reduce((n, t) => n + t[k], 0);
  const basis = Array.from(new Set(s.tickets.map((t) => t.costBasis).filter(Boolean)));
  const refunded = s.orders.filter((o) => o.status === "refunded");
  return (
    <div className="space-y-5">
      <Reveal icon={<Info />} summary="Estimates, not invoices" testId="button-costs-info">
        <p className="text-[var(--ks-mute)]">Covers observed Groq, Deepgram and vision-model usage only. Elastic hosting, Jina OCR and inference fees are not included; check provider billing for actual charges.{basis.length > 0 && ` Rate assumptions: ${basis.join(" ")}`}</p>
      </Reveal>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Cases", String(s.tickets.length), `${s.tickets.filter((t) => !isClosed(t)).length} open`],
          ["AI calls", String(sum("aiCalls")), `${sum("inputTokens").toLocaleString()} / ${sum("outputTokens").toLocaleString()} tokens`],
          ["Voice", `${sum("voiceSeconds").toFixed(1)}s heard`, `${sum("speechCharacters").toLocaleString()} characters spoken`],
          ["Est. AI cost", costUsd(sum("estimatedCost")), "estimate"],
        ].map(([k, v, sub]) => (
          <div key={k} className="ks-card p-5"><p className="ks-label">{k}</p><p className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums">{v}</p><p className="text-xs text-[var(--ks-mute)]">{sub}</p></div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="ks-card p-5"><Tone tone="plum">Sample money</Tone><p className="mt-2 text-xl font-semibold">{usd(refunded.filter((o) => o.source === "sample").reduce((n, o) => n + o.amount, 0))}</p><p className="text-xs text-[var(--ks-mute)]">simulated refunds, nothing moved</p></div>
        <div className="ks-card p-5"><Tone tone="blue">PayPal Sandbox money</Tone><p className="mt-2 text-xl font-semibold">{usd(refunded.filter((o) => o.source === "paypal_sandbox").reduce((n, o) => n + o.amount, 0))}</p><p className="text-xs text-[var(--ks-mute)]">sandbox test refunds recorded as refunded</p></div>
      </div>
      <CostGrid s={s} onOpen={(id) => router.push(`/flamingo-portal?view=queue&ticket=${encodeURIComponent(id)}`)} />
    </div>
  );
}

function Policy({ s }: { s: CommerceState }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/api/commerce/widget.js"></script>\n<button onclick="Flamingo.open({ orderId: 'ORDER_ID' })">\n  Get help with this order\n</button>`;
  const integ = [
    ["AI agents (LangGraph)", s.aiConfigured, "Classifies intent, checks policy against the real order, proposes exact actions."],
    ["Voice (Deepgram)", s.voiceConfigured, "Transcribes short call turns; speaks saved replies only."],
    ["Photos (Qwen vision + Elastic Jina OCR)", s.aiConfigured, "Open-weight Qwen vision model inspects damage photos; Elastic Jina reads text. Unverified impressions for staff."],
    ["PayPal Sandbox", s.paypalConfigured, "Checkout, capture and refunds with sandbox test money."],
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <PolicyRules s={s} />
        <PolicyDocuments s={s} />
      </div>
      <div className="min-w-0 space-y-5">
        <div className="ks-card p-5 md:p-6">
          <p className="ks-label">Integrations</p>
          <ul className="mt-3 space-y-3">
            {integ.map(([n, on, d]) => (
              <li key={n} className="flex gap-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", on ? "bg-[var(--ks-teal)]" : "bg-[var(--ks-mute)]")} />
                <Reveal className="min-w-0 flex-1" summary={<span className="text-sm font-medium text-[var(--ks-ink)]">{n} <span className="text-xs font-normal text-[var(--ks-mute)]">{on ? "on" : "off"}</span></span>}><p className="text-xs text-[var(--ks-ink-2)]">{d}</p></Reveal>
              </li>
            ))}
          </ul>
        </div>
        <div className="ks-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="ks-label flex items-center gap-1"><Code2 className="h-3.5 w-3.5" /> Store embed</p><Tone tone="amber">Demo adapter</Tone></div>
          <pre className="mono ks-scroll mt-3 overflow-x-auto rounded-xl bg-[var(--ks-plum)] p-4 text-[0.75rem] leading-relaxed text-[#fbeef0]">{snippet}</pre>
          <Reveal className="mt-2" summary="Same-origin only"><p className="text-[var(--ks-mute)]">Opens Flamingo support with the order already loaded.</p></Reveal>
        </div>
      </div>
    </div>
  );
}
