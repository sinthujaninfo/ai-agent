import { z } from "zod";
import { getPool } from "../db/pool.js";
import type { ToolDefinition } from "./manager.js";

export const serverHealthTool: ToolDefinition = {
  name: "server.health",
  description: "Return API and database health status",
  risk: "safe",
  inputSchema: z.object({}),
  async execute() {
    let db = "unknown";
    try {
      await getPool().query("SELECT 1");
      db = "ok";
    } catch {
      db = "error";
    }
    return {
      api: "ok",
      database: db,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
  },
};

export const databaseQueryTool: ToolDefinition = {
  name: "database.query",
  description: "Run a read-only SELECT against allowlisted information (requires care)",
  risk: "safe",
  inputSchema: z.object({
    sql: z.string().min(1).max(2000),
  }),
  async execute(input) {
    const normalized = input.sql.trim().toLowerCase();
    if (!normalized.startsWith("select")) {
      throw new Error("Only SELECT queries are allowed");
    }
    if (/;|--|\/\*|into\s|update\s|delete\s|drop\s|alter\s|insert\s|replace\s|grant\s/i.test(input.sql)) {
      throw new Error("Query rejected by safety filter");
    }
    const [rows] = await getPool().query(input.sql);
    return { rows: Array.isArray(rows) ? rows.slice(0, 100) : rows };
  },
};
