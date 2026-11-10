"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCommerceStateQueryKey,
  useCommerceAction,
  useGetCommerceState,
  useStartCommerceDemo,
  type CommerceActionInput,
  type CommerceActionResult,
  type CommerceState,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { errStatus, errText } from "@/lib/commerce";

export type Conn = "idle" | "connecting" | "live" | "reconnecting";
/** An agent reply arriving token by token over the WebSocket. The saved message replaces it. */
export type ReplyStream = { streamId: string; text: string; done: boolean; startedRevision: number };

type Ctx = {
  state: CommerceState | undefined;
  loading: boolean;
  needsSession: boolean;
  loadError: unknown;
  refetch: () => void;
  startDemo: () => Promise<void>;
  starting: boolean;
  run: (input: CommerceActionInput, opts?: { quiet?: boolean }) => Promise<CommerceActionResult>;
  busy: boolean;
  busyAction: string | null;
  conn: Conn;
  lastEventAt: number | null;
  /** Live reply text per ticket id while the agent is still writing. */
  streams: Record<string, ReplyStream>;
};

const CommerceCtx = createContext<Ctx | null>(null);
const STATE_KEY = getGetCommerceStateQueryKey();

export function CommerceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetCommerceState({
    query: {
      queryKey: STATE_KEY,
      staleTime: 20_000,
      structuralSharing: (previous, incoming) => {
        const oldState = previous as CommerceState | undefined;
        const newState = incoming as CommerceState;
        // A slower HTTP read must not replace a newer mutation/WebSocket snapshot.
        return oldState?.id === newState.id && oldState.revision > newState.revision ? oldState : newState;
      },
      retry: (n, e) => errStatus(e) !== 401 && n < 1,
    },
  });
  const start = useStartCommerceDemo();
  const action = useCommerceAction();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>("idle");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [streams, setStreams] = useState<Record<string, ReplyStream>>({});

  const startRef = useRef(start.mutateAsync);
  startRef.current = start.mutateAsync;
  const actRef = useRef(action.mutateAsync);
  actRef.current = action.mutateAsync;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const hasSession = !!q.data && errStatus(q.error) !== 401;

  // Realtime: server pushes {type:'changed', revision}; HTTP state remains authoritative.
  useEffect(() => {
    if (!hasSession) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: number | undefined;
    const connect = () => {
      setConn(attempt ? "reconnecting" : "connecting");
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/api/commerce/ws`);
      ws.onopen = () => {
        attempt = 0;
        setConn("live");
        setLastEventAt(Date.now());
        void qc.invalidateQueries({ queryKey: STATE_KEY });
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data)) as { type?: string; revision?: number; ticketId?: string; streamId?: string; text?: string };
          if (m.type?.startsWith("reply_") && m.ticketId && m.streamId) {
            const { ticketId, streamId } = m;
            setStreams((all) => {
              const cur = all[ticketId];
              if (m.type === "reply_start") return { ...all, [ticketId]: { streamId, text: "", done: false, startedRevision: qc.getQueryData<CommerceState>(STATE_KEY)?.revision ?? 0 } };
              if (!cur || cur.streamId !== streamId) return all;
              if (m.type === "reply_delta") return { ...all, [ticketId]: { ...cur, text: cur.text + (m.text ?? "") } };
              if (m.type === "reply_reset") return { ...all, [ticketId]: { ...cur, text: "" } };
              if (m.type === "reply_end") return { ...all, [ticketId]: { ...cur, done: true } };
              return all;
            });
            return;
          }
          if (m.type !== "changed") return;
          setLastEventAt(Date.now());
          const cur = qc.getQueryData<CommerceState>(STATE_KEY);
          if (!cur || m.revision === undefined || m.revision > cur.revision) void qc.invalidateQueries({ queryKey: STATE_KEY });
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        attempt += 1;
        setConn("reconnecting");
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      setConn("idle");
    };
  }, [hasSession, qc]);

  const startDemo = useCallback(async () => {
    try {
      const s = await startRef.current();
      qc.setQueryData(STATE_KEY, s);
    } catch (e) {
      toastRef.current({ title: "Could not open the demo store", description: errText(e), variant: "destructive" });
    }
  }, [qc]);

  const run = useCallback(
    async (input: CommerceActionInput, opts?: { quiet?: boolean }) => {
      setBusyAction(`${input.action}:${input.ticketId ?? input.orderId ?? input.productId ?? ""}`);
      try {
        const r = await actRef.current({ data: input });
        qc.setQueryData(STATE_KEY, r.state);
        return r;
      } catch (e) {
        void qc.invalidateQueries({ queryKey: STATE_KEY });
        const failedTicket = input.ticketId;
        if (failedTicket) setStreams(({ [failedTicket]: _dropped, ...rest }) => rest);
        if (!opts?.quiet) toastRef.current({ title: "That did not go through", description: errText(e), variant: "destructive" });
        throw e;
      } finally {
        setBusyAction(null);
      }
    },
    [qc],
  );

  // Drop a finished stream once a newer saved state (containing the real message) has arrived.
  const revision = q.data?.revision;
  useEffect(() => {
    if (revision === undefined) return;
    setStreams((all) => {
      const keep = Object.entries(all).filter(([, s]) => !(s.done && revision > s.startedRevision));
      return keep.length === Object.keys(all).length ? all : Object.fromEntries(keep);
    });
  }, [revision]);

  const value = useMemo<Ctx>(
    () => ({
      state: errStatus(q.error) === 401 ? undefined : q.data,
      loading: q.isLoading,
      needsSession: errStatus(q.error) === 401,
      loadError: q.error && errStatus(q.error) !== 401 ? q.error : null,
      refetch: () => void q.refetch(),
      startDemo,
      starting: start.isPending,
      run,
      busy: busyAction !== null,
      busyAction,
      conn,
      lastEventAt,
      streams,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, q.isLoading, q.error, start.isPending, busyAction, conn, lastEventAt, streams, startDemo, run],
  );

  return <CommerceCtx.Provider value={value}>{children}</CommerceCtx.Provider>;
}

export function useCommerce() {
  const v = useContext(CommerceCtx);
  if (!v) throw new Error("useCommerce must be used inside CommerceProvider");
  return v;
}

/** For pages rendered after the gate: state is guaranteed. */
export function useCommerceState(): CommerceState {
  const { state } = useCommerce();
  if (!state) throw new Error("Commerce state not ready");
  return state;
}
