"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Keyboard, LoaderCircle, Mic, MicOff, Phone, PhoneOff, RefreshCw, Info, Volume2, X } from "lucide-react";
import type { CommerceTicket } from "@workspace/api-client-react";
import { useCommerceCall } from "@/hooks/use-commerce-call";
import { EvidencePanel } from "@/components/commerce/evidence-panel";
import { isClosed, when } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { FlamingoMark, Reveal } from "@/components/commerce/kit";
import { InlineError, SectionLabel, StatusDot } from "./ui";

const CALL_LABEL: Record<string, string> = {
  idle: "Ready when you are",
  connecting: "Connecting your microphone",
  live: "Connected",
  listening: "Listening to you",
  transcribing: "Understanding your words",
  thinking: "Checking your order",
  speaking: "Flamingo is speaking",
  error: "Something interrupted the call",
  ended: "Call ended",
};

const PHASES = ["listening", "transcribing", "thinking", "speaking"] as const;

/* =========================================================
   VOICE CALL OVERLAY
   ========================================================= */

export function CallOverlay({
  ticket: t,
  call,
  productName,
  voiceOn,
  onText,
  liveText,
  liveDone,
}: {
  ticket: CommerceTicket;
  call: ReturnType<typeof useCommerceCall>;
  productName: string;
  voiceOn: boolean;
  onText: () => void;
  liveText: string | null;
  liveDone: boolean;
}) {
  const x = call;

  const status = String(call.status);

  const mm = `${Math.floor(call.elapsed / 60)}:${String(
    call.elapsed % 60,
  ).padStart(2, "0")}`;

  const started = call.active;

  const connecting = status === "connecting";

  const recent = t.messages.filter((m) => m.role !== "system").slice(-8);

  const heard =
    call.heardText ??
    (status === "thinking" || status === "transcribing"
      ? (call.lastTranscript ?? null)
      : null);

  const showHeard =
    !!heard && !recent.some((m) => m.role === "customer" && m.text === heard);

  const feed = useRef<HTMLDivElement>(null);

  const dialog = useRef<HTMLDivElement>(null);

  const closeButton = useRef<HTMLButtonElement>(null);

  const previousFocus = useRef<HTMLElement | null>(null);

  const [startError, setStartError] = useState<string | null>(null);

  const startingRef = useRef(false);

  const phaseIdx = PHASES.indexOf(status as (typeof PHASES)[number]);

  const [photosOpen, setPhotosOpen] = useState(false);

  // True from the moment an upload asks to pause the mic until the pause is released.
  const [evidenceBusy, setEvidenceBusyState] = useState(false);

  const busyRef = useRef(false);

  const photosOpenRef = useRef(false);

  photosOpenRef.current = photosOpen;

  const onEvidenceBusy = useCallback(
    async (busy: boolean) => {
      if (busy) {
        busyRef.current = true;
        setEvidenceBusyState(true);
        await call.setEvidenceBusy(true);
      } else {
        try {
          await call.setEvidenceBusy(false);
        } finally {
          busyRef.current = false;
          setEvidenceBusyState(false);
        }
      }
    },
    [call.setEvidenceBusy],
  );

  // Uploads may start while listening or while a reply plays; not mid-turn.
  const turnInFlight =
    status === "transcribing" || status === "thinking" || connecting;

  const evidenceCount = t.evidence?.length ?? 0;

  const canStart =
    voiceOn &&
    !connecting &&
    !started &&
    call.cooldown <= 0 &&
    !startingRef.current;

  /*
   * Keep the latest transcript visible.
   */

  useEffect(() => {
    feed.current?.scrollTo({
      top: feed.current.scrollHeight,
      behavior: "smooth",
    });
  }, [recent.length, heard, liveText?.length]);

  /*
   * Modal focus and body scroll management.
   */

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    document.body.style.overflow = "hidden";

    closeButton.current?.focus();

    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;

      e.preventDefault();

      // Leaving the call mid-upload would hang up and drop the batch.
      if (busyRef.current) return;

      if (photosOpenRef.current) {
        setPhotosOpen(false);
        return;
      }

      onText();
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener("keydown", handleEscape);

      previousFocus.current?.focus();
    };
  }, [onText]);

  /*
   * Keep keyboard focus inside the modal.
   */

  const handleModalKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;

    const nodes = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], textarea, input, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter(
      (element) =>
        element.getClientRects().length && !element.hasAttribute("disabled"),
    );

    const first = nodes[0];

    const last = nodes[nodes.length - 1];

    if (!first || !last) return;

    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog.current)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const startCall = async () => {
    if (!canStart) return;

    startingRef.current = true;

    setStartError(null);

    try {
      await call.start();
    } catch {
      setStartError(
        "We couldn't start the call. Check your microphone permission and try again.",
      );
    } finally {
      startingRef.current = false;
    }
  };

  return createPortal(
    <div
      ref={dialog}
      tabIndex={-1}
      className="ks ks-call fixed inset-0 z-[1000] flex flex-col overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#fde7ef_0%,#fbf5f8_42%,#f8f8fa_100%)] text-[var(--ks-ink)]"
      role="dialog"
      aria-modal="true"
      aria-label="Voice call with Flamingo"
      data-phase={status}
      data-testid="call-overlay"
      onKeyDown={handleModalKeyDown}
    >
      {/* =================================================
          HEADER
          ================================================= */}

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-7 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80">
            <FlamingoMark className="h-8 w-8" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#191919]">Flamingo</p>

            <p className="mt-0.5 truncate text-xs text-[#747780]">
              {productName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 backdrop-blur">
            <StatusDot
              color={
                started
                  ? "bg-emerald-500"
                  : connecting
                    ? "bg-amber-500"
                    : "bg-[#858995]"
              }
              pulse={started || connecting}
            />

            <span
              className="font-mono text-xs font-medium tabular-nums text-[#30243A]"
              data-testid="text-call-timer"
            >
              {started ? mm : "0:00"}
            </span>
          </div>

          <button
            ref={closeButton}
            type="button"
            onClick={onText}
            disabled={evidenceBusy}
            aria-label="Return to text chat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-[var(--ks-ink-2)] transition hover:bg-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* =================================================
          MAIN CALL CONTENT
          ================================================= */}

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-7 px-4 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:gap-10">
        {/* Call controls */}

        <div className="flex min-w-0 flex-col items-center justify-center py-3 text-center">
          

          <div className="relative mt-4 flex h-[200px] w-[200px] items-center justify-center">
            {(status === "speaking" || status === "listening") && (
              <>
                <span className="absolute inset-0 ks-ring rounded-full !border-[#D9396F]/25" />

                <span className="absolute inset-0 rounded-full bg-[#D9396F]/[0.07]" />
              </>
            )}

            <div
              className="relative flex h-[136px] w-[136px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#f48fb1,#d9396f_60%,#b92a5b)] shadow-[0_24px_60px_-20px_rgba(185,42,91,0.6)] transition-transform duration-150"
              style={{
                transform: `scale(${1 + Math.min(call.level * 0.3, 0.08)})`,
              }}
            >
              {status === "speaking" ? (
                <span className="ks-bars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 5,
                        background: "#FFFCF9",
                        animationDelay: `${i * 0.12}s`,
                      }}
                    />
                  ))}
                </span>
              ) : call.muted && started ? (
                <MicOff className="h-10 w-10 text-white" />
              ) : connecting ? (
                <LoaderCircle className="h-10 w-10 animate-spin text-white" />
              ) : (
                <Mic className="h-10 w-10 text-white" />
              )}
            </div>
          </div>

          <h1
            className="mt-6 max-w-md text-[26px] font-medium tracking-[-0.02em] text-[var(--ks-ink)] sm:text-[30px]"
            data-testid="status-call"
            aria-live="polite"
          >
            {call.muted && started
              ? "Your microphone is muted"
              : connecting
                ? "Connecting your microphone..."
                : (CALL_LABEL[status] ?? status)}
          </h1>

          <p className="mt-2 max-w-sm text-[14px] text-[var(--ks-ink-2)]">
            {!started && !connecting
              ? "Needs your microphone."
              : status === "listening"
                ? "Pause when done."
                : status === "speaking"
                  ? "You can talk when it finishes."
                  : status === "error"
                    ? "Retry, or switch to text."
                    : "\u00a0"}
          </p>

          {call.progressText && started && (
            <p
              className="mt-4 inline-flex max-w-sm items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-medium text-[#30243A]"
              data-testid="text-call-progress"
              aria-live="polite"
            >
              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-[#D9396F]" />
              {call.progressText}
            </p>
          )}

          {started && (
            <ol
              className="mt-6 flex items-center gap-2"
              aria-label="Voice conversation progress"
            >
              {PHASES.map((phase, index) => (
                <li
                  key={phase}
                  aria-label={phase}
                  aria-current={index === phaseIdx ? "step" : undefined}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    index === phaseIdx
                      ? "w-8 bg-[#D9396F]"
                      : index < phaseIdx
                        ? "w-3 bg-[#D9396F]/40"
                        : "w-3 bg-[#30243A]/10",
                  )}
                />
              ))}
            </ol>
          )}

          {call.noSpeechHint && status === "listening" && (
            <p className="mt-5 max-w-sm rounded-xl border border-[#E9EAED] bg-white px-4 py-3 text-xs leading-relaxed text-[#626671]">
              {call.noSpeechHint}
            </p>
          )}

          {(call.error || startError) && (
            <div className="mt-5 w-full max-w-md">
              <InlineError
                message={
                  startError ?? call.error ?? "The call could not continue."
                }
                onDismiss={() => setStartError(null)}
              />
            </div>
          )}

          {status === "error" && call.heardText && (
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-[#747780]">
              Not sent. Switch to text to send it.
            </p>
          )}

          {!voiceOn && (
            <p className="mt-4 text-xs text-[#747780]">
              Voice is not set up.
            </p>
          )}
        </div>

        {/* Transcript panel */}

        <section className="flex max-h-[45dvh] min-h-[240px] min-w-0 flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white/75 backdrop-blur-xl shadow-[0_10px_40px_-20px_rgba(29,27,34,0.25)] lg:max-h-[62dvh]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--ks-line)]/70 px-4 py-3 sm:px-5">
            <div>
              <SectionLabel>Live transcript</SectionLabel>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F7F8FA] text-[#626671]">
              <Volume2 className="h-4 w-4" />
            </div>
          </div>

          <div
            ref={feed}
            role="log"
            aria-label="Voice call transcript"
            aria-live="polite"
            className="ks-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
          >
            {recent.length === 0 && !showHeard && liveText === null && (
              <div className="flex h-full min-h-[150px] flex-col items-center justify-center text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F8FA] text-[#858995]">
                  <Mic className="h-5 w-5" />
                </div>

                <p className="mt-3 text-sm font-medium text-[#30243A]">
                  Transcript appears here
                </p>


              </div>
            )}

            {recent.map((m) => (
              <div
                key={m.id}
                className={cn("min-w-0", m.role === "customer" && "text-right")}
              >
                <p className="text-[11px] text-[var(--ks-mute)]">
                  {m.role === "customer"
                    ? "You"
                    : m.role === "human"
                      ? "KikoStore support"
                      : "Flamingo"}
                </p>

                <p
                  className={cn(
                    "mt-1 inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-xs leading-relaxed",
                    m.role === "customer"
                      ? "rounded-br-md bg-[#30243A] text-white"
                      : m.role === "human"
                        ? "rounded-bl-md bg-[#EAF7F0] text-[#243D30]"
                        : "rounded-bl-md border border-[#E9EAED] bg-[#F8F9FB] text-[#29282E]",
                  )}
                >
                  {m.text}
                </p>
              </div>
            ))}

            {status === "listening" && call.interimTranscript && !showHeard && (
              <div className="text-right" data-testid="text-interim-transcript">
                <p className="text-[11px] text-[var(--ks-mute)]">
                  You · Live
                </p>

                <p className="mt-1 inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-dashed border-[#30243A]/30 bg-white px-3.5 py-2.5 text-left text-[13.5px] italic leading-relaxed text-[#30243A]">
                  {call.interimTranscript}
                </p>
              </div>
            )}

            {showHeard && (
              <div className="text-right">
                <p className="text-[11px] text-[var(--ks-mute)]">
                  You · {status === "error" ? "Not sent" : "Processing"}
                </p>

                <p className="mt-1 inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--ks-coral)]/85 px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed text-white">
                  {heard}
                </p>
              </div>
            )}

            {liveText !== null && (
              <div className="min-w-0" data-testid="text-call-stream">
                <p className="text-[11px] text-[var(--ks-mute)]">
                  Flamingo
                </p>

                <p className="mt-1 inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-[#f1f0f4] px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed text-[var(--ks-ink)]">
                  {liveText ? (
                    <>
                      {liveText}
                      {!liveDone && <span className="ks-caret" aria-hidden />}
                    </>
                  ) : (
                    <span className="ks-bars" aria-label="Flamingo is writing">
                      <span style={{ height: 10 }} />
                      <span style={{ height: 10, animationDelay: ".15s" }} />
                      <span style={{ height: 10, animationDelay: ".3s" }} />
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          <Reveal
            className="border-t border-[var(--ks-line)]/70 px-4 py-2.5"
            icon={<Info />}
            summary="About this transcript"
          >
            <p className="text-[#858995]">
              Only saved text appears here. Unsaved speech may be lost if the
              browser or connection fails.
            </p>
          </Reveal>
        </section>
      </div>

      {/* =================================================
          FOOTER CONTROLS
          ================================================= */}

      <footer className="relative z-10 px-4 pb-6 pt-3 sm:px-7 sm:pb-8">
        {t.status === "awaiting_confirmation" && t.proposedAction && (
          <div className="mx-auto mb-4 max-w-xl rounded-2xl bg-white/85 p-3 text-center shadow-[0_6px_24px_-14px_rgba(29,27,34,.3)]">
            <p className="text-xs font-semibold text-[#30243A]">
              Your {t.proposedAction} is ready to review
            </p>

            <button
              type="button"
              onClick={onText}
              data-testid="button-call-review-proposal"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#B92A5B] hover:underline"
            >
              Review in chat
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <p className="mt-1 text-[10px] text-[#747780]">
              Speaking alone never authorizes it.
            </p>
          </div>
        )}

        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-3 sm:gap-4">
          {!started ? (
            <button
              type="button"
              onClick={() => void startCall()}
              disabled={!canStart}
              data-testid="button-start-call"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#1f8a6a] px-7 text-[15px] font-medium text-white shadow-[0_10px_24px_-12px_rgba(31,138,106,.8)] transition hover:bg-[#187257] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting || startingRef.current ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Phone className="h-4 w-4" />
              )}

              {connecting
                ? "Connecting..."
                : call.cooldown > 0
                  ? `Retry in ${call.cooldown}s`
                  : status === "ended" || status === "error"
                    ? "Call again"
                    : "Allow microphone & start"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={call.toggleMute}
                aria-label={
                  call.muted ? "Unmute microphone" : "Mute microphone"
                }
                title={call.muted ? "Unmute microphone" : "Mute microphone"}
                data-testid="button-mute"
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95",
                  call.muted
                    ? "bg-[var(--ks-ink)] text-white"
                    : "bg-white text-[var(--ks-ink)] shadow-[0_4px_14px_-8px_rgba(29,27,34,.35)] hover:bg-[#f8f8fa]",
                )}
              >
                {call.muted ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>

              {status === "listening" && !call.muted && (
                <button
                  type="button"
                  onClick={x.finishTurn}
                  data-testid="button-finish-turn"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[var(--ks-ink)] px-6 text-[15px] font-medium text-white transition hover:bg-[#34313c] active:scale-[0.97]"
                >
                  <Check className="h-4 w-4" />
                  Done speaking
                </button>
              )}

              {status === "error" && (
                <button
                  type="button"
                  onClick={call.resume}
                  disabled={call.cooldown > 0}
                  data-testid="button-resume-call"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[var(--ks-ink)] px-6 text-[15px] font-medium text-white transition hover:bg-[#34313c] active:scale-[0.97] disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />

                  {call.cooldown > 0
                    ? `Retry in ${call.cooldown}s`
                    : "Resume listening"}
                </button>
              )}

              <button
                type="button"
                onClick={() => setPhotosOpen(true)}
                disabled={isClosed(t)}
                aria-label="Add photos without ending the call"
                title="Add photos without ending the call"
                data-testid="button-call-photos"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-[var(--ks-ink)] shadow-[0_4px_14px_-8px_rgba(29,27,34,.35)] transition hover:bg-[#f8f8fa] disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                Photos
                <span className="tabular-nums text-xs text-[#858995]">
                  {evidenceCount}/5
                </span>
              </button>

              <button
                type="button"
                onClick={call.hangup}
                aria-label="Hang up"
                title="Hang up"
                data-testid="button-hangup"
                className="flex h-14 w-[72px] items-center justify-center rounded-full bg-[#d93a2b] text-white shadow-[0_10px_24px_-12px_rgba(217,58,43,.8)] transition hover:bg-[#bf2f22] active:scale-95"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onText}
            disabled={evidenceBusy}
            data-testid="button-switch-text"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-[var(--ks-ink)] shadow-[0_4px_14px_-8px_rgba(29,27,34,.35)] transition hover:bg-[#f8f8fa] disabled:opacity-50"
          >
            <Keyboard className="h-4 w-4" />
            Back to text
          </button>
        </div>

        <Reveal
          className="mx-auto mt-4 w-fit max-w-lg text-[11px]"
          icon={<Info />}
          summary="How audio is handled"
          testId="button-call-privacy"
        >
          <p className="text-[#858995]">
            Audio is processed by the configured voice service. The transcript is
            saved with this case. Retention follows the server&apos;s
            audio-processing settings.
          </p>
        </Reveal>
      </footer>

      {/* Kept mounted while hidden so an in-flight batch can finish and release the mic pause. */}
      <div
        className={cn(
          "fixed inset-0 z-[1050] flex items-end justify-center sm:items-stretch sm:justify-end",
          !photosOpen && "pointer-events-none invisible",
        )}
        aria-hidden={!photosOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-[#191419]/30 transition-opacity",
            photosOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => {
            if (!busyRef.current) setPhotosOpen(false);
          }}
        />

        <section
          role="dialog"
          aria-modal="true"
          aria-label="Add photos to this case"
          data-testid="drawer-call-evidence"
          className={cn(
            "relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-12px_48px_rgba(20,20,30,0.18)] transition-transform duration-200 sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-3xl",
            photosOpen
              ? "translate-y-0 sm:translate-x-0"
              : "translate-y-full sm:translate-x-full sm:translate-y-0",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#E9EAED] px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#191919]">
                Photos for this case
              </p>

              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#747780]">
                <StatusDot color="bg-emerald-500" pulse />
                Call still connected · {mm}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPhotosOpen(false)}
              disabled={evidenceBusy}
              data-testid="button-close-call-evidence"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#E9EAED] px-3 text-xs font-semibold text-[#30243A] transition hover:bg-[#F7F8FA] disabled:opacity-50"
            >
              {evidenceBusy ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to call
                </>
              )}
            </button>
          </div>

          <div className="ks-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-3 text-xs text-[#747780]">
              Mic pauses while sending. The call stays on.
            </p>

            <EvidencePanel
              ticket={t}
              onBusyChange={onEvidenceBusy}
              disabled={turnInFlight || isClosed(t)}
              disabledReason={
                isClosed(t)
                  ? "This case is closed."
                  : "Wait for this turn to finish."
              }
            />
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
