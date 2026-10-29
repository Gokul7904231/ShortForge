# Agent 2 — Distributed Rendering, Durability, CAS/F07 and Drive

Use an isolated branch/worktree. Own server/worker distributed path; do not edit keepalive workflow, Dockerfile, product UI or Agent 1 plan/report without coordination. No main push.

## Skill prerequisites
Verify Spec Kit and Anti-Slop core load in the actual agent session before editing. For existing defects use bug-assess→bug-fix→bug-test; add antislop-code only when relevant. Record version/path/load evidence.

## Trace current code
- API: `apps/web/app/api/generate-video/route.ts`.
- Dispatch: `apps/web/lib/rendering/GitHubActionsRenderManager.ts`, RenderQueueManager, deployed `GITHUB_RENDER_REPOSITORY`/workflow/ref.
- Worker: `.github/workflows/factoryos-basic-render.yml`, `.github/workflows/factoryos-render-worker.yml`, `services/rendering-engine/scripts/github_dispatch_claim.py`, `services/rendering-engine/scripts/create_short.py`.
- Callback/artifact: `apps/web/app/api/rendering/callback/route.ts`, `RemoteRenderStateMachine`, `ArtifactResolver`, CAS, physical F07.
- Delivery: real Google Drive provider upload and Drive `getMetadata`/download verification.

## Known traps
- Current source defaults `GITHUB_RENDER_REPOSITORY` to `FactoryOS/factoryos-basic-renderer`, workflow to `factoryos-basic-render.yml`, ref to `main`. Verify actual deployed env/repo; do not guess.
- Workflow step named `Upload Artifact to Persistent Storage` is echo-only. Verify actual engine upload and callback.
- Completion callback resolves real bytes and audits media/F07 before completing; preserve these gates.
- `LOCAL_OUTBOX` is not Google Drive delivery.

## One controlled staging job
1. Verify secret presence/consistency by name only: `GITHUB_RENDER_TOKEN`, `FACTORYOS_EXECUTION_SECRET`, `RENDER_WORKER_SECRET`, `FACTORYOS_CONTROL_PLANE_URL`, repository/workflow/ref plus persistence/provider settings. Never print values. Rotate compromised credentials only through authorized secret manager and confirm old PAT revoked.
2. Use authenticated staging UI/session locally to submit one inexpensive topic; never paste cookies/bearer tokens into chat/issues/logs. Record job ID and run URL only.
3. Confirm exact job ID and execution token reach intended `workflow_dispatch`; record actionable failure if not.
4. Verify real MP4 with ffprobe/decode; compute SHA-256 and exact length independently.
5. Capture real callback response; verify bad/stale token rejection and duplicate behavior.
6. Confirm CAS ref resolves to physical bytes; digest/length match; capture F07 receipt for same digest.
7. Upload to authorized Drive folder and verify file ID, MIME type, length and integrity by metadata/download.
8. Verify status/artifact survive backend restart. In-memory state alone is not durability. If Render uses local disk, confirm persistent disk mount/path.

## Focused checks
`npm run typecheck`, `npm run factoryos:typecheck`, tests `real-e2e-mission-run.test.ts`, `real-artifact-pipeline.test.ts`, `http-callback-authoritative-gate.test.ts`, `e2e-factoryos-production-execution.test.ts`, `github-actions-rendering.test.ts`, `render-dispatch-fail-closed-security.test.ts`, SQLite restart tests. Run live Drive suite only when actual credentials are present. Run focused Python tests and `py_compile` for worker edits.

## Return
PR and Team report with job ID, run URL/timestamp, MP4 probe, measured SHA/length, callback result, CAS ref, F07 receipt, Drive ID/metadata and restart result. Mark owner-credential blockers explicitly.
