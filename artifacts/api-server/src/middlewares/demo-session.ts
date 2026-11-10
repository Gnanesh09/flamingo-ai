import type { Request, Response, NextFunction } from "express";
import { readWorkspace } from "../lib/flamingo/store";
import { AppError } from "../lib/flamingo/errors";

export const COOKIE = "flamingo_demo";

export async function demoSession(req: Request, res: Response, next: NextFunction) {
  const id = req.signedCookies[COOKIE];
  if (typeof id !== "string") throw new AppError(401, "Enter a username to start your demo workspace.");
  const ws = await readWorkspace(id);
  if (!ws || !ws.active) throw new AppError(401, "Your demo session has ended. Start again to continue.");
  res.locals.workspace = ws;
  next();
}
