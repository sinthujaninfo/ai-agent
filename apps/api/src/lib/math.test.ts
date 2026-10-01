import { describe, expect, it } from "vitest";
import { chunkText, cosineSimilarity, parseJsonLoose } from "../lib/math.js";
import { PermissionManager } from "../core/permissions.js";
import { localHashEmbed } from "../providers/nvidia.js";
import { AgentPlanSchema } from "@ai-agent/shared";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("chunkText", () => {
  it("chunks with overlap", () => {
    const text = "a".repeat(1000);
    const chunks = chunkText(text, 400, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBe(400);
  });
});

describe("parseJsonLoose", () => {
  it("parses fenced-ish JSON", () => {
    const plan = parseJsonLoose<{ goal: string }>('Here is JSON:\n{"goal":"test"}\nThanks');
    expect(plan.goal).toBe("test");
  });
});

describe("PermissionManager", () => {
  const pm = new PermissionManager();
  it("requires approval for write", () => {
    expect(pm.requiresApproval("write")).toBe(true);
    expect(pm.requiresApproval("safe")).toBe(false);
  });
  it("allows admin destructive", () => {
    expect(pm.canUseTool({ id: "1", email: "a@b.c", name: null, role: "admin" }, "destructive")).toBe(true);
    expect(pm.canUseTool({ id: "1", email: "a@b.c", name: null, role: "user" }, "destructive")).toBe(false);
  });
});

describe("localHashEmbed", () => {
  it("is deterministic and normalized", () => {
    const a = localHashEmbed("hello world", 64);
    const b = localHashEmbed("hello world", 64);
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe("AgentPlanSchema", () => {
  it("validates planner output", () => {
    const plan = AgentPlanSchema.parse({
      goal: "Say hi",
      steps: [{ id: "1", action: "Reply", risk: "safe", needsApproval: false }],
    });
    expect(plan.steps).toHaveLength(1);
  });
});
