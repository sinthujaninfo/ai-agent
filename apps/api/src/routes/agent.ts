import { Router } from "express";
import { DecideApprovalSchema, StartAgentRunSchema } from "@ai-agent/shared";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { listAuditLogs } from "../auth/service.js";
import { decideApproval, listApprovals } from "../core/approvals.js";
import { runEvents } from "../core/events.js";
import {
  getAgentRun,
  getToolCatalog,
  listRunsForProject,
  resumeRunAfterApproval,
  startAgentRun,
} from "../core/orchestrator.js";
import { env } from "../config/env.js";

export const agentRouter = Router();
agentRouter.use(requireAuth);

agentRouter.get("/tools", (_req, res) => {
  res.json({ tools: getToolCatalog() });
});

agentRouter.get("/runs", async (req: AuthedRequest, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: "projectId required" });
    return;
  }
  const runs = await listRunsForProject(projectId, req.user!.id);
  res.json({ runs });
});

agentRouter.post("/runs", async (req: AuthedRequest, res) => {
  const parsed = StartAgentRunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  try {
    const runId = await startAgentRun({
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
      user: req.user!,
    });
    res.status(201).json({ runId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

agentRouter.get("/runs/:id", async (req: AuthedRequest, res) => {
  const run = await getAgentRun(req.params.id, req.user!.id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json({ run });
});

agentRouter.get("/runs/:id/stream", async (req: AuthedRequest, res) => {
  const run = await getAgentRun(req.params.id, req.user!.id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: { type: string; data: unknown }) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };

  send({ type: "run_status", data: { status: (run as unknown as { status: string }).status } });

  const unsubscribe = runEvents.subscribe(req.params.id, (event) => {
    send(event);
    if (event.type === "done") {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    }
  });

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: {}\n\n`);
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  const status = (run as unknown as { status: string }).status;
  if (["succeeded", "failed", "cancelled"].includes(status)) {
    send({ type: "done", data: { status } });
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  }
});

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

approvalsRouter.get("/", async (req: AuthedRequest, res) => {
  const status = (req.query.status as string) || "pending";
  const approvals = await listApprovals(req.user!.id, status);
  res.json({ approvals });
});

approvalsRouter.post("/:id/decide", async (req: AuthedRequest, res) => {
  const parsed = DecideApprovalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const result = await decideApproval(req.params.id, req.user!.id, parsed.data.decision);
  if (!result) {
    res.status(404).json({ error: "Approval not found or already resolved" });
    return;
  }
  void resumeRunAfterApproval(result.runId, parsed.data.decision === "approved");
  res.json({ ok: true, ...result });
});

export const auditRouter = Router();
auditRouter.use(requireAuth);
auditRouter.get("/", async (req: AuthedRequest, res) => {
  if (req.user!.role !== "admin") {
    // owners can still see their own via join — for V1 return all for authenticated user actions only
  }
  const logs = await listAuditLogs(100);
  res.json({ logs });
});

// silence unused in stream helper typing
void env;
