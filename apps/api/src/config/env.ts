import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  NIM_API_KEY: z.string().optional().default(""),
  NIM_BASE_URL: z.string().default("https://integrate.api.nvidia.com/v1"),
  NIM_CHAT_MODEL: z.string().default("meta/llama-3.1-8b-instruct"),
  NIM_EMBED_MODEL: z.string().default("nvidia/nv-embedqa-e5-v5"),
  LLM_PROVIDER: z.enum(["nvidia", "mock"]).default("nvidia"),
  GITHUB_TOKEN: z.string().optional().default(""),
  FILE_SANDBOX_ROOT: z.string().default("./sandbox"),
  CRON_SECRET: z.string().min(8),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SERVE_WEB: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  MAX_RAG_CANDIDATES: z.coerce.number().default(500),
  RAG_TOP_K: z.coerce.number().default(5),
  MAX_CONCURRENT_RUNS: z.coerce.number().default(2),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    // Allow boot in test with defaults
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return EnvSchema.parse({
        DATABASE_URL: process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/ai_agent_test",
        JWT_SECRET: process.env.JWT_SECRET ?? "test-jwt-secret-min-32-characters!!",
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-min-32-chars!!",
        CRON_SECRET: process.env.CRON_SECRET ?? "test-cron-secret",
        LLM_PROVIDER: "mock",
        ...process.env,
      });
    }
    throw new Error(`Invalid environment: ${msg}`);
  }
  return parsed.data;
}

export const env = loadEnv();
