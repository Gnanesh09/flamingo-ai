"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetIntegrations, getGetIntegrationsQueryKey, type Integration } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";

/** Invalidate every cached query — mutations here ripple across dashboard, lists and activity. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries(), [qc]);
}

export function useNotify() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return {
    ok: (title: string, description?: string) => toast({ title, description }),
    fail: (e: unknown, title = "That didn't go through") => {
      // Failed external actions can still persist audit events, a PayPal draft ID,
      // or invalidate approval. Refresh those states instead of displaying stale success.
      void qc.invalidateQueries();
      return toast({ title, description: errMsg(e), variant: "destructive" });
    },
  };
}

function find(list: Integration[] | undefined, key: string) {
  return list?.find((i) => i.id.toLowerCase().includes(key) || i.name.toLowerCase().includes(key));
}

export function useIntegrationFlags() {
  const q = useGetIntegrations({ query: { queryKey: getGetIntegrationsQueryKey() } });
  const list = q.data;
  const paypal = find(list, "paypal");
  const groq = find(list, "groq");
  const deepgram = find(list, "deepgram");
  return {
    ...q,
    list: list ?? [],
    paypal,
    groq,
    deepgram,
    paypalReady: !!paypal?.configured,
    groqReady: !!groq?.configured,
    voiceReady: !!deepgram?.configured,
  };
}
