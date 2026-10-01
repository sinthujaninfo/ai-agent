import { randomUUID } from "node:crypto";
import { query, execute } from "../db/pool.js";
import type { EmbeddingProvider } from "../providers/types.js";
import { cosineSimilarity } from "../lib/math.js";
import { env } from "../config/env.js";

export interface MemoryRow {
  id: string;
  project_id: string;
  kind: string;
  content: string;
  embedding: string | number[] | null;
  tags_json: string | null;
}

function parseEmbedding(raw: string | number[] | null): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return null;
  }
}

export async function getShortTermMessages(conversationId: string, limit = 40) {
  return query<{ role: string; content: string }>(
    `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`,
    [conversationId, limit],
  );
}

export async function retrieveLongTermMemory(
  projectId: string,
  queryText: string,
  embedder: EmbeddingProvider,
  topK = 5,
): Promise<string> {
  const rows = await query<MemoryRow>(
    `SELECT id, project_id, kind, content, embedding, tags_json FROM memories WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
    [projectId, env.MAX_RAG_CANDIDATES],
  );
  if (rows.length === 0) return "";
  const [qVec] = await embedder.embed([queryText]);
  const scored = rows
    .map((r) => {
      const emb = parseEmbedding(r.embedding);
      const score = emb && qVec ? cosineSimilarity(qVec, emb) : 0;
      const keywordBoost = r.content.toLowerCase().includes(queryText.toLowerCase().slice(0, 40)) ? 0.1 : 0;
      return { content: r.content, kind: r.kind, score: score + keywordBoost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored.map((s) => `[${s.kind}] ${s.content}`).join("\n");
}

export async function saveMemory(
  projectId: string,
  content: string,
  kind: string,
  embedder: EmbeddingProvider,
  tags: string[] = [],
): Promise<void> {
  const [embedding] = await embedder.embed([content]);
  await execute(
    `INSERT INTO memories (id, project_id, kind, content, embedding, tags_json) VALUES (:id, :projectId, :kind, :content, :embedding, :tags)`,
    {
      id: randomUUID(),
      projectId,
      kind,
      content,
      embedding: JSON.stringify(embedding),
      tags: JSON.stringify(tags),
    },
  );
}
