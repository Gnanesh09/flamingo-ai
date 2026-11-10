import { Router } from "express";
import { z } from "zod";
import {
  GetDashboardResponse, ListActivityResponse, GetIntegrationsResponse, GetSettingsResponse,
  UpdateSettingsBody, GetAdminResponse, AskAssistantBody, AskAssistantResponse, GetConversationResponse,
  TranscribeVoiceBody, TranscribeVoiceResponse, SpeakVoiceBody, SpeakVoiceResponse,
} from "@workspace/api-zod";
import { demoSession } from "../middlewares/demo-session";
import { audit, mutateWorkspace, storage, type Workspace } from "../lib/flamingo/store";
import { summary } from "../lib/flamingo/domain";
import { integrations } from "../lib/flamingo/integrations";
import { DAILY_LIMIT, groqUsage } from "../lib/flamingo/groq";
import { runAgent } from "../lib/flamingo/agent";
import { speak, transcribe } from "../lib/flamingo/voice";
import { AppError } from "../lib/flamingo/errors";
import invoiceRouter from "./invoices";
import reminderRouter from "./reminders";
import resolutionRouter from "./resolutions";

const router = Router();
router.use(demoSession);
router.use(invoiceRouter);
router.use(reminderRouter);
router.use(resolutionRouter);
router.get("/dashboard", (_req, res) => { res.json(GetDashboardResponse.parse(summary(res.locals.workspace))); });
router.get("/activity", (_req, res) => { res.json(ListActivityResponse.parse(res.locals.workspace.activity)); });
router.get("/integrations", (_req, res) => { res.json(GetIntegrationsResponse.parse(integrations())); });
router.get("/settings", (_req, res) => { res.json(GetSettingsResponse.parse(res.locals.workspace.settings)); });
router.patch("/settings", async (req, res) => {
  const input = UpdateSettingsBody.parse(req.body);
  if (input.businessName.trim().length < 2) throw new AppError(400, "Enter a business name.");
  if (input.senderEmail && !z.string().email().safeParse(input.senderEmail).success) throw new AppError(400, "Enter a valid PayPal Sandbox business email or leave it blank.");
  const settings = await mutateWorkspace(res.locals.workspace.id, ws => {
    ws.settings = { ...input, businessName: input.businessName.trim(), senderEmail: input.senderEmail.trim() };
    audit(ws, "Business settings updated", "Reminder preferences and business details were saved.", "success");
    return ws.settings;
  });
  res.json(GetSettingsResponse.parse(settings));
});
router.get("/admin", async (_req, res) => {
  const ws = res.locals.workspace as Workspace;
  if (ws.role !== "admin") throw new AppError(403, "Select the admin demo view to see operations. No other workspace data is exposed.");
  const usage = await groqUsage();
  res.json(GetAdminResponse.parse({
    integrations: integrations(), activity: ws.activity.slice(0, 50),
    groqCallsToday: usage.calls, groqDailyLimit: DAILY_LIMIT,
    groqCooldownSeconds: Math.max(0, Math.ceil((usage.nextAt - Date.now()) / 1000)), storage,
    safety: [
      "PayPal Sandbox only. No live money movement.",
      "This admin view covers only your browser's demo workspace.",
      "Username and role selection are not production authentication.",
      "The AI has no payment, send, delete or approval tool.",
      "Owner approval is required before any PayPal notification.",
      "PayPal sends standard reminder copy, not the personalized draft.",
      "Ambiguous PayPal outcomes are not automatically retried.",
      "Groq is serialized, budgeted and cached; provider limits still apply.",
      "Microphone audio is processed transiently by Deepgram, not stored locally.",
    ],
  }));
});
router.get("/conversation", (_req, res) => { res.json(GetConversationResponse.parse(res.locals.workspace.conversation)); });
router.post("/assistant", async (req, res) => {
  const input = AskAssistantBody.parse(req.body);
  if (!input.message.trim()) throw new AppError(400, "Enter a question.");
  const reply = await mutateWorkspace(res.locals.workspace.id, async ws => {
    try { return await runAgent(ws, input.message.trim()); }
    catch (error) {
      audit(ws, "Assistant request failed", error instanceof AppError ? error.message : "The assistant could not safely complete the request.", "error", undefined, "assistant");
      throw error;
    }
  });
  res.json(AskAssistantResponse.parse(reply));
});
router.post("/voice/transcribe", async (req, res) => {
  const input = TranscribeVoiceBody.parse(req.body);
  res.json(TranscribeVoiceResponse.parse(await transcribe(input.audio, input.mimeType)));
});
router.post("/voice/speak", async (req, res) => {
  const input = SpeakVoiceBody.parse(req.body);
  res.json(SpeakVoiceResponse.parse(await speak(input.text)));
});
export default router;
