import { AgentPlanSchema, type AgentPlan, type ChatMessage } from "@ai-agent/shared";
import type { LLMProvider } from "../providers/types.js";
import { parseJsonLoose } from "../lib/math.js";

export async function createPlan(
  llm: LLMProvider,
  goal: string,
  context: { memory: string; rag: string; tools: string[] },
): Promise<AgentPlan> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are the Planner for an AI agent. Return ONLY valid JSON matching:
{"goal":string,"summary":string,"steps":[{"id":string,"action":string,"tool"?:string,"input"?:object,"risk":"safe"|"write"|"destructive","needsApproval":boolean}]}
Available tools: ${context.tools.join(", ")}.
Use tools only when needed. Mark write/destructive actions with needsApproval=true.
Prefer a short plan (1-5 steps). Last step may be a direct answer without a tool.`,
    },
    {
      role: "user",
      content: `Goal: ${goal}\n\nLong-term memory:\n${context.memory || "(none)"}\n\nRAG context:\n${context.rag || "(none)"}`,
    },
  ];

  const res = await llm.chat({ messages, jsonMode: true, temperature: 0.1 });
  const raw = parseJsonLoose<unknown>(res.content);
  const plan = AgentPlanSchema.parse(raw);
  return plan;
}
