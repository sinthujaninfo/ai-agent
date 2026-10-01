import mysql from "mysql2/promise";
import { env } from "../config/env.js";

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      // Hostinger / shared MySQL often needs longer connect timeout
      connectTimeout: 20_000,
    } as mysql.PoolOptions);
  }
  return pool;
}

export async function query<T = unknown>(
  sql: string,
  params?: Record<string, unknown> | unknown[],
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params as never);
  return rows as T[];
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: Record<string, unknown> | unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params?: Record<string, unknown> | unknown[],
): Promise<mysql.ResultSetHeader> {
  const [result] = await getPool().execute(sql, params as never);
  return result as mysql.ResultSetHeader;
}

export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
