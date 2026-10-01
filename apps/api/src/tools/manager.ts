import type { RiskLevel } from "@ai-agent/shared";
import { z } from "zod";

export interface ToolContext {
  userId: string;
  projectId: string;
  runId: string;
}

export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  risk: RiskLevel;
  inputSchema: T;
  execute: (input: z.infer<T>, ctx: ToolContext) => Promise<unknown>;
}

export class ToolManager {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): Array<{ name: string; description: string; risk: RiskLevel }> {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      risk: t.risk,
    }));
  }

  names(): string[] {
    return [...this.tools.keys()];
  }
}
