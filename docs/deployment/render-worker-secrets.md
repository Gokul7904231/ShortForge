# Render Worker Secret — configuration and rotation

**Scope:** the `RENDER_WORKER_SECRET` shared credential between the GitHub Actions
render workflows and the ShortForge control plane.

**Owner action required:** this secret must be configured **and rotated** by the
authorized operator. Nothing in this repository supplies a default.

## 1. Where it is used

| Direction | Consumer | Contract |
|---|---|---|
| Workflow → control plane | `.github/workflows/factoryos-render-worker.yml` | `POST /api/rendering/claim`, `Authorization: Bearer $RENDER_WORKER_SECRET` |
| Workflow → control plane | `.github/workflows/factoryos-basic-render.yml` | `POST /api/rendering/callback`, `Authorization: Bearer $WORKER_SECRET` |

Server side: `apps/web/app/api/rendering/claim/route.ts` and
`apps/web/app/api/rendering/callback/route.ts`, which read
`process.env.RENDER_WORKER_SECRET || process.env.INTERNAL_API_SECRET_KEY`.
Both sides must hold the same value.

## 2. A previously committed value must be treated as compromised

These workflows previously fell back to a literal value committed to public
source history:

```
RENDER_WORKER_SECRET: ${{ secrets.RENDER_WORKER_SECRET || '<committed literal>' }}
```

Any value that has ever been committed to this repository is public and is
considered compromised. It must never be reused, printed, or copied into another
workflow. The fallback has been removed; do not reintroduce one.

## 3. Required configuration

| Name | Kind | Required | Notes |
|---|---|---|---|
| `RENDER_WORKER_SECRET` | repository **secret** | yes | Same value on the control plane. |
| `FACTORYOS_CONTROL_PLANE_URL` | repository secret or variable | recommended | Falls back to `https://factoryos.app`. |
| `GITHUB_TOKEN` | built-in | yes | See §6. |

No repository Variables or Secrets were modified by this change.

## 4. Rotation procedure

1. Generate a new value (for example `openssl rand -hex 32`).
2. Set it on the control plane as `RENDER_WORKER_SECRET`, and deploy/restart that
   service.
3. Set the **same** value as the repository secret `RENDER_WORKER_SECRET`
   (Settings → Secrets and variables → Actions).
4. Run the dispatcher once and confirm a claim succeeds.
5. Remove the old value from every environment that held it.

Because both sides compare the full value, steps 2 and 3 are a single cutover:
until both sides match, claims and callbacks fail with `401`.

## 5. Fail-closed behaviour (what a broken setup now looks like)

`secrets.X` expands to an empty string when unset, so "not configured" is
detectable. It is now an error, not a silent empty queue:

| Situation | Old behaviour | New behaviour |
|---|---|---|
| Secret not configured | Sent a committed literal; the `401` was swallowed | `::error::RENDER_WORKER_SECRET is not configured`, fails **before** any request |
| `401` / `500` from the claim API | Logged, then `claimed=false` → looked like an empty queue | `::error::Claim rejected with HTTP <code>`, job fails |
| Network timeout, DNS, TLS failure | Logged, then `claimed=false` | `::error::Claim request failed`, job fails |
| Malformed / unexpected response | Often `claimed=false` | `::error::`, job fails |
| Truly empty queue | `claimed=false` | `claimed=false` — still an ordinary no-work success |
| `gh workflow run` rejected | Swallowed by `\|\| echo "..."`, step went green | Step fails |
| Callback to the control plane rejected | `Callback notice: ...`, run went green | `::error::Callback failed`, run fails |

A lost completion callback is reconciled by
`RemoteRenderStateMachine.reconcileStaleJobs` (`RECOVERED_FROM_LOST_CALLBACK`),
so failing the run is safe: the job is not silently left `processing`.

## 6. Known limitation — downstream dispatch permissions

`gh workflow run` requires `actions: write` on the token. These workflows do
**not** declare a `permissions:` block on the dispatcher job, so the repository's
default workflow permission applies. If that default is read-only, the dispatch
step now fails loudly where it previously appeared to succeed. Granting
`actions: write` is a deliberate authority change and is **not** made here — it
requires an owner decision.

## 7. Backend change needed — job-targeted claims

`POST /api/rendering/claim` accepts only `workerId` and `workerPool`
(see the handler in `apps/web/app/api/rendering/claim/route.ts`). It cannot claim
a **named** job.

Consequence: the dispatcher's `repository_dispatch` (`factoryos_render_job`)
trigger cannot honour a `jobId` in its payload. Rather than silently claim an
unrelated queued job, a payload that names a job is now refused with exit code 3.

The supported immediate path is unchanged and does not go through the dispatcher:
the control plane calls
`GitHubActionsRenderManager.dispatchWorkflowRun()`, which is a
`workflow_dispatch` of `factoryos-basic-render.yml` carrying `jobId` and
`executionToken` directly.

If a named-job queue claim is wanted, it needs a control-plane change first —
for example `POST /api/rendering/claim` accepting an optional `jobId`, scoped to
the queue, returning the same lease/fencing fields and honouring the existing
attempt-monotonicity rules. Only then should the dispatcher attempt to claim it.
