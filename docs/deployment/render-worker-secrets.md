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

## 7. Named-job dispatch — built-in, no backend change needed

`POST /api/rendering/claim` accepts only `workerId` and `workerPool`
(see the handler in `apps/web/app/api/rendering/claim/route.ts`). It cannot claim
a **named** job — and it does not need to.

The **named-job path already exists** and never touches the claim API: the
control plane calls `GitHubActionsRenderManager.dispatchWorkflowRun()`, a
`workflow_dispatch` of `factoryos-basic-render.yml` carrying `jobId` and
`executionToken` as workflow inputs. The runner resolves only that job and fails
closed on a malformed `jobId` or missing token. Dispatch and claim therefore have
separate, matching roles — dispatch runs a named job; claim pumps the queue.

The dispatcher's `repository_dispatch` (`factoryos_render_job`) trigger was
**removed** after a producer audit found no emitter of that event anywhere in
the repository (external senders are not ruled out from the evidence available
here). Removing it removes ambiguity rather than capability: a repo_dispatch
could never honour a payload that names a job — `POST /api/rendering/claim`
accepts only `workerId`/`workerPool` — so a named-job payload was refused with
exit code 3 rather than silently satisfied by an unrelated queued job. The
refuse path remains in `github_dispatch_claim.py` as a defensive guard.

Scope note: this reconciliation does **not** introduce a new named-job claim
endpoint, new auth, or new GitHub permissions.
