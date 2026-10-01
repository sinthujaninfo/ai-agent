import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { execute, query, queryOne } from "../db/pool.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
}

interface UserRow extends AuthUser {
  password_hash: string;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyAccessToken(token: string): AuthUser & { sub: string } {
  const payload = jwt.verify(token, env.JWT_SECRET) as {
    sub: string;
    email: string;
    role: "admin" | "user";
  };
  return { id: payload.sub, sub: payload.sub, email: payload.email, role: payload.role, name: null };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (:id, :userId, :hash, :expires)`,
    { id: randomUUID(), userId, hash: hashToken(token), expires },
  );
}

export async function rotateRefreshToken(oldToken: string): Promise<{ user: AuthUser; accessToken: string; refreshToken: string } | null> {
  let payload: { sub: string };
  try {
    payload = jwt.verify(oldToken, env.JWT_REFRESH_SECRET) as { sub: string };
  } catch {
    return null;
  }
  const row = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_tokens WHERE token_hash = :hash AND expires_at > NOW()`,
    { hash: hashToken(oldToken) },
  );
  if (!row) return null;
  await execute(`DELETE FROM refresh_tokens WHERE id = :id`, { id: row.id });
  const user = await findUserById(payload.sub);
  if (!user) return null;
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);
  return { user, accessToken, refreshToken };
}

export async function registerUser(email: string, password: string, name?: string): Promise<AuthUser> {
  const id = randomUUID();
  const password_hash = await hashPassword(password);
  await execute(
    `INSERT INTO users (id, email, password_hash, name, role) VALUES (:id, :email, :password_hash, :name, 'user')`,
    { id, email: email.toLowerCase(), password_hash, name: name ?? null },
  );
  return { id, email: email.toLowerCase(), name: name ?? null, role: "user" };
}

export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const user = await queryOne<UserRow>(`SELECT * FROM users WHERE email = :email`, {
    email: email.toLowerCase(),
  });
  if (!user) return null;
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  return queryOne<AuthUser>(`SELECT id, email, name, role FROM users WHERE id = :id`, { id });
}

export async function writeAudit(
  userId: string | null,
  action: string,
  resource?: string,
  detail?: unknown,
): Promise<void> {
  await execute(
    `INSERT INTO audit_logs (id, user_id, action, resource, detail_json) VALUES (:id, :userId, :action, :resource, :detail)`,
    {
      id: randomUUID(),
      userId,
      action,
      resource: resource ?? null,
      detail: detail ? JSON.stringify(detail) : null,
    },
  );
}

export async function listAuditLogs(limit = 100) {
  return query(
    `SELECT id, user_id, action, resource, detail_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}
