import express, { type Express, type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { AppError } from "./lib/flamingo/errors";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    let mismatch = false;
    if (origin) {
      try { mismatch = new URL(origin).host !== req.get("host"); } catch { mismatch = true; }
    }
    if (mismatch || req.get("sec-fetch-site") === "cross-site") {
      res.status(403).json({ error: "Cross-origin writes are not allowed." });
      return;
    }
  }
  next();
});
app.use("/api", rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many requests. Please wait a minute." } }));
app.use(cookieParser(process.env.SESSION_SECRET || randomBytes(32).toString("hex")));
app.use(express.json({ limit: "5mb" }));

app.use("/api", router);
const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    if (error.retryAfter) res.setHeader("Retry-After", error.retryAfter);
    res.status(error.status).json({ error: error.message, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: `Invalid data: ${error.issues.map(i => `${i.path.join(".") || "request"} ${i.message}`).slice(0, 4).join("; ")}` });
    return;
  }
  if (error?.type === "entity.too.large") { res.status(413).json({ error: "Request too large. Keep voice turns short." }); return; }
  if (error instanceof SyntaxError && "body" in error) { res.status(400).json({ error: "Invalid JSON request." }); return; }
  // Provider errors can contain secrets or customer data. Log only a safe classification.
  req.log.error({ errorType: error instanceof Error ? error.name : "Unknown" }, "Request failed");
  res.status(500).json({ error: "The request could not be completed safely. Please refresh and check the activity log." });
};
app.use(errorHandler);

export default app;
