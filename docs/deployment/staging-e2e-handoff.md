# Staging End-to-End Handoff — one real Basic render

Evidence-based handoff assembled from source (this document invents no fields and contains no credentials).
Prepared 2026-10-18 on branch `fix/render-worker-fail-closed-20261017` @ `97590898`.

## Endpoints (from source)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/generate-video` | POST | Clerk `__session` cookie (dashboard user session) | Creates the job; runs F00→F05; mints `executionToken` (`crypto.randomBytes(32).hex`, never a jobId fallback) and dispatches the named job by `workflow_dispatch` (`RenderQueueManager.enqueue()` → `GitHubActionsRenderManager.dispatchWorkflowRun()`); returns `{ jobId, ... }` |
| `/api/rendering/github/dispatch` | POST | internal | Manual re-dispatch of a **queued** Basic job: body `{ jobId, tenantId?, userId? }` → `dispatchWorkflowRun(job)` |
| `/api/rendering/claim` | POST | `Authorization: Bearer $RENDER_WORKER_SECRET` | Generic queue pump: body `{ workerId, workerPool }; cannot target a named job (by design) |
| `/api/rendering/callback` | POST | `Authorization: Bearer $RENDER_WORKER_SECRET` | Worker delivery callback; 422 on unverified artifact; idempotent |
| `/api/job-status/[jobId]` | GET | session cookie | Status/metrics surface for the job |

## Generate-video request schema (authoritative — `GenerateVideoRequestSchema` in `apps/web/app/api/generate-video/route.ts`)

`topic` (string) is the only required field. Optional: `style`, `script`, `scenes[]`, `contentType`, `hook`,
`questions[]` (quiz engines require a `hook` plus ≥1 question), `renderProfile`, `title`, `description`,
`hashtags[]`, `engineId`, `engineMode`, `difficulty`, `tone`, `voice`, `ratio`, `provider`,
`templateId`/`templateVersion`, `contentEngine`, `formatFamily`, `userInputs`, `platforms[]`, `durationSeconds`.

A minimal real request is a topic-only body.

## Repo prerequisites the operator must satisfy (unchanged by this PR)

1. Rotate and set `RENDER_WORKER_SECRET` on the control plane **and** in repository secrets (see
   `docs/deployment/render-worker-secrets.md` §4). The dispatcher now fails closed without it.
2. Owner decision: allow `actions: write` on the default `GITHUB_TOKEN` or supply a PAT with it —
   otherwise `gh workflow run` fails loudly by design.
3. `FACTORYOS_CONTROL_PLANE_URL` repository secret pointing at the staging deployment.

## Reproducible staging command (fill the three variables; nothing else needed)

```bash
BASE="https://<staging-app-origin>"     # e.g. ${APP_ORIGIN} from the deployment env
SESSION="<Clerk __session cookie captured from a signed-in dashboard tab>"
RUNNER_SECRET="<the rotated RENDER_WORKER_SECRET>"   # used only for the worker-side probes

# 1. Create one real job (topic-only minimal body; quiz engines need hook+questions)
curl -sS -X POST "$BASE/api/generate-video" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=$SESSION" \
  -d '{"topic":"The one feature that made Roman concrete last 2000 years"}'
# -> record jobId from the response

# 2. Poll until physical delivery or failure
JOB=<jobId>
curl -sS "$BASE/api/job-status/$JOB" -H "Cookie: __session=$SESSION"
```

The immediate named-job dispatch happens inside step 1. If the dashboard shows the job stuck in
`dispatching`, the explicit manual re-dispatch is:

```bash
curl -sS -X POST "$BASE/api/rendering/github/dispatch" \
  -H "Content-Type: application/json" -H "Cookie: __session=$SESSION" \
  -d "{\"jobId\":\"$JOB\"}"
```

## Independent acceptance checklist (one real job)

1. `POST /api/generate-video` returns HTTP 403/409 or a jobId (`^[a-zA-Z0-9_-]{8,64}$` format) — no 500s.
2. GitHub run of **FactoryOS Basic Cloud Rendering Pipeline** exists for that exact `jobId`
   (was 0 runs ever in the failure analysis; the dispatcher must now reach it).
3. Dispatcher claim path: if the cron dispatches, `factoryos-render-worker.yml` shows
   `claimed=true` + a `Claimed job <id>` annotation, or a loud failure — never a silent "success"
   over a failing claim.
4. The workflow job finishes with a verified MP4 (`Validate MP4 step` ran ffprobe).
5. `POST /api/rendering/callback` reaches the control plane with 200 (idempotent under retry).
6. `GET /api/job-status/<jobId>` shows COMPLETED with a delivered video URL (Cloudinary/Drive).
7. Quota decrements exactly once for the user (duplicate callbacks are idempotent).
8. Failure drill (optional but recommended): revoke the secret, run once — claim must fail
   **before any request** with `::error::RENDER_WORKER_SECRET is not configured`.

## Explicitly out of scope without owner authorization

- Publishing to YouTube or any social platform.
- Costly production/current-live jobs.
- Physical proof on Lightning (Antigravity's PR #244 lane; recent proof runs were cancelled or failed —
  nothing physical is claimed there).
