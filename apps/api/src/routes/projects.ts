import { Router } from "express";
import { randomUUID } from "node:crypto";
import { CreateConversationSchema, CreateProjectSchema } from "@ai-agent/shared";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { execute, query, queryOne } from "../db/pool.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT id, name, settings_json, created_at FROM projects WHERE owner_id = :userId ORDER BY created_at DESC`,
    { userId: req.user!.id },
  );
  res.json({ projects: rows });
});

projectsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  const id = randomUUID();
  await execute(
    `INSERT INTO projects (id, owner_id, name, settings_json) VALUES (:id, :ownerId, :name, :settings)`,
    {
      id,
      ownerId: req.user!.id,
      name: parsed.data.name,
      settings: JSON.stringify(parsed.data.settings ?? {}),
    },
  );
  res.status(201).json({ id, name: parsed.data.name });
});

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get("/", async (req: AuthedRequest, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: "projectId required" });
    return;
  }
  const rows = await query(
    `SELECT c.id, c.title, c.created_at FROM conversations c
     JOIN projects p ON p.id = c.project_id
     WHERE c.project_id = :projectId AND p.owner_id = :userId
     ORDER BY c.created_at DESC`,
    { projectId, userId: req.user!.id },
  );
  res.json({ conversations: rows });
});

conversationsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = CreateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  const project = await queryOne(
    `SELECT id FROM projects WHERE id = :id AND owner_id = :userId`,
    { id: parsed.data.projectId, userId: req.user!.id },
  );
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const id = randomUUID();
  const title = parsed.data.title ?? "New chat";
  await execute(
    `INSERT INTO conversations (id, project_id, title) VALUES (:id, :projectId, :title)`,
    { id, projectId: parsed.data.projectId, title },
  );
  res.status(201).json({ id, title, projectId: parsed.data.projectId });
});

conversationsRouter.get("/:id/messages", async (req: AuthedRequest, res) => {
  const conv = await queryOne(
    `SELECT c.id FROM conversations c
     JOIN projects p ON p.id = c.project_id
     WHERE c.id = :id AND p.owner_id = :userId`,
    { id: req.params.id, userId: req.user!.id },
  );
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await query(
    `SELECT id, role, content, meta_json, created_at FROM messages WHERE conversation_id = :id ORDER BY created_at ASC`,
    { id: req.params.id },
  );
  res.json({ messages });
});
