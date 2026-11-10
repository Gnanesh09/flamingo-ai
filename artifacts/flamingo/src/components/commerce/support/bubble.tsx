"use client";

import { Headset, Mic } from "lucide-react";
import type { CommerceMessage } from "@workspace/api-client-react";
import { when } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { FlamingoMark } from "@/components/commerce/kit";

export function Bubble({ m, pending, streaming }: { m: CommerceMessage; pending?: boolean; streaming?: boolean }) {
  if (m.role === "system") {
    return (
      <div className="flex justify-center py-1">
        <p className="max-w-[90%] text-center text-[11.5px] leading-relaxed text-[var(--ks-mute)]">{m.text}</p>
      </div>
    );
  }
  const me = m.role === "customer";
  const human = m.role === "human";
  return (
    <div className={cn("ks-fade-in group flex items-end gap-2", me && "flex-row-reverse", pending && "opacity-60")}>
      {!me && (
        human ? (
          <div className="mb-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dcf1ec] text-[#1f6f62]" title="KikoStore support">
            <Headset className="h-3.5 w-3.5" />
          </div>
        ) : (
          <FlamingoMark className="mb-5 h-7 w-7 shrink-0" />
        )
      )}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col sm:max-w-[72%]", me && "items-end")}>
        {human && <span className="mb-1 px-3 text-[11px] font-medium text-[#1f6f62]">KikoStore support</span>}
        <div className={cn("px-4 py-2.5 text-[14.5px] leading-[1.55]",
          me ? "rounded-[22px] rounded-br-md bg-[var(--ks-coral)] text-white"
            : human ? "rounded-[22px] rounded-bl-md bg-[#e8f5f1] text-[#173f37]"
              : "rounded-[22px] rounded-bl-md bg-[#f1f0f4] text-[var(--ks-ink)]")}>
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid={m.id === "stream" ? "text-stream-reply" : undefined}>
            {m.text}
            {streaming && <span className="ks-caret" aria-hidden />}
          </p>
        </div>
        <div className={cn("mt-1 flex h-4 items-center gap-1.5 px-3 text-[11px] text-[var(--ks-mute)]", me && "justify-end")}>
          {m.channel === "voice" && <span className="inline-flex items-center gap-0.5" title="Spoken on a call"><Mic className="h-3 w-3" /> Voice</span>}
          {m.channel === "voice" && m.at && <span aria-hidden>·</span>}
          {m.at && <span className="opacity-80 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">{when(m.at)}</span>}
          {pending && <span>Sending</span>}
          {streaming && !m.at && <span>Typing</span>}
        </div>
      </div>
    </div>
  );
}
