# AI Agent Platform

React + Express agent platform for Hostinger Shared Node.js hosting with MySQL, NVIDIA NIM (swappable LLM provider), MySQL-first RAG, tools, and human approval.

## Stack

- **Frontend:** React, Vite, Tailwind (`apps/web`)
- **Backend:** Node.js, Express, TypeScript (`apps/api`)
- **Shared types:** Zod contracts (`packages/shared`)
- **DB:** MySQL
- **AI:** NVIDIA NIM via `LLMProvider` / `EmbeddingProvider` interfaces (`LLM_PROVIDER=nvidia|mock`)
- **Realtime:** SSE (`GET /agent/runs/:id/stream`)

## Quick start

```bash
pnpm install
cp .env.example .env
# set DATABASE_URL, JWT secrets, CRON_SECRET; optional NIM_API_KEY
pnpm db:migrate
pnpm dev:api    # http://localhost:3000
pnpm dev:web    # http://localhost:5173
```

Without `NIM_API_KEY`, the API uses the **mock** LLM/embedding providers so local development still works.

## Monorepo layout

```
apps/api          Agent Core + REST/SSE API
apps/web          Dashboard
packages/shared   Shared Zod schemas / types
packages/config   Shared TS config
```

## Agent Core

```
Orchestrator → Planner → Router → Tools / RAG / Memory
                 ↑
         LLM Provider (NVIDIA NIM | mock | future)
```

Write/destructive tools create an `approvals` row and pause the run until decided in the UI.

## Knowledge pipeline

1. Upload document → `documents` + `knowledge_jobs`
2. Cron hits `POST /internal/cron/knowledge` with `x-cron-secret`
3. Chunk → embed → store in `document_chunks`

## Tests

```bash
pnpm test
```

## Deploy (Hostinger)

See [docs/hostinger-deploy.md](docs/hostinger-deploy.md).
