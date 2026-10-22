# Render Claim API vs Job-Targeted Dispatch — Disposition

**Status:** Resolved 2026-10-18 · integrated on the PR 247 branch `fix/render-worker-fail-closed-20261017` · evidence verified against `main` @ `ed9664878`

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

## Dead artifacts removed on this branch

1. `repository_dispatch: factoryos_render_job` triggers on both workflows — **no producer exists anywhere in the repository** (a full-repo search finds the two consumers and nothing else). A repo_dispatch, even if manually fired, would be fail-closed on the basic-render side (executionToken required) but provided no working code path. Note: no in-repository producer exists; external senders could not be verified from the evidence available in this environment and are therefore not claimed to be ruled out (the removed path was fail-closed regardless).
2. `factoryos-render-worker.yml`: the `DISPATCH_JOB_ID` payload wiring (wired to `github.event.client_payload.jobId` in the fail-closed change purely so a named-job payload would be refused with exit 3). Removed with its trigger; the refuse path stays in `github_dispatch_claim.py` as a defensive guard for direct invocations.

## Invariants unaffected

- Claim auth (`RENDER_WORKER_SECRET` bearer), pool/tier eligibility, atomic Firestore transaction, and the no-substitute rule of the generic claim are untouched.
- `workflow_dispatch` on `factoryos-basic-render.yml` still fails closed on malformed `jobId` (`^[a-zA-Z0-9_-]{8,64}$`) or missing `executionToken`.
- All PR 247 fail-closed guarantees are preserved verbatim: no committed secret default, missing credentials fail before network access, failed claim/dispatch/callback all fail visibly, execution token masked, worker lease/fencing and attempt monotonicity intact, RenderFabric/F07 remain the authoritative completion gate.
- No new endpoints, no new auth, no secret exposure.
