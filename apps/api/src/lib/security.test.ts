import { describe, expect, it } from "vitest";
import { redactObject } from "./logger.js";
import { routeStep } from "../core/router.js";
import { ToolManager } from "../tools/manager.js";
import { z } from "zod";

describe("redactObject", () => {
  it("redacts secret-like keys", () => {
    const out = redactObject({ token: "abc", nested: { apiKey: "x", ok: 1 } });
    expect(out).toEqual({ token: "[REDACTED]", nested: { apiKey: "[REDACTED]", ok: 1 } });
  });
});

describe("routeStep", () => {
  const tools = new ToolManager();
  tools.register({
    name: "server.health",
    description: "health",
    risk: "safe",
    inputSchema: z.object({}),
    execute: async () => ({}),
  });

  it("routes tool steps", () => {
    const d = routeStep({ id: "1", action: "check", tool: "server.health", risk: "safe", needsApproval: false }, tools);
    expect(d.kind).toBe("tool");
  });

  it("routes answer steps", () => {
    const d = routeStep({ id: "1", action: "reply", risk: "safe", needsApproval: false }, tools);
    expect(d.kind).toBe("answer");
  });

  it("skips unknown tools", () => {
    const d = routeStep({ id: "1", action: "x", tool: "nope", risk: "safe", needsApproval: false }, tools);
    expect(d.kind).toBe("skip");
  });
});
