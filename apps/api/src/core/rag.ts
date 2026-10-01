import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { execute, query, queryOne } from "../db/pool.js";
import type { EmbeddingProvider } from "../providers/types.js";
import { chunkText, cosineSimilarity } from "../lib/math.js";

interface ChunkRow {
  id: string;
  content: string;
  embedding: string | number[] | null;
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

export async function createDocument(input: {
  projectId: string;
  title: string;
  content: string;
  source?: string;
}): Promise<string> {
  const id = randomUUID();
  await execute(
    `INSERT INTO documents (id, project_id, title, source, content, status) VALUES (:id, :projectId, :title, :source, :content, 'pending')`,
    {
      id,
      projectId: input.projectId,
      title: input.title,
      source: input.source ?? "upload",
      content: input.content,
    },
  );
  await execute(
    `INSERT INTO knowledge_jobs (id, type, payload_json, status) VALUES (:id, 'index_document', :payload, 'pending')`,
    {
      id: randomUUID(),
      payload: JSON.stringify({ documentId: id }),
    },
  );
  return id;
}

export async function indexDocument(documentId: string, embedder: EmbeddingProvider): Promise<void> {
  const doc = await queryOne<{ id: string; project_id: string; content: string | null; status: string }>(
    `SELECT id, project_id, content, status FROM documents WHERE id = :id`,
    { id: documentId },
  );
  if (!doc || !doc.content) throw new Error("Document not found or empty");

  await execute(`UPDATE documents SET status = 'processing', error = NULL WHERE id = :id`, { id: documentId });
  await execute(`DELETE FROM document_chunks WHERE document_id = :id`, { id: documentId });

  const chunks = chunkText(doc.content);
  const batchSize = 8;
  try {
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embedder.embed(batch);
      for (let j = 0; j < batch.length; j++) {
        await execute(
          `INSERT INTO document_chunks (id, document_id, project_id, chunk_index, content, embedding, token_count)
           VALUES (:id, :documentId, :projectId, :chunkIndex, :content, :embedding, :tokenCount)`,
          {
            id: randomUUID(),
            documentId,
            projectId: doc.project_id,
            chunkIndex: i + j,
            content: batch[j],
            embedding: JSON.stringify(embeddings[j]),
            tokenCount: Math.ceil((batch[j]?.length ?? 0) / 4),
          },
        );
      }
    }
    await execute(`UPDATE documents SET status = 'ready' WHERE id = :id`, { id: documentId });
  } catch (err) {
    await execute(`UPDATE documents SET status = 'failed', error = :error WHERE id = :id`, {
      id: documentId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function retrieveRagContext(
  projectId: string,
  question: string,
  embedder: EmbeddingProvider,
): Promise<string> {
  let candidates: ChunkRow[] = [];
  try {
    candidates = await query<ChunkRow>(
      `SELECT c.id, c.content, c.embedding
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.project_id = ? AND d.status = 'ready'
         AND MATCH(c.content) AGAINST (? IN NATURAL LANGUAGE MODE)
       LIMIT ?`,
      [projectId, question.slice(0, 200), env.MAX_RAG_CANDIDATES],
    );
  } catch {
    // FULLTEXT may be unavailable; fall back
  }

  if (candidates.length === 0) {
    candidates = await query<ChunkRow>(
      `SELECT c.id, c.content, c.embedding
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.project_id = ? AND d.status = 'ready'
       ORDER BY c.created_at DESC
       LIMIT ?`,
      [projectId, env.MAX_RAG_CANDIDATES],
    );
  }

  if (candidates.length === 0) return "";

  const [qVec] = await embedder.embed([question]);
  const scored = candidates
    .map((c) => {
      const emb = parseEmbedding(c.embedding);
      return {
        content: c.content,
        score: emb && qVec ? cosineSimilarity(qVec, emb) : 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, env.RAG_TOP_K);

  return scored.map((s, i) => `[${i + 1}] ${s.content}`).join("\n\n");
}

export async function listDocuments(projectId: string) {
  return query(
    `SELECT id, title, source, status, created_at, error FROM documents WHERE project_id = :projectId ORDER BY created_at DESC`,
    { projectId },
  );
}

export async function processKnowledgeJobs(embedder: EmbeddingProvider, maxJobs = 3): Promise<number> {
  const jobs = await query<{ id: string; type: string; payload_json: string }>(
    `SELECT id, type, payload_json FROM knowledge_jobs WHERE status = 'pending' AND run_at <= NOW() ORDER BY run_at ASC LIMIT ?`,
    [maxJobs],
  );
  let done = 0;
  for (const job of jobs) {
    await execute(`UPDATE knowledge_jobs SET status = 'running' WHERE id = :id`, { id: job.id });
    try {
      const payload = typeof job.payload_json === "string" ? JSON.parse(job.payload_json) : job.payload_json;
      if (job.type === "index_document" && payload.documentId) {
        await indexDocument(payload.documentId, embedder);
      }
      await execute(
        `UPDATE knowledge_jobs SET status = 'succeeded', finished_at = NOW() WHERE id = :id`,
        { id: job.id },
      );
      done++;
    } catch (err) {
      await execute(
        `UPDATE knowledge_jobs SET status = 'failed', finished_at = NOW(), error = :error WHERE id = :id`,
        { id: job.id, error: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  return done;
}
