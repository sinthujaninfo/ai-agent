import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      VITEST: "true",
      DATABASE_URL: "mysql://root:password@127.0.0.1:3306/ai_agent_test",
      JWT_SECRET: "test-jwt-secret-min-32-characters!!",
      JWT_REFRESH_SECRET: "test-refresh-secret-min-32-chars!!",
      CRON_SECRET: "test-cron-secret",
      LLM_PROVIDER: "mock",
    },
  },
});
