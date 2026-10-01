import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import type { ToolDefinition } from "./manager.js";

function resolveSafe(rel: string): string {
  const root = path.resolve(env.FILE_SANDBOX_ROOT);
  const target = path.resolve(root, rel);
  if (!target.startsWith(root)) {
    throw new Error("Path escapes sandbox");
  }
  return target;
}

export const filesListTool: ToolDefinition = {
  name: "files.list",
  description: "List files in the sandbox directory",
  risk: "safe",
  inputSchema: z.object({
    path: z.string().default("."),
  }),
  async execute(input) {
    const dir = resolveSafe(input.path || ".");
    await fs.mkdir(env.FILE_SANDBOX_ROOT, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
  },
};

export const filesReadTool: ToolDefinition = {
  name: "files.read",
  description: "Read a text file from the sandbox",
  risk: "safe",
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  async execute(input) {
    const file = resolveSafe(input.path);
    const content = await fs.readFile(file, "utf8");
    return { path: input.path, content: content.slice(0, 100_000) };
  },
};

export const filesWriteTool: ToolDefinition = {
  name: "files.write",
  description: "Write a text file in the sandbox (requires approval)",
  risk: "write",
  inputSchema: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  async execute(input) {
    await fs.mkdir(env.FILE_SANDBOX_ROOT, { recursive: true });
    const file = resolveSafe(input.path);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, input.content, "utf8");
    return { path: input.path, bytes: Buffer.byteLength(input.content) };
  },
};
