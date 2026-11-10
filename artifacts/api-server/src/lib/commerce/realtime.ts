import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import { readDemo } from "./store";
import { attachLiveVoice } from "./live-voice";

const clients = new Map<string, Set<WebSocket>>();
export const cookieName = "kiko_demo";
export function notify(id: string, revision?: number) {
  for (const ws of clients.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "changed", revision }));
}
export function progress(id: string, ticketId: string, stage: string, text: string) {
  for (const ws of clients.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "progress", ticketId, stage, text }));
}
/** Token stream for an agent reply in progress. The persisted message remains the source of truth. */
export type ReplyEvent =
  | { type: "reply_start"; ticketId: string; streamId: string }
  | { type: "reply_delta"; ticketId: string; streamId: string; text: string }
  | { type: "reply_reset"; ticketId: string; streamId: string }
  | { type: "reply_end"; ticketId: string; streamId: string };
export function replyEvent(id: string, event: ReplyEvent) {
  const payload = JSON.stringify(event);
  for (const ws of clients.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}
export function commerceSockets(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128000 });
  server.on("upgrade", async (req, socket, head) => {
    if (req.url?.split("?")[0] !== "/api/commerce/ws") { socket.destroy(); return; }
    try {
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) throw new Error("origin");
      const raw = (req.headers.cookie || "").split(";").map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const id = raw && process.env.SESSION_SECRET ? cookieParser.signedCookie(decodeURIComponent(raw), process.env.SESSION_SECRET) : false;
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("session");
      await readDemo(id);
      if ((clients.get(id)?.size || 0) >= 10) throw new Error("limit");
      wss.handleUpgrade(req, socket, head, ws => {
        const group = clients.get(id) || new Set<WebSocket>();
        group.add(ws); clients.set(id, group);
        ws.send(JSON.stringify({ type: "connected" }));
        const voiceTicket = new URL(req.url!, "http://localhost").searchParams.get("voiceTicket");
        if (voiceTicket) void attachLiveVoice(ws, id, voiceTicket);
        let alive = true;
        const heartbeat = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 30000);
        const lifetime = setTimeout(() => ws.close(1000, "Refresh session"), 30 * 60000);
        ws.on("pong", () => { alive = true; });
        ws.on("error", () => ws.close());
        ws.on("close", () => { clearInterval(heartbeat); clearTimeout(lifetime); group.delete(ws); if (!group.size) clients.delete(id); });
      });
    } catch { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); }
  });
}
