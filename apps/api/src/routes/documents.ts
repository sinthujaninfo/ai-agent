import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { env } from "../config/env.js";
import { createDocument, listDocuments, processKnowledgeJobs } from "../core/rag.js";
import { createEmbeddingProvider } from "../providers/index.js";
import { queryOne } from "../db/pool.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get("/", async (req: AuthedRequest, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: "projectId required" });
    return;
  }
  const project = await queryOne(`SELECT id FROM projects WHERE id = :id AND owner_id = :userId`, {
    id: projectId,
    userId: req.user!.id,
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const documents = await listDocuments(projectId);
  res.json({ documents });
});

documentsRouter.post("/upload", upload.single("file"), async (req: AuthedRequest, res) => {
  const projectId = (req.body.projectId as string) || "";
  const title = (req.body.title as string) || req.file?.originalname || "Untitled";
  let content = (req.body.content as string) || "";
  if (req.file) content = req.file.buffer.toString("utf8");
  if (!projectId || !content) {
    res.status(400).json({ error: "projectId and content/file required" });
    return;
  }
  const project = await queryOne(`SELECT id FROM projects WHERE id = :id AND owner_id = :userId`, {
    id: projectId,
    userId: req.user!.id,
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const id = await createDocument({ projectId, title, content, source: "upload" });
  res.status(201).json({ id, status: "pending" });
});

documentsRouter.post("/:id/reindex", async (req: AuthedRequest, res) => {
  const doc = await queryOne<{ id: string; project_id: string }>(
    `SELECT d.id, d.project_id FROM documents d
     JOIN projects p ON p.id = d.project_id
     WHERE d.id = :id AND p.owner_id = :userId`,
    { id: req.params.id, userId: req.user!.id },
  );
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const { execute } = await import("../db/pool.js");
  const { randomUUID } = await import("node:crypto");
  await execute(
    `INSERT INTO knowledge_jobs (id, type, payload_json, status) VALUES (:id, 'index_document', :payload, 'pending')`,
    { id: randomUUID(), payload: JSON.stringify({ documentId: doc.id }) },
  );
  await execute(`UPDATE documents SET status = 'pending' WHERE id = :id`, { id: doc.id });
  res.json({ ok: true });
});

export const cronRouter = Router();

cronRouter.post("/knowledge", async (req, res) => {
  const secret = req.headers["x-cron-secret"];
  if (secret !== env.CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const embedder = createEmbeddingProvider();
  const processed = await processKnowledgeJobs(embedder, 3);
  res.json({ processed });
});
