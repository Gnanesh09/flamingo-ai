"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, FileText, FileUp, Lock, Send, ShieldCheck } from "lucide-react";
import {
  getGetCommerceStateQueryKey,
  useUpdateCommercePolicy,
  type CommercePolicyDocument,
  type CommercePolicyInput,
  type CommercePolicyPage,
  type CommerceState,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { errText, usd, when } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { ConfirmDialog, Tone } from "@/components/commerce/kit";

const KEY = getGetCommerceStateQueryKey();
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 40;
const MAX_PAGE_CHARS = 12_000;
const MAX_TOTAL = 120_000;

function usePolicyMutation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useUpdateCommercePolicy();
  const save = async (data: CommercePolicyInput, ok: string) => {
    try {
      const next = await m.mutateAsync({ data });
      const cur = qc.getQueryData<CommerceState>(KEY);
      if (!cur || cur.id !== next.id || next.revision >= cur.revision) qc.setQueryData(KEY, next);
      toast({ title: ok });
      return true;
    } catch (e) {
      void qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "Policy not changed", description: errText(e), variant: "destructive" });
      return false;
    }
  };
  return { save, pending: m.isPending };
}

export function PolicyRules({ s }: { s: CommerceState }) {
  const p = s.policy;
  const { save, pending } = usePolicyMutation();
  const [days, setDays] = useState(String(p.returnDays));
  const [auto, setAuto] = useState(String(p.automaticLimit));
  const [instant, setInstant] = useState(String(p.instantRefundLimit));
  const [editVersion, setEditVersion] = useState(p.version);
  const d = Number(days), a = Number(auto), i = Number(instant);
  const err =
    !days.trim() || !auto.trim() || !instant.trim() ? "Enter all three policy limits."
    : !Number.isInteger(d) || d < 1 || d > 365 ? "Return window must be a whole number from 1 to 365 days."
    : !Number.isFinite(a) || a < 0 || a > 100 ? "Automatic limit must be between $0 and $100."
    : !Number.isFinite(i) || i < 0 || i > 50 ? "Instant refund limit must be between $0 and $50."
    : i > a ? "Instant refund limit cannot exceed the automatic limit."
    : null;
  const dirty = d !== p.returnDays || a !== p.automaticLimit || i !== p.instantRefundLimit;
  useEffect(() => { if (!dirty) setEditVersion(p.version); }, [dirty, p.version]);
  const stale = editVersion !== p.version && dirty;

  return (
    <div className="ks-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="ks-label">Active policy <span className="mono normal-case tracking-normal text-[var(--ks-ink)]" data-testid="text-policy-version">{p.version}</span></p>
        <div className="flex flex-wrap gap-1.5">
          <Tone tone={s.retrievalMode === "elastic_semantic" ? "teal" : "mute"}>{s.retrievalMode === "elastic_semantic" ? "Elastic semantic retrieval" : "Local text retrieval"}</Tone>
        </div>
      </div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{p.name}</h2>
      {s.retrievalNotice && <p className="mt-1 text-xs text-[var(--ks-mute)]" data-testid="text-retrieval-notice">{s.retrievalNotice}</p>}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Return window" suffix="days" hint="1 to 365" value={days} onChange={setDays} id="return-days" />
        <Field label="Automatic limit" prefix="$" hint="0 to 100" value={auto} onChange={setAuto} id="auto-limit" />
        <Field label="Instant refund limit" prefix="$" hint="0 to 50, not above automatic" value={instant} onChange={setInstant} id="instant-limit" />
      </div>
      {err && <p className="mt-2 text-sm text-[var(--ks-coral-d)]" data-testid="text-rules-error">{err}</p>}
      {stale && <p className="mt-2 text-sm text-[var(--ks-coral-d)]">The active policy changed while you were editing. Your draft is preserved. Select Reset to load the current limits before saving.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="ks-btn ks-btn-plum" disabled={!!err || !dirty || pending || stale} data-testid="button-save-rules"
          onClick={() => void save({ action: "update_rules", version: editVersion, returnDays: d, automaticLimit: a, instantRefundLimit: i }, "Policy rules updated")}>
          {pending ? "Saving..." : "Save rules"}
        </button>
        {dirty && <button className="ks-btn ks-btn-ghost" onClick={() => { setDays(String(p.returnDays)); setAuto(String(p.automaticLimit)); setInstant(String(p.instantRefundLimit)); setEditVersion(p.version); }} data-testid="button-reset-rules">Reset</button>}
        <span className="text-xs text-[var(--ks-mute)]">Currently {p.returnDays} days, auto {usd(p.automaticLimit)}, instant {usd(p.instantRefundLimit)}</span>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--ks-line)] bg-[#fbf5f0] p-4 text-xs leading-relaxed text-[var(--ks-ink-2)]">
        <p className="flex items-center gap-1.5 font-semibold text-[var(--ks-ink)]"><Lock className="h-3.5 w-3.5" /> Immutable safety caps</p>
        <p className="mt-1">The server never allows more than 365 days, $100 automatic, or $50 instant, whatever is saved here. Anything over the limits, out of window, final sale or with a payment mismatch goes to staff, and automatic actions still wait for the customer to confirm.</p>
        <p className="mt-2"><Tone tone="amber">Demo controller, not production authentication</Tone></p>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-[var(--ks-ink-2)]">Built-in policy text</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-[var(--ks-ink-2)]">{p.text}</p>
      </details>
    </div>
  );
}

function Field({ label, hint, value, onChange, id, prefix, suffix }: { label: string; hint: string; value: string; onChange: (v: string) => void; id: string; prefix?: string; suffix?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-[var(--ks-ink-2)]">{label}</span>
      <span className="relative mt-1 flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 text-sm text-[var(--ks-mute)]">{prefix}</span>}
        <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={cn("ks-input mono", prefix && "pl-7", suffix && "pr-12")} data-testid={`input-${id}`} />
        {suffix && <span className="pointer-events-none absolute right-3 text-xs text-[var(--ks-mute)]">{suffix}</span>}
      </span>
      <span className="mt-1 block text-[0.68rem] text-[var(--ks-mute)]">{hint}</span>
    </label>
  );
}

async function extractPdf(file: File): Promise<CommercePolicyPage[]> {
  if (file.type && file.type !== "application/pdf") throw new Error("That file is not a PDF.");
  if (file.size > MAX_BYTES) throw new Error("PDF is larger than 5 MB. Split it or export a smaller text PDF.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`PDF has ${doc.numPages} pages. The limit is ${MAX_PAGES}.`);
    const pages: CommercePolicyPage[] = [];
    let total = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const it of content.items) if ("str" in it) text += it.str + (it.hasEOL ? "\n" : " ");
      text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) continue;
      if (text.length > MAX_PAGE_CHARS) throw new Error(`Page ${n} has ${text.length.toLocaleString()} characters of text. The limit is 12,000 per page.`);
      total += text.length;
      pages.push({ page: n, text });
    }
    if (total > MAX_TOTAL) throw new Error(`The PDF has ${total.toLocaleString()} characters of text. The limit is 120,000.`);
    if (total < 40) throw new Error("No selectable text found. This looks like a scanned or empty PDF, and OCR is not supported. Export a text-based PDF instead.");
    return pages;
  } finally {
    void doc.cleanup();
  }
}

export function PolicyDocuments({ s }: { s: CommerceState }) {
  const docs = s.policyDocuments ?? [];
  const { save, pending } = usePolicyMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; pages: CommercePolicyPage[] } | null>(null);
  const [archiveDoc, setArchiveDoc] = useState<CommercePolicyDocument | null>(null);
  const [publishDoc, setPublishDoc] = useState<CommercePolicyDocument | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const published = docs.find((d) => d.status === "published");
  const ordered = [...docs].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : ["published", "draft", "archived"].indexOf(a.status) - ["published", "draft", "archived"].indexOf(b.status)));

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFileErr(null);
    setPreview(null);
    setExtracting(true);
    try {
      const pages = await extractPdf(f);
      setPreview({ title: f.name.replace(/\.pdf$/i, "").slice(0, 160) || "Policy document", pages });
    } catch (err) {
      setFileErr(err instanceof Error ? err.message : "Could not read that PDF.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="ks-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ks-label">Supplemental policy documents</p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--ks-ink-2)]">Built-in rules stay authoritative for money. A published document can only tighten eligibility or send cases to staff; its text is cited as evidence, never followed as instructions.</p>
        </div>
        <button className="ks-btn ks-btn-coral ks-btn-sm w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={extracting || pending} data-testid="button-import-pdf">
          <FileUp className="h-4 w-4" /> {extracting ? "Reading PDF..." : "Import PDF"}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onFile(e)} data-testid="input-pdf" />
      </div>
      <p className="mt-2 text-[0.68rem] text-[var(--ks-mute)]">Text is extracted in your browser. The PDF itself is never uploaded or stored. Up to 5 MB, 40 pages, text-based only (no OCR).</p>

      {extracting && <div className="mt-4 space-y-2"><div className="ks-skel h-4 w-1/2" /><div className="ks-skel h-16" /></div>}
      {fileErr && <p className="mt-4 rounded-xl bg-[var(--ks-coral-l)] px-4 py-3 text-sm text-[var(--ks-coral-d)]" data-testid="text-pdf-error">{fileErr}</p>}

      {preview && (
        <div className="mt-4 rounded-xl border border-[var(--ks-coral)]/40 bg-[#fff8f5] p-4" data-testid="panel-pdf-preview">
          <label className="block">
            <span className="text-xs font-medium text-[var(--ks-ink-2)]">Title</span>
            <input value={preview.title} maxLength={160} onChange={(e) => setPreview({ ...preview, title: e.target.value })} className="ks-input mt-1" data-testid="input-pdf-title" />
          </label>
          <p className="mt-3 text-xs text-[var(--ks-mute)]">{preview.pages.length} pages with text, {preview.pages.reduce((n, p) => n + p.text.length, 0).toLocaleString()} characters. Review what Flamingo will read:</p>
          <PageList pages={preview.pages} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="ks-btn ks-btn-plum flex-1 sm:flex-none" disabled={pending || !preview.title.trim()} data-testid="button-save-draft"
              onClick={() => void save({ action: "import", version: s.policy.version, title: preview.title.trim(), pages: preview.pages }, "Draft saved. It does not affect decisions until published.").then((ok) => ok && setPreview(null))}>
              {pending ? "Saving..." : "Save as draft"}
            </button>
            <button className="ks-btn ks-btn-ghost flex-1 sm:flex-none" onClick={() => setPreview(null)} data-testid="button-discard-preview">Discard</button>
          </div>
        </div>
      )}

      <ul className="mt-5 space-y-2">
        {ordered.length === 0 && !preview && (
          <li className="flex flex-col items-center rounded-xl border border-dashed border-[var(--ks-line-2)] px-4 py-8 text-center text-sm text-[var(--ks-ink-2)]">
            <FileText className="h-6 w-6 text-[var(--ks-mute)]" />
            <p className="mt-2">No supplemental documents. Decisions use the built-in policy only.</p>
          </li>
        )}
        {ordered.map((d) => (
          <li key={d.id} className={cn("rounded-xl border p-3", d.status === "published" ? "border-[var(--ks-teal)]/40 bg-[var(--ks-teal-l)]/40" : "border-[var(--ks-line)]", d.status === "archived" && "opacity-70")} data-testid={`doc-${d.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(openId === d.id ? null : d.id)} data-testid={`button-toggle-doc-${d.id}`}>
                <p className="truncate text-sm font-medium">{d.title}</p>
                <p className="text-[0.7rem] text-[var(--ks-mute)]">{d.pages.length} pages . {when(d.createdAt)}{d.indexed ? " . indexed" : ""}</p>
              </button>
              <Tone tone={d.status === "published" ? "teal" : d.status === "draft" ? "amber" : "mute"}>{d.status === "published" ? "Published" : d.status === "draft" ? "Draft" : "Archived"}</Tone>
              {d.status === "draft" && <button className="ks-btn ks-btn-coral ks-btn-sm" disabled={pending} onClick={() => setPublishDoc(d)} data-testid={`button-publish-${d.id}`}><Send className="h-3.5 w-3.5" /> Publish</button>}
              {d.status !== "archived" && <button className="ks-btn ks-btn-ghost ks-btn-sm" disabled={pending} onClick={() => setArchiveDoc(d)} data-testid={`button-archive-${d.id}`}><Archive className="h-3.5 w-3.5" /> Archive</button>}
            </div>
            {openId === d.id && <PageList pages={d.pages} />}
          </li>
        ))}
      </ul>

      <ConfirmDialog open={!!publishDoc} onOpenChange={(v) => !v && setPublishDoc(null)} pending={pending} title={`Publish "${publishDoc?.title ?? ""}"?`} confirmLabel="Publish"
        onConfirm={() => publishDoc && void save({ action: "publish", version: s.policy.version, documentId: publishDoc.id }, "Document published").then(() => setPublishDoc(null))}
        body={<p><ShieldCheck className="mr-1 inline h-4 w-4 text-[var(--ks-teal)]" />Flamingo will cite this text in new decisions. Only one supplemental document is active{published ? <>, so <b>{published.title}</b> will be archived</> : ""}. Built-in caps still apply.</p>} />
      <ConfirmDialog open={!!archiveDoc} onOpenChange={(v) => !v && setArchiveDoc(null)} tone="plum" pending={pending} title={`Archive "${archiveDoc?.title ?? ""}"?`} confirmLabel="Archive"
        onConfirm={() => archiveDoc && void save({ action: "archive", version: s.policy.version, documentId: archiveDoc.id }, "Document archived").then(() => setArchiveDoc(null))}
        body={<p>{archiveDoc?.status === "published" ? "New decisions will stop citing it and fall back to the built-in policy. Past cases keep their citations." : "The draft will be kept for the record but cannot be published later without importing again."}</p>} />
    </div>
  );
}

function PageList({ pages }: { pages: CommercePolicyPage[] }) {
  return (
    <div className="ks-scroll mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-white p-3">
      {pages.map((p) => (
        <div key={p.page} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 text-xs">
          <span className="mono pt-0.5 text-[var(--ks-mute)]">p.{p.page}</span>
          <p className="line-clamp-6 whitespace-pre-wrap break-words leading-relaxed text-[var(--ks-ink-2)]">{p.text}</p>
        </div>
      ))}
    </div>
  );
}
