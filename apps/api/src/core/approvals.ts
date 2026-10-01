import { randomUUID } from "node:crypto";
import { execute, query, queryOne } from "../db/pool.js";
import { writeAudit } from "../auth/service.js";

export async function requestApproval(runId: string, toolCallId: string): Promise<string> {
  const id = randomUUID();
  await execute(
    `INSERT INTO approvals (id, run_id, tool_call_id, status) VALUES (:id, :runId, :toolCallId, 'pending')`,
    { id, runId, toolCallId },
  );
  return id;
}

export async function decideApproval(
  approvalId: string,
  userId: string,
  decision: "approved" | "rejected",
): Promise<{ runId: string; toolCallId: string } | null> {
  const row = await queryOne<{ id: string; run_id: string; tool_call_id: string; status: string }>(
    `SELECT id, run_id, tool_call_id, status FROM approvals WHERE id = :id`,
    { id: approvalId },
  );
  if (!row || row.status !== "pending") return null;
  await execute(
    `UPDATE approvals SET status = :status, resolved_at = NOW(), resolver_id = :userId WHERE id = :id`,
    { id: approvalId, status: decision, userId },
  );
  await execute(`UPDATE tool_calls SET status = :status WHERE id = :id`, {
    id: row.tool_call_id,
    status: decision === "approved" ? "pending" : "rejected",
  });
  await writeAudit(userId, "approval.decide", approvalId, { decision, runId: row.run_id });
  return { runId: row.run_id, toolCallId: row.tool_call_id };
}

export async function listApprovals(userId: string, status = "pending") {
  return query(
    `SELECT a.id, a.run_id, a.tool_call_id, a.status, a.requested_at, t.tool, t.input_json, t.risk
     FROM approvals a
     JOIN tool_calls t ON t.id = a.tool_call_id
     JOIN agent_runs r ON r.id = a.run_id
     WHERE r.user_id = :userId AND a.status = :status
     ORDER BY a.requested_at DESC`,
    { userId, status },
  );
}

export async function getPendingApprovalForRun(runId: string) {
  return queryOne<{ id: string; tool_call_id: string }>(
    `SELECT id, tool_call_id FROM approvals WHERE run_id = ? AND status = 'pending' LIMIT 1`,
    [runId],
  );
}
