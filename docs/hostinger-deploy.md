# Hostinger Shared Node.js deployment

## Prerequisites

- Hostinger plan with **Node.js** app support
- MySQL database created in hPanel
- Domain / subdomain pointed at the Node app

## Hostinger Node.js (Git deploy)

**Build settings that work on Shared hosting:**

| Field | Value |
|--------|--------|
| Framework | Other |
| Branch | `main` |
| Node | `20.x` |
| Root | `./` |
| Package manager | **npm** (not pnpm — Hostinger corepack breaks) |
| Build command | `npm run build` |
| Output directory | `apps/web/dist` |
| Entry file | `apps/api/hostinger-entry.cjs` |

Set `SERVE_WEB=true` so Express serves the React build.

## 2. Upload

Upload the monorepo (or a release bundle) so Hostinger can run:

```text
node apps/api/dist/server.js
```

Ensure `node_modules` are installed on the server (`pnpm install --prod` from repo root after uploading `pnpm-lock.yaml`), or deploy a prebundled single-folder build.

For Shared Hosting convenience, set:

```bash
SERVE_WEB=true
CORS_ORIGIN=https://your-domain.com
APP_URL=https://your-domain.com
```

With `SERVE_WEB=true`, Express serves `apps/web/dist` and SPA fallback.

## 3. Environment variables (hPanel)

Copy from `.env.example`:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `mysql://USER:PASS@HOST:3306/DB` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | long random strings |
| `NIM_API_KEY` | NVIDIA NIM key (optional → mock) |
| `NIM_BASE_URL` / `NIM_CHAT_MODEL` / `NIM_EMBED_MODEL` | NIM endpoints |
| `LLM_PROVIDER` | `nvidia` or `mock` |
| `CRON_SECRET` | shared secret for cron HTTP calls |
| `FILE_SANDBOX_ROOT` | writable path for file tools |
| `GITHUB_TOKEN` | optional |
| `PORT` | Hostinger-assigned port if required |

## 4. Migrate database

From the app directory (with env loaded):

```bash
pnpm db:migrate
```

Or run `apps/api/src/db/migrations/001_init.sql` once via phpMyAdmin / MySQL client, then still run the migrator to record `_migrations`.

## 5. Cron (knowledge pipeline)

In hPanel Cronjobs (every 5 minutes):

```bash
curl -s -X POST -H "x-cron-secret: YOUR_CRON_SECRET" https://your-domain.com/internal/cron/knowledge
```

## 6. Health check

```bash
curl https://your-domain.com/health
```

## 7. SSE notes

- Stream URL: `GET /agent/runs/:id/stream`
- Response sends `X-Accel-Buffering: no` and heartbeat comments every 15s
- If the proxy buffers SSE, chat tokens may arrive in bursts; heartbeats keep the connection alive

## 8. Security checklist

- Never put `NIM_API_KEY` / `GITHUB_TOKEN` in the frontend
- Rotate `JWT_*` and `CRON_SECRET` independently
- Keep `FILE_SANDBOX_ROOT` outside web-public directories
- No shell execution tools on shared hosting (by design)
