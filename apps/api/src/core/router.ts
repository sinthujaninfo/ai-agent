import type { PlanStep } from "@ai-agent/shared";
import type { ToolManager } from "../tools/manager.js";

export type RouteDecision =
  | { kind: "tool"; step: PlanStep }
  | { kind: "answer"; step: PlanStep }
  | { kind: "skip"; step: PlanStep; reason: string };

export function routeStep(step: PlanStep, tools: ToolManager): RouteDecision {
  if (!step.tool) {
    return { kind: "answer", step };
  }
  if (!tools.has(step.tool)) {
    return { kind: "skip", step, reason: `Unknown tool: ${step.tool}` };
  }
  return { kind: "tool", step };
}
