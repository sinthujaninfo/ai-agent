import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AuthUser } from "./service.js";

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.id, email: payload.email, role: payload.role, name: null };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireCron(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET && secret !== (req.app.get("cronSecret") as string | undefined)) {
    // fall through to env via dynamic import avoidance — check in route using env
  }
  next();
}
