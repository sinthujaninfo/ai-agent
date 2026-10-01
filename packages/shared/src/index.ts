import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const RiskLevelSchema = z.enum(["safe", "write", "destructive"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const AgentRunStatusSchema = z.enum([
  "queued",
  "planning",
  "awaiting_approval",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const DocumentStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  action: z.string(),
  tool: z.string().optional(),
  input: z.record(z.unknown()).optional(),
  risk: RiskLevelSchema.default("safe"),
  needsApproval: z.boolean().default(false),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const AgentPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(PlanStepSchema),
  summary: z.string().optional(),
});
export type AgentPlan = z.infer<typeof AgentPlanSchema>;

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  settings: z.record(z.unknown()).optional(),
});

export const CreateConversationSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
});

export const StartAgentRunSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(20000),
});

export const DecideApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  raw?: unknown;
}

export interface ChatChunk {
  delta: string;
  done?: boolean;
}

export type SseEventType =
  | "run_status"
  | "plan"
  | "token"
  | "tool_start"
  | "tool_end"
  | "approval_required"
  | "error"
  | "done"
  | "heartbeat";

export interface SseEvent<T = unknown> {
  type: SseEventType;
  data: T;
}

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
