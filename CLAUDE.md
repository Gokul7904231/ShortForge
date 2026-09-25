# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShortForge (rebrand of FactoryOS — infra names `factoryos` preserved) — AI Short-form video factory. Enterprise microservice suite: **Control Plane** orchestrates, **Execution Plane** renders, **Pipeline Floors** slice the DAG. Services communicate only over HTTPS + bearer-token auth (`INTERNAL_API_SECRET_KEY` + per-job `executionToken`).

- **Control Plane** (`apps/web/`) — Next.js 16 dashboard / orchestrator (109 API routes, Clerk + Firebase `__session` HMAC)
- **Execution Plane** (`services/rendering-engine/`) — FastAPI workers (warm Basic pool `:8100` + fallback `:8080`, Pillow/FFmpeg/edge-tts/whisper → Cloudinary)
- **Pipeline Stages** (`services/pipeline/floor01_*` … `floor06_*` + `guardian/`) — domain slices of the assembly line (hexagonal `app/`)
- **Compliance Gate** (`archive/floor07_compliance_2026-08-23/`) — FastAPI quality gate — **archived, not in live path**

Live path: `apps/web POST /api/generate-video` (Zod + atomic quota + scriptAgent) → `saveJobManifest + FactoryOS mission` → F00-F05 → canonical F06 RenderFabric → ComputeRouter/provider execution → physical artifact + CAS → F07 verification → delivery → `GET /api/job-status/[id]` poll + SSE. See [`docs/architecture/current.md`](docs/architecture/current.md) and [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md).

## Repository Structure

```
aishorts/   (monorepo — git ls-files is source of truth; gen-v/ and floors/ on disk are legacy, gitignored)
├── apps/web/                         # Control Plane — root for npm (node >=20, npm >=10)
│   ├── app/                          # App Router
│   │   ├── (os)/                     # Authenticated OS shell (dashboard, factory, media, overseer)
│   │   └── api/                      # 109 route handlers (see docs/ARCHITECTURE.md §13)
│   ├── components/                   # QuickGenerateOverlay (4-step wizard), Sidebar, TopNav, landing/*
│   ├── lib/
│   │   ├── auth/                     # Firebase + Clerk, HMAC __session, roles, audit
│   │   ├── quota/quota-service.ts    # Atomic 5-lifetime (Basic) / 8-per-month (Pro)
│   │   ├── core/                     # RouteRegistry · EngineRegistry · ServiceRegistry · SQLiteRenderQueue · CheckpointDB · etc
│   │   ├── visual-assets/ · voice/   # Scene/voice pipelines
│   │   ├── ai-provider/              # Legacy ProviderRouter + model-discovery (dual with ai/)
│   │   └── shortforge-skills/        # ShortForge-native Skill Engine — docs-only (5 SKILL.md)
│   ├── ai/                           # AI Router — capability-registry · ai-config-manager · intelligent-router · runtime
│   │   └── providers/                # gemini, groq, openrouter, nvidia, local-ai-manager, pollinations, …
│   ├── agents/                       # Legacy LLM agents — script-agent, scene-agent, hook-score-agent, …
│   ├── factoryos/                    # FactoryOS kernel — contracts, cognitive, guardian, missions, leases, checkpoint
│   │   └── tests/                    # Vitest — node env (also tests/**, shortforge/tests/**)
│   ├── content-engines/              # Declarative engines — quiz, facts, story, … (_runtime/workflow-runtime.ts)
│   ├── rag/ · publishing/ · storage/ · prompts/ · config/
│   ├── middleware.ts                 # Clerk auth gate — fail-closed, PUBLIC_PREFIXES allowlist
│   ├── next.config.mjs               # reactCompiler, Turbopack, serverExternalPackages, outputFileTracingExcludes (CF worker)
│   ├── vitest.config.ts              # include: factoryos/tests/** + tests/** + shortforge/tests/**
│   └── open-next.config.ts  wrangler.toml  tsconfig.factoryos.json (strict only here)
├── services/
│   ├── rendering-engine/             # FastAPI workers — Python 3.11+, FFmpeg on PATH
│   │   ├── main.py                   # :8080 — /render-video, /job-status/{id}, /logs/stream (SSE deque 500)
│   │   ├── basic_render_api.py       # :8100 — warm pool POST /api/render/jobs
│   │   ├── basic_render_worker.py    # Async worker — isolated workspaces, ffprobe, Cloudinary, callback
│   │   ├── scripts/create_short.py   # Pillow 1080×1920 · 30fps · edge-tts · faster-whisper · FFmpeg
│   │   └── output/jobs/              # Job manifests (JSON per jobId)
│   └── pipeline/                     # Domain slices
│       ├── floor01_strategy/  floor02_scripting/  floor03_asset_realization/
│       ├── floor04_media_synthesis/  floor05_timeline_composition/  floor06_rendering/
│       └── guardian/                 # Watchdog, Decision Ledger, CircuitBreaker
├── docs/                             # Canonical Documentation Authority (docs/README.md)
│   ├── architecture/                 # current.md · system-overview.md · authentication.md
│   ├── factoryos/                    # agent-contracts.md · event-contracts.md · hierarchy.md
│   ├── compute/                      # basic-cloud-rendering.md
│   ├── intelligence/                 # byolm.md
│   ├── security/                     # threat-model.md · strix-security-workflow.md
│   ├── deployment/                   # auth-migration.md · local-ai-setup.md
│   ├── verification/                 # requirements/traceability-matrix.md · f07/ · reports/
│   ├── akb/                          # Architecture Knowledge Base (EA-001, RA-007, …)
│   └── archive/                      # Historical reports and superseded drafts
├── archive/floor07_compliance_2026-08-23/ # Archived Compliance Gate — Poetry, Hexagonal (docker-compose: api+postgres+redis)
├── .github/workflows/                # ci.yml · factoryos-render-worker.yml (cron * * * * *) · factoryos-basic-render.yml
├── firebase.json  vercel.json  commitlint.config.js  LICENSE (MIT)
└── docs/ARCHITECTURE.md              # Full system design — 109 routes, data layer, skill system, security, deployment
```

## Commands

### Control Plane (`apps/web/`) — Node 20+, npm 10+
```bash
cd apps/web
npm install
npm run dev          # Next.js dev on http://localhost:3000 (Turbopack)
npm run build        # next build (109 routes)
npm start            # next start
npm run lint         # eslint (next/core-web-vitals)
npm run factoryos:test              # vitest run --config vitest.config.ts (factoryos + tests + shortforge)
npm run factoryos:typecheck         # tsc --project tsconfig.factoryos.json --noEmit (strict)
npm run factoryos:eval:rag          # vitest run factoryos/tests/rag-eval.test.ts
npm run factoryos:eval:quiz         # vitest run factoryos/tests/quiz-eval.test.ts
npx vite-node factoryos/demo.ts              # FactoryOS demo
npx vite-node factoryos/demo-production.ts   # production demo
npx vitest run factoryos/tests/<name>.test.ts --config vitest.config.ts  # single file
npm run preview     # opennextjs-cloudflare build && preview
npm run audit       # node scripts/check-cloudflare-free.mjs
npm run deploy      # next build && opennextjs-cloudflare build && audit && wrangler deploy
```
Webpack ignores `venv/`, `data/`, `generated/`, `*.db` for watcher. `better-sqlite3` / `sqlite3` / `@xenova/transformers` / `sharp` are server-only externals (excluded from CF Worker via `outputFileTracingExcludes`).

### Rendering Engine (`services/rendering-engine/`) — Python 3.11+, FFmpeg on PATH
```bash
cd services/rendering-engine
python -m venv venv; source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8080
python -m uvicorn basic_render_api:app --port 8100        # warm Basic pool
python start_worker.py                                      # alt entry (loads apps/web/.env)
curl http://localhost:8080/health; curl http://localhost:8100/ready
curl http://localhost:8080/job-status/<jobId>; curl http://localhost:8080/logs/stream  # SSE
```

### Pipeline Stages (`services/pipeline/*`) — Python 3.11+
Each floor: `app/` hexagonal + `tests/` + `README.md` + `main.py`. See `services/pipeline/<floor>/README.md` and `docs/akb/`.

### Archived Gate (`archive/floor07_compliance_2026-08-23/`) — Python 3.12, Poetry, Docker — ARCHIVED
```bash
cd archive/floor07_compliance_2026-08-23
cp .env.example .env; docker compose up --build -d   # api + postgres:16 + redis:7
poetry run alembic upgrade head; poetry run uvicorn main:app --reload --port 8000
make test && make lint && make format && make typecheck   # ruff + black + mypy strict
```

## Architecture — Live System (Summary)

**Control Plane** — Next.js 16 / React 19 / Tailwind v4 / Zustand 5 / TanStack Query 5. Auth: Clerk `@clerk/nextjs` + Firebase `__session` HMAC (`middleware.ts` fail-closed). Data: `firebase-admin` + `firebase` (Firestore `quotas/videos`), `mongodb` 7.5 (`factoryos` db, InMemory fallback), `better-sqlite3` 12 (`data/shortfactory.db` WAL) via `SQLiteRenderQueue`, `cloudinary` CDN. AI: dual routers — `ai/` (`IntelligentRouter`/`AIRuntime` with `capability-registry`, scored `quality/latency/cost/availability` + health `errorRate>0.85` skip, `AIProfile`) + legacy `lib/ai-provider` (`ProviderRouter`, `model-discovery`), bridging via `factory_with_fallback`. Skills: 9 FactoryOS domain skills (`factoryos/skills/`) + 5 docs-only ShortForge-native skills (`lib/shortforge-skills/`). Vitest scoped to `factoryos/tests/**` + `tests/**` + `shortforge/tests/**` (node, 60s).

**Rendering** — The canonical path is `F06 RenderFabric → ComputeRouter → qualified provider → physical artifact → CAS/F07`. The provider-neutral self-hosted worker surface may expose `basic_render_api.py :8100` + `basic_render_worker.py` behind the persistent-worker adapter (isolated workspaces, execution-token authentication).

**Pipeline** — `floor01_strategy` → `floor02_scripting` → `floor03_asset_realization` → `floor04_media_synthesis` → `floor05_timeline_composition` → `floor06_rendering` + `guardian` (watchdog, Decision Ledger, CircuitBreaker). Bridged via `factoryos/core/bridge/PythonFloorBridge.ts`. Full design → `docs/ARCHITECTURE.md`.

**Security invariants:** `jobId ^[a-zA-Z0-9_-]{8,64}$` at boundary + worker `realpath` prefix check; `executionToken = crypto.randomBytes(32).hex()` never `jobId`, `timingSafeEqual` on `claim`/`callback`; tier/capability-isolated provider dispatch is enforced by ComputePolicy and worker capability contracts; `Host`-derived SSRF via canonical `APP_ORIGIN||CONTROL_PLANE_URL`; GH Actions SHA-pinned + `INPUT_*` indirection.

## Environment

Each service has its own `.env` (gitignored; see `*.example`):

- `apps/web/.env` — `GEMINI_API_KEY` · `GROQ_API_KEY` · `OPENROUTER_API_KEY` · `DEFAULT_LLM_PROVIDER` · `TOGETHER_API_KEY` · `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` · `FIREBASE_*` · `CLOUDINARY_*` · `INTERNAL_API_SECRET_KEY` · `RENDER_WORKER_URL` · `MONGODB_URI` · `RENDER_WORKER_SECRET` · `GITHUB_PAT`/`GITHUB_REPO` · `BASIC_GENERATION_LIMIT` · `APP_ORIGIN`/`CONTROL_PLANE_URL` · `CRON_SECRET` · `AI_EXECUTION_TIMEOUT_MS`
- `services/rendering-engine/.env` (or `apps/web/.env` via `start_worker.py`) — `CLOUDINARY_*` · `INTERNAL_API_SECRET_KEY` · `RENDER_WORKER_SECRET` · `MAX_CONCURRENT_JOBS` · `CONTROL_PLANE_URL` · `RENDER_WORKER_SECRET`
- `archive/floor07_compliance_2026-08-23/.env` — archived, not required to run.

Host requirement: system `ffmpeg` on PATH.

## Git & CI

- Main: `main`. Remotes: `shortforge https://github.com/Gokul7904231/ShortForge.git` (canonical), `origin https://github.com/Gokul7904231/AI-Shorts-Maker` (redirect). Branch `chore/rename-shortforge` (FactoryOS→ShortForge rebrand, infra preserved).
- Commitlint: `commitlint.config.js` — only `refactor:` | `feature:` | `bug:` (lower-case, `header-max-length 100`, husky `commit-msg`).
- Workflows: `ci.yml` (Build & TypeCheck at `apps/web` — `tsc --noEmit` + `next build`), `factoryos-render-worker.yml` (cron `* * * * *` dispatcher), `factoryos-basic-render.yml` (per-job `create_short.py`).

Full authoritative design → `docs/ARCHITECTURE.md` (698 lines — data layer, skill system, 109 routes, deployment, archived components, roadmap).


## CRITICAL: ShortForge Architecture Decision Protocol

Before any non-trivial architecture, engineering, research-assimilation, worker, permission, rendering, model, security, workflow, or Devourer decision:

1. Read the entire current `.okf` tree end to end.
2. Extract the relevant existing rules, implementation facts, target states, contradictions, audits, and repository mappings.
3. Read `.okf/decision-protocol.md` and classify the proposal as `already exists`, `extends existing rule`, `contradicts existing rule`, `new capability`, or `experiment only`.
4. Inspect the relevant executable implementation and tests after the `.okf` sweep.
5. Consult `production-helper/` for applicable evidence and run the relevant checks for security, worker permissions, rendering, callbacks, providers, or release behavior.
6. Record architectural decisions in `.okf/decisions.md` or the appropriate canonical `.okf` document.

The `.okf` corpus is the first architectural reasoning context. It does not outrank executable implementation or tests when a conflict exists.

Mandatory references:
- `.okf/decision-protocol.md`
- `.okf/hierarchy-map.md`
- `.okf/security/worker-permissions.md`
- `.okf/engineering-stack.md`
- `.okf/production-helper.md`
- `.okf/devourer.md`

Do not introduce a new abstraction, repository pattern, worker capability, renderer, or model behavior merely because it is novel or useful in isolation. Reconcile it against the current `.okf` and existing repo mappings first.
