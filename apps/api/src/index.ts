import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { conversationsRouter, projectsRouter } from "./routes/projects.js";
import { agentRouter, approvalsRouter, auditRouter } from "./routes/agent.js";
import { cronRouter, documentsRouter } from "./routes/documents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== "test",
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ai-agent-api", time: new Date().toISOString() });
  });

  app.use("/auth", authRouter);
  app.use("/projects", projectsRouter);
  app.use("/conversations", conversationsRouter);
  app.use("/agent", agentRouter);
  app.use("/approvals", approvalsRouter);
  app.use("/documents", documentsRouter);
  app.use("/audit-logs", auditRouter);
  app.use("/internal/cron", cronRouter);

  if (env.SERVE_WEB) {
    const webDist = path.resolve(__dirname, "../../web/dist");
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (
        req.path.startsWith("/auth") ||
        req.path.startsWith("/projects") ||
        req.path.startsWith("/conversations") ||
        req.path.startsWith("/agent") ||
        req.path.startsWith("/approvals") ||
        req.path.startsWith("/documents") ||
        req.path.startsWith("/audit-logs") ||
        req.path.startsWith("/internal") ||
        req.path.startsWith("/health")
      ) {
        return next();
      }
      res.sendFile(path.join(webDist, "index.html"), (err) => {
        if (err) next();
      });
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err, "unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
