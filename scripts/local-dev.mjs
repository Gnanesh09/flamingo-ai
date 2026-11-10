// Runs Flamingo AI on your own machine with one command: `pnpm run dev:local`.
//
// On Replit, a path router sends /api to the API server and everything else to the
// Next.js app, all on one origin. This script recreates that locally:
//   http://localhost:3000        -> this proxy
//   /api and /api/commerce/ws    -> API server  (API_PORT, default 8080)
//   everything else              -> Next.js app (WEB_PORT, default 3001)
// Keeping a single origin matters: the API rejects cross-origin writes and WebSockets,
// and PayPal return links are built from the browser's host.
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
  console.log("[local] Loaded .env");
} catch {
  console.warn("[local] No .env file found. Copy .env.example to .env and fill in your keys.");
}

const PORT = Number(process.env.LOCAL_PORT || 3000);
const API_PORT = Number(process.env.API_PORT || 8080);
const WEB_PORT = Number(process.env.WEB_PORT || 3001);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const children = [
  spawn(pnpm, ["--filter", "@workspace/api-server", "run", "dev"], { cwd: root, stdio: "inherit", env: { ...process.env, PORT: String(API_PORT) }, shell: process.platform === "win32" }),
  spawn(pnpm, ["--filter", "@workspace/flamingo", "run", "dev"], { cwd: root, stdio: "inherit", env: { ...process.env, PORT: String(WEB_PORT) }, shell: process.platform === "win32" }),
];
const stop = () => { for (const c of children) c.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", (code) => { if (code) { console.error(`[local] A server exited with code ${code}. Stopping.`); stop(); } });

const target = (url = "/") => (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?") ? API_PORT : WEB_PORT);

const server = http.createServer((req, res) => {
  const upstream = http.request({ host: "127.0.0.1", port: target(req.url), method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Flamingo is still starting. Refresh in a few seconds.");
  });
  req.pipe(upstream);
});

// WebSockets (Flamingo live updates, voice calls and Next.js hot reload) are piped as raw TCP.
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(target(req.url), "127.0.0.1", () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    upstream.write(raw + "\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, () => console.log(`\n[local] Flamingo AI: open http://localhost:${PORT}/kikostore\n`));
