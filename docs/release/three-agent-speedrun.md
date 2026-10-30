# ShortForge Production Speedrun — Three-Agent SDLC Plan

Status: PLAN / not acceptance evidence. Existing Render deployment is retained; no platform migration in this release wave.

## Release objective
Make the currently hosted application production-ready with the smallest controlled release slice, then generate one real short video through the distributed system and upload it to the intended Google Drive destination with verifiable server-side metadata. 'Distributed' means deployed control plane, worker dispatch, physical renderer, persistent storage/CAS, callback, CAS/F07 and Drive—not a local simulated pipeline.

## Parallel lanes
### Agent 1 — Release captain / Spec Kit / governance
- Verify both requested skills load in this agent and coordinate installation verification for Agents 2 and 3.
- Read `.okf/decision-protocol.md`, `.okf/index.md`, `.okf/principles.md`, `.okf/decisions.md`, `Team/workflow/change-gate.md`; they remain controlling policy.
- Inspect existing `.specify/` artifacts. Adopt Spec Kit existing-project workflow without overwriting state. Use Spec Kit bug-fixing for known defects and full SDD for new features.
- Build acceptance criteria and requirements→evidence matrix; inspect PR #253 and exact CI/Lightning failure logs; verify current Render deployed commit/runtime/readiness and rollback target without exposing secret values.
- Own integration order, release record, Team report and final release verdict. Do not merge until mandatory checks, review and live gates pass.

### Agent 2 — Distributed render / persistence / CAS / F07 / Drive
- Trace `generate-video` → RenderQueueManager/GitHubActionsRenderManager → configured `GITHUB_RENDER_REPOSITORY`/workflow/ref → worker manifest fetch → real renderer → callback → `RemoteRenderStateMachine` → `ArtifactResolver`/CAS → physical F07 → status → Google Drive.
- Verify presence/consistency of credential names only: `GITHUB_RENDER_REPOSITORY`, `GITHUB_RENDER_WORKFLOW`, `GITHUB_RENDER_REF`, `GITHUB_RENDER_TOKEN`, `FACTORYOS_EXECUTION_SECRET`, `FACTORYOS_CONTROL_PLANE_URL`, `RENDER_WORKER_SECRET`, persistence settings and provider credentials. Never print values. Rotate exposed credentials through an authorized secret manager.
- Current source defaults `GITHUB_RENDER_REPOSITORY` to `FactoryOS/factoryos-basic-renderer`; confirm intentional and accessible, or configure the ShortForge workflow in a reviewed change. Do not guess.
- The `Upload Artifact to Persistent Storage` step in `factoryos-basic-render.yml` is echo-only; verify actual storage upload/callback instead of trusting its label.
- Run exactly one low-cost authenticated staging render. Verify exact job ID→workflow run, physical MP4/ffprobe/decode, independent SHA-256/length, callback, CAS bytes/hash/length, F07 receipt, durable status, authorized Drive upload and server metadata/download verification, then retrieval after restart.
- Preserve fail-closed auth, token expiry, idempotency, quota settlement, stale fencing, F07 and CAS integrity. No cron drain, social/YouTube publication or costly cloud run.

### Agent 3 — Product / UX / QA / acceptance
- Trace login→generate→queue/progress→preview/download→Drive delivery and refresh/recovery; fix only launch-critical UX, no unrelated redesign.
- Build smoke matrix: unauthenticated, invalid payload, valid staging job, dispatch disabled, worker failure, invalid token, duplicate callback, missing/corrupt/hash-mismatched artifact, F07 rejection, Drive unavailable, real Drive success, refresh/recovery, and accessibility/mobile checks for touched UI.
- Ensure no fabricated progress/health/file/upload status. `LOCAL_OUTBOX` must never be presented as Google Drive delivery. Health must distinguish HTTP reachability from readiness.
- Run focused tests and label PASS/FAIL/SKIPPED/BLOCKED distinctly. Add Anti-Slop UI/Human/LayoutMobile if UI work is needed.
- Deliver product acceptance report, safe screenshots/repro, accessibility findings and top three residual blockers.

## Mandatory skill contract
- Install/verify GitHub Spec Kit (`https://github.com/github/spec-kit`) and Anti-Slop (`https://github.com/miqdadbadjuber/anti-slop`) in the actual local environment for all three coding agents before editing. Repository pointers alone are not installation.
- Spec Kit: use supported existing-project adoption. Constitution once, then production feature specify→clarify→plan→checklist→tasks→analyze→implement→converge. For existing defects use bug-assess→bug-fix→bug-test. Exact invocation syntax depends on agent.
- Anti-Slop: core skill for all three agents. During-mode for new work; mandatory Delivery Gate before ship. Add code/UI/human/layout/copywriting subskills only when relevant. Record agent, version, skill path and evidence it actually loaded.
- These tools supplement; they do not override `.okf`, Team change gate, F07, Guardian/Slayer/Healer, leases/fencing, Treasury, CAS or release authority.

## Looping Skill — report, review, next instruction

Use `.agents/skills/looping-skill/SKILL.md` as the canonical method for repeated agent work. The packet folder `docs/release/agent-packets/` must contain exactly six files: one coordinator-owned instruction and one agent-owned response for each of Agents 1, 2 and 3.

- The owner manually activates each separate coding-agent chat. Markdown does not auto-launch another session.
- At activation, an agent reads its latest instruction and immediately overwrites its own response file with `IN_PROGRESS`.
- At completion or blocker, it overwrites that response file with its full current evidence-backed report, pushes the response-file-only commit to this coordination branch, verifies the remote file, and tells the owner the report is uploaded.
- The owner returns to the coordinating ChatGPT conversation. The coordinator reads the latest response and independently checks the real branch, PR, changed files, exact HEAD SHA and workflow results.
- The coordinator then updates only the relevant instruction file's **Current Iteration — Coordinator Handoff** section with the next bounded iteration, evidence criteria and stop conditions. The owner manually reactivates that agent. Agents must never modify their own instruction files or put next-step instructions in response reports.
- If credentials or permissions are needed, the agent reports names, purpose, official acquisition path, configuration destination, minimum scope and safe validation only. No secret values may enter chat, GitHub, reports or logs. The coordinator verifies the request and gives a setup checklist; the owner configures the secret privately and explicitly confirms before credential-dependent work resumes.

This handoff protocol improves coordination; it does not count as implementation evidence or production acceptance.

## Integration / release order
1. Verify skill loads in each agent; Agent 1 publishes acceptance spec/evidence matrix.
2. Agents 2 and 3 work in isolated branches/worktrees; coordinate by PR/report IDs.
3. Fix confirmed critical-path defects. Keep Botkeep, Reverse Features, AER training, new providers and broad refactors outside this release.
4. Review PRs, run mandatory CI, focused critical-path tests, available security checks and Spec Kit/Anti-Slop gates. Do not weaken tests or convert UNPROVEN to PASS.
5. Deploy to existing staging/preview on Render; run one explicit staged job while the scheduled sweeper stays disabled.
6. Prove physical MP4→hash/length→persistent CAS→F07→Drive server metadata→restart retrieval.
7. Merge eligible changes in dependency order; deploy the exact reviewed SHA; run post-deploy health smoke and rollback check.
8. Upload/verify the final short in Drive, publish evidence report and owner-facing release verdict.

## Acceptance criteria — all required
- [ ] All three agents load both skill families and installation evidence is recorded.
- [ ] Render service/deployed SHA/runtime/readiness/logs/rollback target recorded.
- [ ] Required secret names/presence/consistency checked without exposing values; compromised credentials rotated and old PAT revoked.
- [ ] Mandatory CI and focused critical-path tests pass on exact merged SHA; failures fixed, not masked.
- [ ] Authenticated staging API returns a real job ID.
- [ ] Exact job runs on intended remote worker workflow and a real renderer.
- [ ] Real MP4 passes ffprobe/decode; independently measured SHA-256 and length captured.
- [ ] Invalid/stale callback/auth rejected; duplicate behavior verified; real completion callback accepted.
- [ ] CAS resolves to physical bytes and hash/length match; F07 passes for same artifact.
- [ ] Authorized Drive upload verified by server metadata/download; file identity/MIME/size/integrity recorded.
- [ ] Job and artifact remain retrievable across browser refresh and backend restart.
- [ ] Spec Kit converge/bug-test, Anti-Slop Delivery Gate and Team report captured.
- [ ] Release/deployed SHA, run links, F07 receipt, Drive file ID, smoke results and rollback plan recorded.

## Stop conditions
Block release if any render proof is missing, critical-path test fails, dispatch target is ambiguous, secret rotation/config is incomplete, durable persistence is unproven, callback can fake success, F07 fails, Drive metadata verification is absent, status is lost on restart, or required review/checks are missing.

## Safety / scope
Keep `RENDER_WORKER_SCHEDULER_ENABLED` disabled until controlled acceptance passes. Do not trigger a bulk queue sweep, paid compute, YouTube/social publishing or production user jobs without owner-approved scope. A plan is not deployment or test evidence.
