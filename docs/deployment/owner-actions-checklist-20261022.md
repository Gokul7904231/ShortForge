# Owner Actions Checklist — Release Closure (2026-10-22)

This checklist lists every action only the repository owner can perform, verified against the
actual merge-protection responses on 2026-10-22. Nothing in this document touches production
secrets or settings.

## 1. Merge gates (verified blocked on 2026-10-22)

Attempting to merge PR #244 via the API returned:

- `At least 1 approving review is required by reviewers with write access.`
- `Required status check "OKF Governance Gate" is expected.`

Actions:
- [ ] **Fix the required-check name mismatch.** The workflow `okf-governance.yml` reports its
      check context as job name `OKF / lint-sweep-report`; branch protection requires a context
      literally named `OKF Governance Gate`, which no job ever produces. Every PR is therefore
      unmergeable until either (a) branch protection changes the required context to
      `OKF / lint-sweep-report`, or (b) a job named `OKF Governance Gate` is added to the
      workflow.
- [ ] **Provide the approving review.** The PR author cannot self-approve. Either add a second
      reviewer with write access, or use the repository bypass setting for administrators.
- Once both are satisfied, merge in order `#244 → #247 → #249 → #251` (merge commits, preserving
  ancestry used by the integration-tree evidence), then close `#248` and `#250` unmerged.

## 2. Credential rotation (runbook: `docs/deployment/secret-rotation-20261021.md`)

- [ ] Replace the exposed PAT.
- [ ] Rotate `RENDER_WORKER_SECRET` and `FACTORYOS_EXECUTION_SECRET` (literals were stripped from
      the repository by PR #249; the values must still be rotated because they were public).
- [ ] `LIGHTNING_USER_ID` / `LIGHTNING_API_KEY` secrets are absent — every Lightning run fails in
      the preflight `credentials()` step (deterministic exit 1, no artifacts). Add them to enable
      the Lightning lane.
- [ ] MongoDB / B2/CAS production credentials for the durable-storage path.

## 3. Supported durable storage

Better-sqlite3 stores now fail closed instead of silently using the in-memory mock. On runtimes
that can never load native addons (Cloudflare Workers), SQLite-backed stores (render queue,
checkpoints, authorization, journals) are unusable by design until migrated.

- [ ] Decide the production runtime: Node-based host with native SQLite, or Cloudflare with a
      migration of those stores to D1/Durable Objects. Until decided, physical renders must run
      on the Node runtime lane.

## 4. Live physical proof (after sections 1–3)

With the stacked `main` (post merge order above) deployed against real providers:

- [ ] Run one real render through physical MP4 verification.
- [ ] Verify durable storage / CAS artifact placement and integrity.
- [ ] Complete F07 acceptance on the artifact.
- [ ] Retrieve the artifact after a restart (persistence across process boundaries).

Only after all four pass may the release record move from `BLOCKED` to
`END_TO_END_ACCEPTED`.
