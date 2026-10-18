# Render Claim API vs Job-Targeted Dispatch — Disposition

**Status:** Resolved 2026-10-18 · branch `feat/job-targeted-render-claims-20261017` · verified against `main` @ `ed9664878`

## Question

Does `/api/rendering/claim` need a `jobId` parameter so a worker can claim one specific named job?

## Answer: No — the named-job path already exists and never touches the claim API

| Path | Trigger | Job targeting |
|---|---|---|
| **Immediate (production)** | `POST /api/generate-video` → `RenderQueueManager.enqueue()` → `GitHubActionsRenderManager.dispatchWorkflowRun(job)`; manual re-dispatch via `POST /api/rendering/github/dispatch` | GitHub `workflow_dispatch` carries the **exact `jobId` + `executionToken`** as inputs; the runner resolves only that job and fetches its manifest (`factoryos-basic-render.yml`, "Resolve Job Inputs" step) |
| **Fallback queue pump** | `factoryos-render-worker.yml` cron (1 min) or manual `workflow_dispatch` → `POST /api/rendering/claim` with `workerId`/`workerPool` only | Intentionally **generic**: claims the oldest eligible queued job in an atomic Firestore transaction |

The names of the two APIs match their actual roles:

- **dispatch** = "run this named job now" (identity travels in the dispatch payload).
- **claim** = "give me something to render" (identity is chosen by the queue, never by the worker).

Adding a targeted claim would be a second way to name a job on a route whose contract is pick-anything-eligible, with no caller in the tree that needs it.

## Dead artifacts removed in this change

1. `repository_dispatch: factoryos_render_job` triggers on both workflows — **no producer exists anywhere in the repository** (a full-repo search finds the two consumers and nothing else). A repo_dispatch, even if manually fired, would be fail-closed on the basic-render side (executionToken required) but provided no working code path.
2. `factoryos-render-worker.yml`: inline Python branch reading `DISPATCH_JOB_ID` — that env var is never set in the step, and the claim payload never carried a `jobId`. Removed.

## Invariants unaffected

- Claim auth (`RENDER_WORKER_SECRET` bearer), pool/tier eligibility, atomic Firestore transaction, and the no-substitute rule of the generic claim are untouched.
- `workflow_dispatch` on `factoryos-basic-render.yml` still fails closed on malformed `jobId` (`^[a-zA-Z0-9_-]{8,64}$`) or missing `executionToken`.
- No new endpoints, no new auth, no secret exposure.
