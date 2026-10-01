import { Router } from "express";
import {
  LoginSchema,
  RegisterSchema,
} from "@ai-agent/shared";
import {
  authenticate,
  registerUser,
  rotateRefreshToken,
  signAccessToken,
  signRefreshToken,
  storeRefreshToken,
  writeAudit,
} from "../auth/service.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await registerUser(parsed.data.email, parsed.data.password, parsed.data.name);
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);
    await writeAudit(user.id, "auth.register", "user", { email: user.email });
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Duplicate") || message.includes("ER_DUP_ENTRY")) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    res.status(500).json({ error: message });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);
  await writeAudit(user.id, "auth.login", "user", { email: user.email });
  res.json({ user, accessToken, refreshToken });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.body?.refreshToken as string | undefined;
  if (!token) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  const rotated = await rotateRefreshToken(token);
  if (!rotated) {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }
  res.json(rotated);
});
