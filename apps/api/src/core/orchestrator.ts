import { randomUUID } from "node:crypto";
import type { AgentPlan, ChatMessage, PlanStep, RiskLevel } from "@ai-agent/shared";
import type { AuthUser } from "../auth/service.js";
import { execute, query, queryOne } from "../db/pool.js";
import { redactObject, logger } from "../lib/logger.js";
import { createEmbeddingProvider, createLLMProvider } from "../providers/index.js";
import { createToolManager } from "../tools/index.js";
import { env } from "../config/env.js";
import { createPlan } from "./planner.js";
import { routeStep } from "./router.js";
import { getShortTermMessages, retrieveLongTermMemory, saveMemory } from "./memory.js";
import { retrieveRagContext } from "./rag.js";
import { PermissionManager } from "./permissions.js";
import { requestApproval } from "./approvals.js";
import { runEvents } from "./events.js";

const activeRuns = new Set<string>();
const permissions = new PermissionManager();
const tools = createToolManager();

async function updateRunStatus(runId: string, status: string, extra?: { error?: string; plan?: AgentPlan }) {
  await execute(
    `UPDATE agent_runs SET status = :status,
      error = COALESCE(:error, error),
      plan_json = COALESCE(:plan, plan_json),
      finished_at = CASE WHEN :status IN ('succeeded','failed','cancelled') THEN NOW() ELSE finished_at END
     WHERE id = :id`,
    {
      id: runId,
      status,
      error: extra?.error ?? null,
      plan: extra?.plan ? JSON.stringify(extra.plan) : null,
    },
  );
  runEvents.emit(runId, { type: "run_status", data: { status } });
}

async function insertMessage(conversationId: string, role: string, content: string, meta?: unknown) {
  await execute(
    `INSERT INTO messages (id, conversation_id, role, content, meta_json) VALUES (:id, :conversationId, :role, :content, :meta)`,
    {
      id: randomUUID(),
      conversationId,
      role,
      content,
      meta: meta ? JSON.stringify(meta) : null,
    },
  );
}

async function executeToolCall(
  runId: string,
  step: PlanStep,
  ctx: { userId: string; projectId: string; user: AuthUser },
): Promise<{ paused: boolean; output?: unknown }> {
  const tool = tools.get(step.tool!);
  if (!tool) return { paused: false, output: { error: "tool missing" } };

  const risk: RiskLevel = step.risk || tool.risk;
  if (!permissions.canUseTool(ctx.user, risk)) {
    return { paused: false, output: { error: "permission denied" } };
  }

  const toolCallId = randomUUID();
  const input = step.input ?? {};
  await execute(
    `INSERT INTO tool_calls (id, run_id, tool, input_json, status, risk) VALUES (:id, :runId, :tool, :input, :status, :risk)`,
    {
      id: toolCallId,
      runId,
      tool: tool.name,
      input: JSON.stringify(redactObject(input)),
      status: permissions.requiresApproval(risk) ? "awaiting_approval" : "running",
      risk,
    },
  );

  if (permissions.requiresApproval(risk) || step.needsApproval) {
    const approvalId = await requestApproval(runId, toolCallId);
    await updateRunStatus(runId, "awaiting_approval");
    runEvents.emit(runId, {
      type: "approval_required",
      data: { approvalId, toolCallId, tool: tool.name, input: redactObject(input), risk },
    });
    return { paused: true };
  }

  runEvents.emit(runId, { type: "tool_start", data: { toolCallId, tool: tool.name } });
  try {
    const parsed = tool.inputSchema.parse(input);
    const output = await tool.execute(parsed, {
      userId: ctx.userId,
      projectId: ctx.projectId,
      runId,
    });
    await execute(
      `UPDATE tool_calls SET status = 'succeeded', output_json = :output WHERE id = :id`,
      { id: toolCallId, output: JSON.stringify(redactObject(output)) },
    );
    runEvents.emit(runId, { type: "tool_end", data: { toolCallId, tool: tool.name, output: redactObject(output) } });
    return { paused: false, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await execute(
      `UPDATE tool_calls SET status = 'failed', output_json = :output WHERE id = :id`,
      { id: toolCallId, output: JSON.stringify({ error: message }) },
    );
    runEvents.emit(runId, { type: "tool_end", data: { toolCallId, tool: tool.name, error: message } });
    return { paused: false, output: { error: message } };
  }
}

export async function resumeRunAfterApproval(runId: string, approved: boolean): Promise<void> {
  const run = await queryOne<{
    id: string;
    conversation_id: string;
    user_id: string;
    plan_json: string | AgentPlan | null;
    status: string;
  }>(`SELECT * FROM agent_runs WHERE id = :id`, { id: runId });
  if (!run) return;

  const conv = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM conversations WHERE id = :id`,
    { id: run.conversation_id },
  );
  if (!conv) return;

  const user = await queryOne<AuthUser>(`SELECT id, email, name, role FROM users WHERE id = :id`, {
    id: run.user_id,
  });
  if (!user) return;

  if (!approved) {
    await updateRunStatus(runId, "cancelled", { error: "Approval rejected" });
    runEvents.emit(runId, { type: "done", data: { status: "cancelled" } });
    return;
  }

  const pending = await queryOne<{ id: string; tool: string; input_json: string }>(
    `SELECT id, tool, input_json FROM tool_calls WHERE run_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1`,
    [runId],
  );
  if (!pending) {
    await continueRun(runId);
    return;
  }

  const tool = tools.get(pending.tool);
  if (!tool) {
    await updateRunStatus(runId, "failed", { error: "Tool missing after approval" });
    return;
  }

  await updateRunStatus(runId, "running");
  await execute(`UPDATE tool_calls SET status = 'running' WHERE id = :id`, { id: pending.id });
  runEvents.emit(runId, { type: "tool_start", data: { toolCallId: pending.id, tool: pending.tool } });

  try {
    const input = typeof pending.input_json === "string" ? JSON.parse(pending.input_json) : pending.input_json;
    const parsed = tool.inputSchema.parse(input ?? {});
    const output = await tool.execute(parsed, {
      userId: user.id,
      projectId: conv.project_id,
      runId,
    });
    await execute(`UPDATE tool_calls SET status = 'succeeded', output_json = :output WHERE id = :id`, {
      id: pending.id,
      output: JSON.stringify(redactObject(output)),
    });
    runEvents.emit(runId, {
      type: "tool_end",
      data: { toolCallId: pending.id, tool: pending.tool, output: redactObject(output) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await execute(`UPDATE tool_calls SET status = 'failed', output_json = :output WHERE id = :id`, {
      id: pending.id,
      output: JSON.stringify({ error: message }),
    });
  }

  await continueRun(runId);
}

async function continueRun(runId: string): Promise<void> {
  const run = await queryOne<{
    id: string;
    conversation_id: string;
    user_id: string;
    plan_json: string | AgentPlan | null;
  }>(`SELECT * FROM agent_runs WHERE id = :id`, { id: runId });
  if (!run?.plan_json) {
    await finalizeAnswer(runId);
    return;
  }
  const plan: AgentPlan = typeof run.plan_json === "string" ? JSON.parse(run.plan_json) : run.plan_json;
  const doneTools = await query<{ tool: string }>(
    `SELECT tool FROM tool_calls WHERE run_id = :runId AND status IN ('succeeded','failed','rejected')`,
    { runId },
  );
  const doneSet = new Set(doneTools.map((t) => t.tool));

  const conv = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM conversations WHERE id = :id`,
    { id: run.conversation_id },
  );
  const user = await queryOne<AuthUser>(`SELECT id, email, name, role FROM users WHERE id = :id`, {
    id: run.user_id,
  });
  if (!conv || !user) return;

  for (const step of plan.steps) {
    const decision = routeStep(step, tools);
    if (decision.kind === "tool") {
      if (doneSet.has(step.tool!)) continue;
      const result = await executeToolCall(runId, step, {
        userId: user.id,
        projectId: conv.project_id,
        user,
      });
      if (result.paused) return;
      doneSet.add(step.tool!);
    }
  }

  await finalizeAnswer(runId);
}

async function finalizeAnswer(runId: string): Promise<void> {
  const run = await queryOne<{
    id: string;
    conversation_id: string;
    user_id: string;
    plan_json: string | AgentPlan | null;
  }>(`SELECT * FROM agent_runs WHERE id = :id`, { id: runId });
  if (!run) return;

  const conv = await queryOne<{ project_id: string }>(
    `SELECT project_id FROM conversations WHERE id = :id`,
    { id: run.conversation_id },
  );
  if (!conv) return;

  const llm = createLLMProvider();
  const embedder = createEmbeddingProvider();
  const history = await getShortTermMessages(run.conversation_id);
  const toolTrail = await query<{ tool: string; output_json: string | null; status: string }>(
    `SELECT tool, output_json, status FROM tool_calls WHERE run_id = :runId ORDER BY created_at ASC`,
    { runId },
  );

  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const rag = await retrieveRagContext(conv.project_id, lastUser, embedder);
  const memory = await retrieveLongTermMemory(conv.project_id, lastUser, embedder);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are the user's AI agent. Produce a clear final answer. Use tool results and RAG context when relevant.",
    },
    ...history.map((m) => ({ role: m.role as ChatMessage["role"], content: m.content })),
    {
      role: "system",
      content: `Tool results:\n${JSON.stringify(toolTrail)}\n\nMemory:\n${memory}\n\nRAG:\n${rag}`,
    },
  ];

  await updateRunStatus(runId, "running");
  let answer = "";
  try {
    for await (const chunk of llm.stream({ messages, temperature: 0.3 })) {
      if (chunk.delta) {
        answer += chunk.delta;
        runEvents.emit(runId, { type: "token", data: { delta: chunk.delta } });
      }
    }
    if (!answer) {
      const res = await llm.chat({ messages, temperature: 0.3 });
      answer = res.content;
      runEvents.emit(runId, { type: "token", data: { delta: answer } });
    }
  } catch (err) {
    logger.error(err, "finalizeAnswer failed");
    answer = "I could not complete the response due to a model error.";
    runEvents.emit(runId, { type: "error", data: { message: String(err) } });
  }

  await insertMessage(run.conversation_id, "assistant", answer, { runId });
  try {
    if (answer.length > 40) {
      await saveMemory(conv.project_id, `Q: ${lastUser.slice(0, 200)}\nA: ${answer.slice(0, 500)}`, "summary", embedder);
    }
  } catch (err) {
    logger.warn(err, "memory save failed");
  }

  await updateRunStatus(runId, "succeeded");
  runEvents.emit(runId, { type: "done", data: { status: "succeeded", answer } });
  activeRuns.delete(runId);
}

export async function startAgentRun(input: {
  conversationId: string;
  message: string;
  user: AuthUser;
}): Promise<string> {
  if (activeRuns.size >= env.MAX_CONCURRENT_RUNS) {
    throw new Error("Too many concurrent agent runs; try again shortly");
  }

  const conv = await queryOne<{ id: string; project_id: string }>(
    `SELECT c.id, c.project_id FROM conversations c
     JOIN projects p ON p.id = c.project_id
     WHERE c.id = :id AND p.owner_id = :userId`,
    { id: input.conversationId, userId: input.user.id },
  );
  if (!conv) throw new Error("Conversation not found");

  await insertMessage(input.conversationId, "user", input.message);

  const runId = randomUUID();
  await execute(
    `INSERT INTO agent_runs (id, conversation_id, user_id, status) VALUES (:id, :conversationId, :userId, 'queued')`,
    { id: runId, conversationId: input.conversationId, userId: input.user.id },
  );

  activeRuns.add(runId);
  void runAgent(runId, conv.project_id, input.message, input.user).catch(async (err) => {
    logger.error(err, "agent run failed");
    await updateRunStatus(runId, "failed", { error: err instanceof Error ? err.message : String(err) });
    runEvents.emit(runId, { type: "error", data: { message: String(err) } });
    runEvents.emit(runId, { type: "done", data: { status: "failed" } });
    activeRuns.delete(runId);
  });

  return runId;
}

async function runAgent(runId: string, projectId: string, goal: string, user: AuthUser): Promise<void> {
  const llm = createLLMProvider();
  const embedder = createEmbeddingProvider();

  await updateRunStatus(runId, "planning");
  const memory = await retrieveLongTermMemory(projectId, goal, embedder);
  const rag = await retrieveRagContext(projectId, goal, embedder);
  const plan = await createPlan(llm, goal, {
    memory,
    rag,
    tools: tools.names(),
  });
  await updateRunStatus(runId, "running", { plan });
  runEvents.emit(runId, { type: "plan", data: plan });

  for (const step of plan.steps) {
    const decision = routeStep(step, tools);
    if (decision.kind === "skip") {
      logger.warn({ step, reason: decision.reason }, "skipping step");
      continue;
    }
    if (decision.kind === "tool") {
      const result = await executeToolCall(runId, step, {
        userId: user.id,
        projectId,
        user,
      });
      if (result.paused) return;
    }
  }

  await finalizeAnswer(runId);
}

export async function getAgentRun(runId: string, userId: string) {
  const run = await queryOne(
    `SELECT id, conversation_id, status, plan_json, error, started_at, finished_at, usage_json
     FROM agent_runs WHERE id = :id AND user_id = :userId`,
    { id: runId, userId },
  );
  if (!run) return null;
  const toolCalls = await query(
    `SELECT id, tool, input_json, output_json, status, risk, created_at FROM tool_calls WHERE run_id = :runId ORDER BY created_at ASC`,
    { runId },
  );
  return { ...run, toolCalls };
}

export async function listRunsForProject(projectId: string, userId: string, limit = 50) {
  return query(
    `SELECT r.id, r.conversation_id, r.status, r.error, r.started_at, r.finished_at
     FROM agent_runs r
     JOIN conversations c ON c.id = r.conversation_id
     JOIN projects p ON p.id = c.project_id
     WHERE p.id = ? AND p.owner_id = ? AND r.user_id = ?
     ORDER BY r.started_at DESC
     LIMIT ?`,
    [projectId, userId, userId, limit],
  );
}

export function getToolCatalog() {
  return tools.list();
}
