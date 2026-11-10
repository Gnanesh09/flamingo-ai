"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Headset, ImagePlus, Keyboard, LoaderCircle, Lock, MessageCircle, Phone, Send, Info, ShieldCheck } from "lucide-react";
import type { CommerceTicket } from "@workspace/api-client-react";
import { useCommerce, useCommerceState } from "@/hooks/use-commerce";
import { useCommerceCall } from "@/hooks/use-commerce-call";
import { EvidencePanel } from "@/components/commerce/evidence-panel";
import { TICKET_STATUS, REFUND_STATE, isClosed, orderOf, productOf, usd, when } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { ConfirmDialog, FlamingoMark, Reveal } from "@/components/commerce/kit";
import { InlineError, SectionLabel, StatusDot } from "./ui";
import { OrderContext } from "./order-context";
import { Bubble } from "./bubble";
import { CallOverlay } from "./call-overlay";
import Link from "next/link";

export function TicketView({ ticket: t }: { ticket: CommerceTicket }) {
  const s = useCommerceState();

  const { run, busyAction, state, streams } = useCommerce();

  const stream = streams[t.id];

  // Remember how many saved messages existed when this stream began, so the
  // live bubble disappears exactly when the saved agent reply lands.
  const streamBase = useRef<{ id: string; count: number } | null>(null);

  if (stream && streamBase.current?.id !== stream.streamId) {
    streamBase.current = { id: stream.streamId, count: t.messages.length };
  }

  const savedReplyLanded =
    !!stream &&
    t.messages
      .slice(streamBase.current?.count ?? t.messages.length)
      .some((m) => m.role === "agent");

  const liveText = stream && !savedReplyLanded ? stream.text : null;

  const hasCustomerMsg = t.messages.some((m) => m.role === "customer");

  const [mode, setMode] = useState<"choose" | "text" | "call">(
    hasCustomerMsg ? "text" : "choose",
  );

  const [draft, setDraft] = useState("");

  const [pending, setPending] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [escOpen, setEscOpen] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const [messageError, setMessageError] = useState<string | null>(null);

  const closed = isClosed(t);

  const stateRef = useRef(state);

  stateRef.current = state;

  const call = useCommerceCall(t.id, () => stateRef.current);

  const end = useRef<HTMLDivElement>(null);

  const messageList = useRef<HTMLDivElement>(null);

  const sendingRef = useRef(false);

  const confirmRef = useRef(false);

  const escalateRef = useRef(false);

  const previousCount = useRef(t.messages.length);

  const o = orderOf(s, t.orderId);

  const product = productOf(s, o?.productId ?? "");

  const inCall = mode === "call" && !closed;

  const [photosOpen, setPhotosOpen] = useState(false);

  const evidenceCount = t.evidence?.length ?? 0;

  const proposalAmount = o?.amount;

  // Flamingo asks once for a photo of a reported fault; offer one-tap answers.
  const lastAgent = [...t.messages].reverse().find((m) => m.role === "agent");
  const photoAsked = t.status === "open" && evidenceCount === 0 && !!lastAgent && /Tap Photos to upload one|Add it with Photos/.test(lastAgent.text);

  /*
   * Scroll when the conversation changes.
   * Avoid moving the viewport when the customer is
   * reading older messages.
   */

  useEffect(() => {
    const list = messageList.current;

    if (!list || inCall) return;

    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight;

    const nearBottom = distanceFromBottom < 160;

    if (nearBottom || previousCount.current === 0) {
      end.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }

    previousCount.current = t.messages.length;
  }, [t.messages.length, pending, inCall, liveText?.length]);

  /*
   * Restore text drafts when switching away from voice.
   */

  const toText = useCallback(() => {
    const unsent = call.status === "error" ? call.heardText : null;

    if (unsent) {
      setDraft((current) =>
        current.trim() ? `${current.trim()}\n${unsent}` : unsent,
      );
    }

    call.hangup();

    setMode("text");
  }, [call]);

  /*
   * Send a message with a synchronous submission lock.
   */

  const send = async (e?: FormEvent<HTMLFormElement>, quick?: string) => {
    e?.preventDefault();

    const text = (quick ?? draft).trim();

    if (!text || sendingRef.current || pending || closed) {
      return;
    }

    sendingRef.current = true;

    setPending(text);
    if (!quick) setDraft("");
    setMessageError(null);
    setActionError(null);

    try {
      await run({
        action: "message",
        ticketId: t.id,
        message: text,
        channel: "text",
        version: t.version,
      });
    } catch {
      if (!quick) setDraft((current) => (current.trim() ? current : text));

      setMessageError(
        "Your message couldn't be sent. Your text has been preserved; please try again.",
      );
    } finally {
      sendingRef.current = false;
      setPending(null);
    }
  };

  /*
   * Confirm the proposed action.
   */

  const confirmAction = async () => {
    if (confirmRef.current || closed) return;

    confirmRef.current = true;

    setActionError(null);

    try {
      await run({
        action: "confirm",
        ticketId: t.id,
        version: t.version,
      });

      setConfirmOpen(false);
    } catch {
      setActionError(
        "We couldn't confirm this action. Check the latest case status before retrying.",
      );
    } finally {
      confirmRef.current = false;
    }
  };

  /*
   * Escalate to a human support agent.
   */

  const escalateAction = async () => {
    if (escalateRef.current || closed) return;

    escalateRef.current = true;

    setActionError(null);

    try {
      await run({
        action: "escalate",
        ticketId: t.id,
        version: t.version,
      });

      setEscOpen(false);
    } catch {
      setActionError(
        "We couldn't connect you to a support agent. Please try again.",
      );
    } finally {
      escalateRef.current = false;
    }
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();

      void send();
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-170px)] min-w-0 flex-col overflow-hidden rounded-[20px] border border-[var(--ks-line)] bg-[var(--ks-paper)] lg:h-[calc(100dvh-170px)]">
      <div className="flex items-center gap-1 border-b border-[var(--ks-line)] pr-2 sm:pr-3">
        <Link href="/kikostore/orders" aria-label="My orders" title="My orders" data-testid="link-back-orders"
          className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ks-ink-2)] transition hover:bg-[#f3f2f6]">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div className="min-w-0 flex-1 [&>div]:border-b-0 [&>div]:pl-1"><OrderContext ticket={t} /></div>
        {(!closed || evidenceCount > 0) && (
          <button type="button" onClick={() => setPhotosOpen((open) => !open)} aria-expanded={photosOpen} aria-controls="case-evidence"
            data-testid="button-toggle-evidence" aria-label={`Photos, ${evidenceCount} of 5`} title="Photos"
            className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
              photosOpen ? "bg-[var(--ks-coral-l)] text-[var(--ks-coral-d)]" : "text-[var(--ks-ink-2)] hover:bg-[#f3f2f6]")}>
            <ImagePlus className="h-[18px] w-[18px]" />
            {evidenceCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ks-coral)] px-1 text-[10px] font-semibold tabular-nums text-white">{evidenceCount}</span>}
          </button>
        )}
        {s.voiceConfigured && !closed && mode !== "call" && (
          <button type="button" onClick={() => setMode("call")} disabled={!!pending} aria-label="Start voice call" title="Voice call"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ks-ink-2)] transition hover:bg-[#f3f2f6] disabled:opacity-40">
            <Phone className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      {!photosOpen && evidenceCount > 0 && (
        <div className="ks-scroll flex gap-1.5 overflow-x-auto border-b border-[var(--ks-line)] px-4 py-2 sm:px-5">
          {(t.evidence ?? []).map((ev) => (
            <button key={ev.id} type="button" onClick={() => setPhotosOpen(true)}
              className="ks-pop inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--ks-line)] bg-[#f8f8fa] py-1 pl-2 pr-2.5 text-[11.5px] text-[var(--ks-ink-2)] hover:border-[var(--ks-line-2)]">
              <span className={cn("h-1.5 w-1.5 rounded-full", ev.status === "ready" ? (ev.assessment === "visible_damage" ? "bg-[var(--ks-coral)]" : "bg-[#1f8a7a]") : ev.status === "failed" ? "bg-[#b93428]" : "animate-pulse bg-[#e4b860]")} />
              <span className="capitalize">{ev.kind}</span>
              <span className="text-[var(--ks-mute)]">{ev.status === "processing" ? "checking" : ev.status === "failed" ? "failed" : ev.assessment === "visible_damage" ? "damage seen" : "received"}</span>
            </button>
          ))}
        </div>
      )}

      {photosOpen && !inCall && (
        <div
          id="case-evidence"
          className="ks-fade-in ks-scroll max-h-[45dvh] overflow-y-auto border-b border-[var(--ks-line)] bg-[#fbfbfc] px-4 py-4 sm:px-6"
          data-testid="panel-text-evidence"
        >
          <EvidencePanel
            ticket={t}
            disabled={!!pending || closed}
            disabledReason={
              closed
                ? "This case is closed."
                : "Wait for the reply, then add photos."
            }
          />
        </div>
      )}

      {/* =================================================
          MESSAGES
          ================================================= */}

      <div
        ref={messageList}
        role="log"
        aria-label="Conversation messages"
        aria-relevant="additions text"
        aria-live="polite"
        className="ks-scroll min-h-[360px] max-h-[64dvh] flex-1 overflow-y-auto bg-[var(--ks-paper)] px-3 py-5 sm:px-6 lg:max-h-none"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
          {t.messages.length === 0 && !pending && (
            <div className="flex flex-col items-center py-10 text-center">
              <FlamingoMark className="h-14 w-14" />

              <p className="mt-4 text-[17px] font-medium text-[var(--ks-ink)]">
                What went wrong?
              </p>

              
            </div>
          )}

          {t.messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}

          {pending && (
            <Bubble
              m={{
                id: "pending",
                role: "customer",
                text: pending,
                at: "",
                channel: "text",
              }}
              pending
            />
          )}

          {liveText ? (
            <Bubble
              m={{
                id: "stream",
                role: "agent",
                text: liveText,
                at: "",
                channel: "text",
              }}
              streaming={!stream?.done}
            />
          ) : (
            (pending || (stream && !savedReplyLanded)) && (
              <div
                className="ks-fade-in flex items-end gap-2 text-[12px] text-[var(--ks-mute)]"
                data-testid="status-thinking"
              >
                <FlamingoMark className="h-7 w-7 shrink-0" />
                <span className="flex items-center gap-1 rounded-[22px] rounded-bl-md bg-[#f1f0f4] px-4 py-3.5" aria-label="Flamingo is checking your order">
                  <span className="ks-dot" />
                  <span className="ks-dot" style={{ animationDelay: ".16s" }} />
                  <span className="ks-dot" style={{ animationDelay: ".32s" }} />
                </span>
                <span className="mb-1">Checking your order</span>
              </div>
            )
          )}

          {mode !== "text" && actionError && !confirmOpen && !escOpen && (
            <InlineError
              message={actionError}
              onDismiss={() => setActionError(null)}
            />
          )}

          <div ref={end} />
        </div>
      </div>

      {/* =================================================
          REFUND / RETURN PROPOSAL
          ================================================= */}

      {t.status === "awaiting_confirmation" && t.proposedAction && (
        <div className="ks-fade-in border-t border-[#F6DCE6] bg-gradient-to-b from-[#FEF5F8] to-white px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#D9396F] text-white shadow-[0_6px_16px_-6px_rgba(217,57,111,.6)]">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#30243A]">
                  {t.proposedAction === "refund" ? "Refund ready" : "Return ready"}
                </p>

                {t.proposedAction === "refund" && (
                  <p className="mt-0.5 text-[32px] font-semibold leading-tight tracking-[-0.03em] text-[#191919] tabular-nums">
                    {usd(proposalAmount)}
                  </p>
                )}

                <Reveal
                  className="mt-1"
                  tone="amber"
                  summary={o?.source === "sample" ? "Demo order" : "PayPal Sandbox"}
                  testId="button-proposal-info"
                >
                  <p className="text-[#747780]">
                    Nothing happens until you confirm.{" "}
                    {o?.source === "sample"
                      ? "The refund is simulated."
                      : "Test transactions only."}
                  </p>
                </Reveal>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:w-[220px]">
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setConfirmOpen(true);
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#D9396F] px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(217,57,111,.7)] transition hover:bg-[#B92A5B] active:scale-[0.98]"
                data-testid="button-confirm-proposal"
              >
                {t.proposedAction === "refund" ? "Confirm refund" : "Confirm return"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setEscOpen(true);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-xs font-medium text-[#626671] transition hover:bg-[#F3F2F6]"
                data-testid="button-escalate-proposal"
              >
                <Headset className="h-3.5 w-3.5" />
                Talk to a person
              </button>
            </div>
          </div>

          {actionError && (
            <div className="mt-4">
              <InlineError message={actionError} />
            </div>
          )}
        </div>
      )}

      {/* =================================================
          CLOSED STATE
          ================================================= */}

      {closed ? (
        <div className="border-t border-[var(--ks-line)] bg-[#f8f8fa] px-4 py-3.5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#747780]" />

              <div>
                <p className="text-sm font-semibold text-[#30243A]">
                  Closed
                </p>

                <Reveal className="mt-0.5" summary="What this means">
                  <p className="text-[#747780]">
                    {TICKET_STATUS[t.status].hint}{" "}
                    {t.refundState !== "none" && REFUND_STATE[t.refundState].hint}
                  </p>
                </Reveal>
              </div>
            </div>

            <Link
              href="/kikostore/orders"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--ks-line-2)] bg-white px-4 text-[13px] font-medium transition hover:bg-[#f3f2f6]"
            >
              Back to orders
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* =================================================
              CHOOSE CONTACT METHOD
              ================================================= */}

          {mode === "choose" ? (
            <div className="border-t border-[var(--ks-line)] bg-[var(--ks-paper)] p-4 sm:p-5">
              <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setMode("text")} data-testid="button-mode-text"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--ks-coral)] text-[15px] font-medium text-white transition hover:bg-[var(--ks-coral-d)] active:scale-[0.98]">
                  <Keyboard className="h-[18px] w-[18px]" /> Type a message
                </button>
                <button type="button" onClick={() => setMode("call")} disabled={!s.voiceConfigured} data-testid="button-mode-call"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--ks-line-2)] bg-white text-[15px] font-medium text-[var(--ks-ink)] transition hover:bg-[#f3f2f6] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                  <Phone className="h-[18px] w-[18px]" /> {s.voiceConfigured ? "Call Flamingo" : "Calls unavailable"}
                </button>
              </div>
            </div>
          ) : (
            /* =================================================
               MESSAGE COMPOSER
               ================================================= */

            <form
              onSubmit={send}
              className="border-t border-[var(--ks-line)] bg-[var(--ks-paper)] px-2 pb-2 pt-2.5 sm:px-4"
            >
              <div className="mx-auto max-w-3xl">
                {photoAsked && !photosOpen && !pending && (
                  <div className="ks-pop mb-2 flex flex-wrap gap-1.5 px-1" data-testid="photo-request-actions">
                    <button type="button" onClick={() => setPhotosOpen(true)} data-testid="button-photo-add"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--ks-coral-l)] px-3.5 text-[13px] font-medium text-[var(--ks-coral-d)] transition hover:brightness-95">
                      <ImagePlus className="h-4 w-4" /> Add a photo
                    </button>
                    <button type="button" onClick={() => void send(undefined, "I can’t take a photo right now.")} data-testid="button-photo-skip"
                      className="inline-flex h-9 items-center rounded-full border border-[var(--ks-line-2)] bg-white px-3.5 text-[13px] text-[var(--ks-ink-2)] transition hover:bg-[#f3f2f6]">
                      I can’t take one
                    </button>
                  </div>
                )}
                {messageError && (
                  <div className="mb-3">
                    <InlineError
                      message={messageError}
                      onDismiss={() => setMessageError(null)}
                    />
                  </div>
                )}

                {actionError && !confirmOpen && !escOpen && (
                  <div className="mb-3">
                    <InlineError
                      message={actionError}
                      onDismiss={() => setActionError(null)}
                    />
                  </div>
                )}

                <div className="flex items-end gap-1.5">
                  {!closed && (
                    <button type="button" onClick={() => setPhotosOpen((v) => !v)} aria-label="Add photos" title="Add photos"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ks-ink-2)] transition hover:bg-[#f3f2f6]">
                      <ImagePlus className="h-5 w-5" />
                    </button>
                  )}
                  {s.voiceConfigured && (
                    <button type="button" onClick={() => setMode("call")} disabled={!!pending} aria-label="Switch to voice call" title="Voice call"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ks-ink-2)] transition hover:bg-[#f3f2f6] disabled:opacity-40"
                      data-testid="button-switch-call">
                      <Phone className="h-5 w-5" />
                    </button>
                  )}
                  <textarea
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); if (messageError) setMessageError(null); }}
                    rows={draft.includes("\n") || draft.length > 100 ? 3 : 1}
                    maxLength={2000}
                    placeholder="Message Flamingo"
                    aria-label="Your message"
                    onKeyDown={handleComposerKeyDown}
                    className="min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-transparent bg-[#f1f0f4] px-4 py-[11px] text-[14.5px] leading-[1.5] text-[var(--ks-ink)] outline-none transition placeholder:text-[var(--ks-mute)] focus:border-[var(--ks-line-2)] focus:bg-white"
                    data-testid="input-message"
                  />
                  <button type="submit" disabled={!draft.trim() || !!pending} aria-label="Send message"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ks-coral)] text-white transition hover:bg-[var(--ks-coral-d)] active:scale-95 disabled:bg-[#e4e3e8] disabled:text-[#a3a0ab]"
                    data-testid="button-send">
                    {pending ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 px-2">
                  {t.status !== "escalated" && t.status !== "awaiting_confirmation" ? (
                    <button type="button" onClick={() => { setActionError(null); setEscOpen(true); }}
                      className="inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[12px] text-[var(--ks-mute)] transition hover:text-[var(--ks-ink)]"
                      data-testid="button-escalate">
                      <Headset className="h-3.5 w-3.5" /> Talk to a person
                    </button>
                  ) : <span />}
                  {draft.length > 1500 && (
                    <span className={cn("shrink-0 text-[11px] tabular-nums", draft.length > 1800 ? "text-[var(--ks-coral-d)]" : "text-[var(--ks-mute)]")}>{draft.length}/2000</span>
                  )}
                </div>
              </div>
            </form>
          )}
        </>
      )}

      {/* =================================================
          REFUND CONFIRMATION DIALOG
          ================================================= */}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={busyAction === `confirm:${t.id}`}
        title={
          t.proposedAction === "refund"
            ? `Confirm refund of ${usd(proposalAmount)}?`
            : "Confirm this return?"
        }
        confirmLabel={
          t.proposedAction === "refund" ? "Confirm refund" : "Start return"
        }
        onConfirm={() => void confirmAction()}
        body={
          <>
            {actionError && (
              <div className="mb-3">
                <InlineError message={actionError} />
              </div>
            )}

            {t.proposedAction === "refund" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#E9EAED] bg-[#F8F9FB] p-4">
                  <p className="text-xs text-[#747780]">Proposed refund</p>

                  <p className="mt-0.5 text-[32px] font-semibold leading-tight tracking-[-0.03em] text-[#191919] tabular-nums">
                    {usd(proposalAmount)}
                  </p>

                  <p className="mt-2 break-all font-mono text-[10px] text-[#858995]">
                    Order {t.orderId}
                  </p>
                </div>

                <Reveal
                  icon={<Info />}
                  summary={
                    o?.source === "sample"
                      ? "Simulated refund"
                      : "PayPal Sandbox test refund"
                  }
                >
                  <p className="text-[#747780]">
                    Confirm only if the amount and order are correct. Keep this
                    open until it finishes; final status depends on the payment
                    provider.
                  </p>
                </Reveal>
              </div>
            ) : (
              <>
                <p>You will get a return code.</p>
                <Reveal className="mt-2" icon={<Info />} summary="What happens next">
                  <p className="text-[#747780]">
                    The case stays open until the warehouse confirms receipt.
                    The refund then follows the return process.
                  </p>
                </Reveal>
              </>
            )}
          </>
        }
      />

      {/* =================================================
          HUMAN ESCALATION DIALOG
          ================================================= */}

      <ConfirmDialog
        open={escOpen}
        onOpenChange={setEscOpen}
        tone="plum"
        pending={busyAction === `escalate:${t.id}`}
        title="Talk to a person?"
        confirmLabel="Request a person"
        onConfirm={() => void escalateAction()}
        body={
          <>
            {actionError && (
              <div className="mb-3">
                <InlineError message={actionError} />
              </div>
            )}

            <p>They see this chat and your order. Replies land here.</p>
          </>
        }
      />

      {/* =================================================
          VOICE CALL
          ================================================= */}

      {inCall && (
        <CallOverlay
          ticket={t}
          call={call}
          productName={product?.name ?? t.orderId}
          voiceOn={s.voiceConfigured}
          onText={toText}
          liveText={liveText}
          liveDone={!!stream?.done}
        />
      )}
    </div>
  );
}
