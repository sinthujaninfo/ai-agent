import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = getPool();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const dir = path.join(__dirname, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const [existing] = await pool.execute<import("mysql2").RowDataPacket[]>(
      "SELECT id FROM _migrations WHERE id = ?",
      [file],
    );
    if (existing.length > 0) {
      logger.info({ file }, "migration already applied");
      continue;
    }
    const sql = readFileSync(path.join(dir, file), "utf8");
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const stmt of statements) {
        await conn.query(stmt);
      }
      await conn.execute("INSERT INTO _migrations (id) VALUES (?)", [file]);
      await conn.commit();
      logger.info({ file }, "migration applied");
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  logger.info("migrations complete");
  await pool.end();
}

migrate().catch((err) => {
  logger.error(err, "migration failed");
  process.exit(1);
});
