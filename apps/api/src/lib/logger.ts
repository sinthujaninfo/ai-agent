import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "password",
      "password_hash",
      "token",
      "NIM_API_KEY",
      "GITHUB_TOKEN",
      "*.password",
      "*.token",
      "*.apiKey",
      "input_json.token",
      "output_json.token",
    ],
    censor: "[REDACTED]",
  },
});

const SECRET_KEYS = /password|token|secret|apikey|authorization|bearer/i;

export function redactObject<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value as T;
  if (Array.isArray(value)) return value.map((v) => redactObject(v)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : redactObject(v);
    }
    return out as T;
  }
  return value;
}
