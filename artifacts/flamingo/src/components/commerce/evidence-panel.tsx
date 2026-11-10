"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Eye,
  ImageOff,
  ImagePlus,
  LoaderCircle,
  Receipt,
  RefreshCw,
  ScanText,
  Tag,
  X,
} from "lucide-react";
import {
  getGetCommerceEvidenceImageQueryKey,
  getGetCommerceStateQueryKey,
  useAddCommerceEvidence,
  useGetCommerceEvidenceImage,
  useRetryCommerceEvidence,
  type CommerceEvidence,
  type CommerceState,
  type CommerceTicket,
  type CommerceVisionFindings,
} from "@workspace/api-client-react";
import { errText } from "@/lib/commerce";
import { cn } from "@/lib/utils";

type Kind = "damage" | "receipt" | "label";

const MAX_PER_CASE = 5;
const MAX_INPUT = 10 * 1024 * 1024;
const MAX_OUTPUT = 1.5 * 1024 * 1024;
const MAX_EDGE = 1600;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const STATE_KEY = getGetCommerceStateQueryKey();

const KINDS: { id: Kind; label: string; icon: typeof Camera; hint: string }[] = [
  { id: "damage", label: "Damage", icon: Camera, hint: "The item or packaging" },
  { id: "receipt", label: "Receipt", icon: Receipt, hint: "Proof of purchase" },
  { id: "label", label: "Label", icon: Tag, hint: "Shipping or product label" },
];

const ASSESSMENT: Record<string, { label: string; cls: string }> = {
  not_assessed: { label: "Not inspected", cls: "bg-[#F2F0F3] text-[#626671]" },
  visible_damage: { label: "Possible damage seen", cls: "bg-[#FDE4DF] text-[#B93428]" },
  no_visible_damage: { label: "No damage seen", cls: "bg-[#DCF1EC] text-[#1F6F62]" },
  unclear: { label: "Unclear photo", cls: "bg-[#FDF0D6] text-[#8A5A12]" },
};

const DAMAGE: Record<string, string> = {
  crack: "Crack", scratch: "Scratch", dent: "Dent", broken_part: "Broken part", missing_part: "Missing part",
  stain: "Stain", water: "Water", packaging_damage: "Packaging", other: "Other",
};
const SEVERITY: Record<string, { label: string; dots: number; cls: string }> = {
  none: { label: "None", dots: 0, cls: "bg-[#1F8A7A]" },
  minor: { label: "Minor", dots: 1, cls: "bg-[#E4B860]" },
  moderate: { label: "Moderate", dots: 2, cls: "bg-[#F2665A]" },
  severe: { label: "Severe", dots: 3, cls: "bg-[#B93428]" },
};
const MATCH: Record<string, { label: string; cls: string }> = {
  yes: { label: "Matches order", cls: "bg-[#DCF1EC] text-[#1F6F62]" },
  no: { label: "May not match order", cls: "bg-[#FDE4DF] text-[#B93428]" },
  unclear: { label: "Match unclear", cls: "bg-[#F2F0F3] text-[#626671]" },
};

type Draft = { key: string; file: File; preview: string };

/** Re-encode through a canvas: drops EXIF/GPS metadata and caps size. */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This image could not be read."));
      el.src = url;
    });
    if (img.naturalWidth * img.naturalHeight > 24_000_000) {
      throw new Error("This image is larger than 24 megapixels. Please use a smaller photo.");
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare this image.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (Math.floor((base64.length * 3) / 4) > MAX_OUTPUT) {
      throw new Error("This image is still larger than 1.5 MB after compression.");
    }
    return base64;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function useNewest() {
  const qc = useQueryClient();
  return (next: CommerceState) =>
    qc.setQueryData<CommerceState>(STATE_KEY, (old) =>
      old && old.id === next.id && old.revision > next.revision ? old : next,
    );
}

export function EvidencePanel({
  ticket,
  readOnly = false,
  disabled = false,
  disabledReason,
  onBusyChange,
  className,
}: {
  ticket: CommerceTicket;
  readOnly?: boolean;
  /** Blocks starting a new upload (e.g. while a voice turn is in flight). */
  disabled?: boolean;
  disabledReason?: string;
  onBusyChange?: (busy: boolean) => Promise<void> | void;
  className?: string;
}) {
  const qc = useQueryClient();
  const newest = useNewest();
  const add = useAddCommerceEvidence();
  const retry = useRetryCommerceEvidence();
  const addRef = useRef(add.mutateAsync);
  addRef.current = add.mutateAsync;
  const retryRef = useRef(retry.mutateAsync);
  retryRef.current = retry.mutateAsync;
  const busyCb = useRef(onBusyChange);
  busyCb.current = onBusyChange;

  const items = ticket.evidence ?? [];
  const remaining = Math.max(0, MAX_PER_CASE - items.length);
  const [kind, setKind] = useState<Kind>("damage");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CommerceEvidence | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  useEffect(() => () => drafts.forEach((d) => URL.revokeObjectURL(d.preview)), [drafts]);
  useEffect(() => () => void Promise.resolve(busyCb.current?.(false)).catch(() => undefined), []);

  const latestVersion = () => {
    const s = qc.getQueryData<CommerceState>(STATE_KEY);
    return s?.tickets.find((x) => x.id === ticket.id)?.version ?? ticket.version;
  };

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError(null);
    const room = remaining - drafts.length;
    const next: Draft[] = [];
    const problems: string[] = [];
    for (const f of files) {
      if (!ACCEPT.includes(f.type)) problems.push(`${f.name}: only JPEG, PNG or WebP.`);
      else if (f.size > MAX_INPUT) problems.push(`${f.name}: larger than 10 MB.`);
      else if (next.length >= room) problems.push(`Only ${MAX_PER_CASE} images per case.`);
      else next.push({ key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, file: f, preview: URL.createObjectURL(f) });
    }
    if (problems.length) setError(Array.from(new Set(problems)).join(" "));
    setDrafts((d) => [...d, ...next]);
  };

  const removeDraft = (key: string) =>
    setDrafts((d) => {
      const hit = d.find((x) => x.key === key);
      if (hit) URL.revokeObjectURL(hit.preview);
      return d.filter((x) => x.key !== key);
    });

  const upload = async () => {
    if (lock.current || !drafts.length || !consent || disabled) return;
    lock.current = true;
    setUploading(true);
    setError(null);
    setProgress("Pausing microphone");
    try {
      await busyCb.current?.(true);
    } catch (e) {
      lock.current = false;
      setUploading(false);
      setProgress(null);
      setError(`Could not pause the microphone: ${errText(e)}`);
      await Promise.resolve(busyCb.current?.(false)).catch(() => undefined);
      return;
    }
    let version = latestVersion();
    const queue = [...drafts];
    try {
      for (let i = 0; i < queue.length; i++) {
        const d = queue[i];
        setProgress(`Preparing ${i + 1} of ${queue.length}`);
        try {
          const image = await compress(d.file);
          setProgress(`Sending ${i + 1} of ${queue.length}`);
          const state = await addRef.current({
            data: { ticketId: ticket.id, version, name: d.file.name.slice(0, 120) || "photo.jpg", kind, image },
          });
          newest(state);
          version = state.tickets.find((x) => x.id === ticket.id)?.version ?? version;
          removeDraft(d.key);
        } catch (e) {
          void qc.invalidateQueries({ queryKey: STATE_KEY });
          setError(`${d.file.name} was not added: ${errText(e)} Earlier photos were kept.`);
          break;
        }
      }
    } finally {
      lock.current = false;
      setUploading(false);
      setProgress(null);
      await Promise.resolve(busyCb.current?.(false)).catch(() => undefined);
    }
  };

  const retryOne = async (ev: CommerceEvidence) => {
    if (retrying || disabled) return;
    setRetrying(ev.id);
    setError(null);
    try {
      await busyCb.current?.(true);
      newest(await retryRef.current({ data: { ticketId: ticket.id, evidenceId: ev.id, version: latestVersion() } }));
    } catch (e) {
      void qc.invalidateQueries({ queryKey: STATE_KEY });
      setError(`Retry failed: ${errText(e)}`);
    } finally {
      setRetrying(null);
      await Promise.resolve(busyCb.current?.(false)).catch(() => undefined);
    }
  };

  const canPick = !readOnly && !uploading && remaining - drafts.length > 0;

  return (
    <div className={cn("min-w-0", className)} data-testid="panel-evidence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#858995]">Photos</p>
          <p className="mt-1 text-sm font-semibold text-[#191919]">
            {items.length} of {MAX_PER_CASE} added
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!canPick}
            data-testid="button-pick-evidence"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E9EAED] bg-white px-3.5 text-xs font-semibold text-[#30243A] transition hover:border-[#D9396F]/40 hover:bg-[#FDECF2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" /> Choose images
          </button>
        )}
        <input ref={input} type="file" accept={ACCEPT.join(",")} multiple hidden onChange={pick} data-testid="input-evidence-file" />
      </div>

      {!readOnly && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Photo category">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                disabled={uploading}
                data-testid={`button-kind-${k.id}`}
                className={cn(
                  "flex flex-col items-start rounded-xl border px-2.5 py-2 text-left transition",
                  kind === k.id ? "border-[#F2B8CB] bg-[#FEF5F8]" : "border-[#E9EAED] bg-white hover:bg-[#F8F9FB]",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#30243A]">
                  <k.icon className={cn("h-3.5 w-3.5", kind === k.id && "text-[#B92A5B]")} /> {k.label}
                </span>
                <span className="mt-0.5 hidden text-[10px] text-[#858995] sm:block">{k.hint}</span>
              </button>
            ))}
          </div>

          {drafts.length > 0 && (
            <div className="mt-3 rounded-2xl border border-dashed border-[#F2B8CB] bg-[#FEF8FA] p-3">
              <div className="flex flex-wrap gap-2">
                {drafts.map((d) => (
                  <div key={d.key} className="relative">
                    <img src={d.preview} alt={d.file.name} className="h-16 w-16 rounded-lg border border-[#E9EAED] object-cover" />
                    {!uploading && (
                      <button
                        type="button"
                        onClick={() => removeDraft(d.key)}
                        aria-label={`Remove ${d.file.name}`}
                        data-testid={`button-remove-draft-${d.key}`}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#30243A] text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[11px] leading-relaxed text-[#626671]">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={uploading}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#D9396F]"
                  data-testid="checkbox-evidence-consent"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-[#30243A]">I agree to share these photos</span>
                  <details className="group mt-0.5">
                    <summary className="cursor-pointer list-none text-[10px] text-[#858995] hover:text-[#30243A]">What happens to them <span className="inline-block transition group-open:rotate-180">&#9662;</span></summary>
                    <span className="mt-1 block text-[10px] text-[#747780]">
                      Text is read by Elastic Jina OCR. Damage photos are inspected by an open-weight vision model (Qwen). Both are metered separately.
                      The inspection is an automated impression, not proof of damage or authenticity, and not a decision. Do not include passwords, ID documents or payment cards.
                    </span>
                  </details>
                </span>
              </label>

              {disabled && disabledReason && (
                <p className="mt-2 text-[11px] font-medium text-[#8A5A12]" data-testid="text-evidence-blocked">{disabledReason}</p>
              )}

              <button
                type="button"
                onClick={() => void upload()}
                disabled={!consent || uploading || disabled}
                data-testid="button-upload-evidence"
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D9396F] px-4 text-sm font-semibold text-white transition hover:bg-[#B92A5B] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? progress ?? "Sending..." : `Add ${drafts.length} as ${kind}`}
              </button>
            </div>
          )}
          <p className="mt-2 text-[10px] text-[#858995]" title="Resized on your device and metadata removed before sending.">JPEG, PNG, WebP up to 10 MB. Metadata removed.</p>
        </>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#E9EAED] bg-[#F8F9FB] p-4 text-xs text-[#747780]">
          <ImageOff className="h-5 w-5 shrink-0 text-[#B0B3BC]" />
          {readOnly ? "The customer has not shared any photos for this case." : "No photos yet. A clear picture of the damage or label helps us decide faster."}
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((ev) => (
            <EvidenceRow
              key={ev.id}
              ticketId={ticket.id}
              ev={ev}
              readOnly={readOnly}
              retrying={retrying === ev.id}
              retryDisabled={!!retrying || uploading || disabled}
              onRetry={() => void retryOne(ev)}
              onView={() => setViewing(ev)}
            />
          ))}
        </ul>
      )}

      {viewing && <Viewer ticketId={ticket.id} ev={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function useImage(ticketId: string, evidenceId: string, enabled: boolean) {
  const q = useGetCommerceEvidenceImage(ticketId, evidenceId, {
    query: { enabled, queryKey: getGetCommerceEvidenceImageQueryKey(ticketId, evidenceId), staleTime: Infinity, retry: 1 },
    request: { responseType: "blob" },
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!(q.data instanceof Blob)) return;
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  return { url, loading: q.isLoading, failed: q.isError };
}

function Thumb({ ticketId, ev, className }: { ticketId: string; ev: CommerceEvidence; className?: string }) {
  const { url, loading, failed } = useImage(ticketId, ev.id, true);
  if (url) return <img src={url} alt={ev.name} className={cn("object-cover", className)} />;
  return (
    <div className={cn("flex items-center justify-center bg-[#F2F0F3]", loading && "animate-pulse", className)}>
      {failed && <ImageOff className="h-4 w-4 text-[#A0A3AC]" />}
    </div>
  );
}

function EvidenceRow({
  ticketId, ev, readOnly, retrying, retryDisabled, onRetry, onView,
}: {
  ticketId: string; ev: CommerceEvidence; readOnly: boolean; retrying: boolean; retryDisabled: boolean; onRetry: () => void; onView: () => void;
}) {
  const kind = KINDS.find((k) => k.id === ev.kind);
  const [open, setOpen] = useState(false);
  const ready = ev.status === "ready";
  const hasDetail = ready && !!(ev.ocrText || ev.observation || ev.question || ev.notice || ev.vision);
  return (
    <li className="rounded-2xl border border-[#E9EAED] bg-white p-3 transition hover:border-[#E2D6D0]" data-testid={`row-evidence-${ev.id}`}>
      <div className="flex gap-3">
        <button type="button" onClick={onView} aria-label={`View ${ev.name}`} data-testid={`button-view-evidence-${ev.id}`} className="shrink-0">
          <Thumb ticketId={ticketId} ev={ev} className="h-16 w-16 rounded-xl border border-[#E9EAED]" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#F2F0F6] px-2 py-0.5 text-[10px] font-semibold text-[#665770]">{kind?.label ?? ev.kind}</span>
            {ready && ev.assessment !== "not_assessed" ? (
              <span className={cn("ks-pop rounded-full px-2 py-0.5 text-[10px] font-semibold", ASSESSMENT[ev.assessment]?.cls)} data-testid={`status-assessment-${ev.id}`}>
                {ASSESSMENT[ev.assessment]?.label ?? ev.assessment}
              </span>
            ) : (
              <StatusPill status={ev.status} staff={readOnly} />
            )}
          </div>
          <p className="mt-1 truncate text-xs font-medium text-[#30243A]">{ev.name}</p>
          {ready && ev.vision && <VisionSummary v={ev.vision} staff={readOnly} />}
          {ev.status === "failed" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-[#B93428]">{ev.notice || "Could not finish."}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retryDisabled}
                  data-testid={`button-retry-evidence-${ev.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E9EAED] px-2.5 text-[11px] font-semibold text-[#30243A] hover:bg-[#F7F8FA] disabled:opacity-50"
                >
                  {retrying ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {hasDetail && (
        <div className="mt-2 border-t border-[#F0F0F3] pt-1.5">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid={`button-evidence-details-${ev.id}`}
            className="flex w-full items-center justify-between gap-2 py-1 text-[11px] font-medium text-[#747780] hover:text-[#30243A]">
            {open ? "Hide details" : "Details"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
          </button>
          <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="min-h-0 overflow-hidden">{open && <Findings ev={ev} staff={readOnly} />}</div>
          </div>
        </div>
      )}
    </li>
  );
}

function VisionSummary({ v, staff }: { v: CommerceVisionFindings; staff: boolean }) {
  const sev = SEVERITY[v.severity] ?? SEVERITY.none;
  const pct = Math.round(Math.max(0, Math.min(1, v.confidence)) * 100);
  return (
    <div className="mt-1.5 space-y-1.5" data-testid="vision-summary">
      {(v.damageTypes.length > 0 || staff || v.imageQuality === "poor") && (
        <div className="flex flex-wrap gap-1">
          {v.damageTypes.map((d, i) => (
            <span key={d} className="ks-pop rounded-md border border-[#F0D3CC] bg-[#FEF5F8] px-1.5 py-0.5 text-[10px] font-medium text-[#8E3A2E]" style={{ animationDelay: `${i * 50}ms` }}>
              {DAMAGE[d] ?? d}
            </span>
          ))}
          {v.imageQuality === "poor" && (
            <span className="ks-pop rounded-md bg-[#FDF0D6] px-1.5 py-0.5 text-[10px] font-medium text-[#8A5A12]">Low quality photo</span>
          )}
          {staff && (
            <span className={cn("ks-pop rounded-md px-1.5 py-0.5 text-[10px] font-medium", MATCH[v.matchesOrder]?.cls)}>{MATCH[v.matchesOrder]?.label}</span>
          )}
          {staff && v.labelConcern && (
            <span className="ks-pop inline-flex items-center gap-1 rounded-md bg-[#FDE4DF] px-1.5 py-0.5 text-[10px] font-semibold text-[#B93428]" title={v.labelConcern} data-testid="chip-label-concern">
              <AlertTriangle className="h-2.5 w-2.5" /> Label concern
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-[#858995]">
        <span className="inline-flex items-center gap-1" title={`Severity: ${sev.label}`}>
          <span className="flex gap-0.5">
            {[1, 2, 3].map((n) => <i key={n} className={cn("h-1.5 w-1.5 rounded-full", n <= sev.dots ? sev.cls : "bg-[#E9EAED]")} />)}
          </span>
          {sev.label}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5" title="How sure the model is. Not a verification.">
          <span className="ks-meter h-1 w-12 overflow-hidden rounded-full bg-[#EFEAE7]">
            <i className="bg-[#3A2438]" style={{ width: `${pct}%` }} />
          </span>
          <span className="tabular-nums">{pct}%</span>
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status, staff }: { status: CommerceEvidence["status"]; staff: boolean }) {
  if (status === "ready")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#16845B]"><CheckCircle2 className="h-3 w-3" /> {staff ? "Processed" : "Received"}</span>;
  if (status === "failed")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B93428]"><AlertTriangle className="h-3 w-3" /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#8A5A12]"><LoaderCircle className="h-3 w-3 animate-spin" /> Processing</span>;
}

function Findings({ ev, staff }: { ev: CommerceEvidence; staff: boolean }) {
  const v = ev.vision;
  return (
    <div className="space-y-2 pb-1 pt-1.5 text-xs">
      {v && (v.subject || v.location) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {v.subject && <><dt className="text-[#858995]">Subject</dt><dd className="min-w-0 break-words text-[#30243A]">{v.subject}</dd></>}
          {v.location && <><dt className="text-[#858995]">Where</dt><dd className="min-w-0 break-words text-[#30243A]">{v.location}</dd></>}
        </dl>
      )}
      {staff && v?.labelConcern && (
        <p className="rounded-lg border-l-2 border-[#B93428] bg-[#FFF3F0] px-2.5 py-1.5 text-[11px] text-[#5A2A24]"><span className="font-semibold">Label concern: </span>{v.labelConcern}</p>
      )}
      {ev.observation && (
        <div className="rounded-lg border-l-2 border-[#E4B860] bg-[#FFFAEE] px-2.5 py-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A5A12]"><Eye className="h-3 w-3" /> Unverified observation</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[#4A4250]" data-testid={`text-observation-${ev.id}`}>{ev.observation}</p>
        </div>
      )}
      {ev.ocrText && (
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#858995]"><ScanText className="h-3 w-3" /> Text found</p>
          <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[#F8F9FB] p-2 font-mono text-[11px] leading-relaxed text-[#30243A] [overflow-wrap:anywhere]" data-testid={`text-ocr-${ev.id}`}>{ev.ocrText}</pre>
        </div>
      )}
      {ev.question && (
        <p className="rounded-lg bg-[#FEF5F8] px-2.5 py-2 text-[#30243A]"><span className="text-[#858995]">{staff ? "Follow-up: " : "We may ask: "}</span>{ev.question}</p>
      )}
      {ev.notice && <p className="text-[10px] text-[#858995]">{ev.notice}</p>}
      <p className="text-[10px] leading-relaxed text-[#9A9DA6]">
        {v ? `Inspected by ${v.model || "an open-weight vision model (Qwen)"}. ` : ""}
        {ev.ocrText ? "Text read by Elastic Jina OCR. " : ""}
        {staff ? "Automated impression, not proof of cause, ownership or eligibility." : "An automated first look only. It does not verify or approve anything."}
      </p>
    </div>
  );
}

function Viewer({ ticketId, ev, onClose }: { ticketId: string; ev: CommerceEvidence; onClose: () => void }) {
  const { url, failed } = useImage(ticketId, ev.id, true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);
  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-[#191419]/90 p-4" role="dialog" aria-modal="true" aria-label={ev.name} data-testid="dialog-evidence-viewer">
      <div className="flex items-center justify-between gap-3 text-white">
        <p className="min-w-0 truncate text-sm font-medium">{ev.name}</p>
        <button type="button" onClick={onClose} aria-label="Close image" data-testid="button-close-viewer" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center pt-3" onClick={onClose}>
        {url ? <img src={url} alt={ev.name} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          : failed ? <p className="text-sm text-white/70">The original image could not be loaded.</p>
          : <LoaderCircle className="h-6 w-6 animate-spin text-white/70" />}
      </div>
    </div>
  );
}

/** Drawer used inside the full-screen call overlay; stays mounted in-place so the call keeps running. */
export function EvidenceDrawer({ open, onClose, locked = false, children }: { open: boolean; onClose: () => void; locked?: boolean; children: React.ReactNode }) {
  const closeRef = useRef(() => {
    if (!lockedRef.current) onClose();
  });
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  closeRef.current = () => {
    if (!lockedRef.current) onClose();
  };
  const tryClose = () => closeRef.current();
  useEffect(() => {
    // While a batch is in flight, also swallow Escape when hidden so the parent overlay cannot unmount it.
    if (!open && !locked) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[data-testid="dialog-evidence-viewer"]')) {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open, locked]);
  // Stay mounted while closed so an in-flight batch is never unmounted mid-request.
  return (
    <div hidden={!open} aria-hidden={!open} className={cn("fixed inset-0 z-[1050] items-end justify-center bg-[#30243A]/30 sm:items-stretch sm:justify-end", open ? "flex" : "hidden")} data-evidence-drawer>
      <button type="button" aria-label="Close photos" className="absolute inset-0 cursor-default" onClick={tryClose} tabIndex={-1} />
      <div className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#E9EAED] bg-[#FAF8F7] shadow-[0_-8px_40px_rgba(48,36,58,0.18)] sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-3xl">
        <div className="flex items-center justify-between border-b border-[#E9EAED] bg-white px-4 py-3">
          <p className="text-sm font-semibold text-[#191919]">Share photos</p>
          <button type="button" onClick={tryClose} disabled={locked} title={locked ? "Wait for the photos to finish sending" : undefined} data-testid="button-close-evidence" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#626671] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-50">
            {locked ? "Sending..." : "Back to call"} <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
