import { Router } from "express";
import rateLimit from "express-rate-limit";
import { StartSessionBody, GetSessionResponse } from "@workspace/api-zod";
import { COOKIE } from "../middlewares/demo-session";
import { audit, exclusive, readWorkspace, saveWorkspace, storage } from "../lib/flamingo/store";
import { seedWorkspace } from "../lib/flamingo/seed";
import { AppError } from "../lib/flamingo/errors";

const router = Router();
const startLimit = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many session requests. Please wait a minute." } });

router.get("/session", async (req, res) => {
  const id = req.signedCookies[COOKIE];
  const ws = typeof id === "string" ? await readWorkspace(id) : null;
  res.json(GetSessionResponse.parse({ active: ws?.active ?? false, username: ws?.username ?? "", role: ws?.role ?? "business", mode: "demo", storage }));
});

router.post("/session", startLimit, async (req, res) => {
  const input = StartSessionBody.parse(req.body);
  const username = input.username.trim();
  if (username.length < 2) throw new AppError(400, "Enter a username with at least two characters.");
  const id = req.signedCookies[COOKIE];
  const ws = await exclusive(typeof id === "string" ? id : `new-session-${req.ip}`, async () => {
    const existing = typeof id === "string" ? await readWorkspace(id) : null;
    const workspace = existing ?? seedWorkspace(username, input.role);
    workspace.username = username;
    workspace.role = input.role;
    workspace.active = true;
    audit(workspace, "Demo session started", `Entered the ${input.role} view. Role selection is for demo navigation, not identity verification.`);
    await saveWorkspace(workspace, !existing);
    return workspace;
  });
  res.cookie(COOKIE, ws.id, { httpOnly: true, signed: true, sameSite: "lax", secure: req.secure, path: "/api", maxAge: 30 * 86400000 });
  res.json(GetSessionResponse.parse({ active: true, username, role: input.role, mode: "demo", storage }));
});

router.delete("/session", async (req, res) => {
  const id = req.signedCookies[COOKIE];
  if (typeof id === "string") await exclusive(id, async () => {
    const ws = await readWorkspace(id);
    if (ws) { ws.active = false; await saveWorkspace(ws); }
  });
  // Keep the opaque browser workspace cookie so starting again retains this demo's data.
  res.json({ message: "Demo session ended. Your workspace stays in this browser." });
});

export default router;
