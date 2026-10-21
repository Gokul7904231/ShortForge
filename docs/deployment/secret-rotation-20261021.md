# Secret Rotation Runbook — 2026-10-21

Status: **rotation not performed and not verified by this document.** The literals below
are burned because they exist in public git history; treat them as compromised.

## Compromised material

| Material | Where it appears | Disposition |
|---|---|---|
| Personal access token (PAT) | exposed in repository history / issue reports (owner session) | treat as compromised; revoke |
| `RENDER_WORKER_SECRET` | was committed as a workflow fallback literal in `.github/workflows/factoryos-render-worker.yml` and `.github/workflows/factoryos-basic-render.yml` (public history) | rotate + remove fallback (fallback removal shipped in PR #247 / PR #249) |
| `FACTORYOS_EXECUTION_SECRET` | was committed as an HMAC fallback literal in `apps/web/lib/rendering/GitHubActionsRenderManager.ts` (public history; removed in PR #249) | rotate |
| `factoryos-render-worker-secret-key-2026` (the literal value of `RENDER_WORKER_SECRET`) | public git history via the workflow fallback | same secret as the `RENDER_WORKER_SECRET` entry above — covered by its rotation |

**Values are intentionally not reproduced here.** They are visible (burned) in public
history; this runbook only names them so no copy of them is added.

## Owner rotation steps (order matters)

1. **Revoke the exposed PAT first** — revoke at the token settings page of the account
   that owns it. Any automation using it breaks until re-configured; inventory the
   workflows/scripts that referenced it before revoking (`gh auth status` on machines
   that hold it).
2. **Generate a new `RENDER_WORKER_SECRET`** (≥ 32 random bytes, no dictionary value).
3. **Generate a new `FACTORYOS_EXECUTION_SECRET`** the same way.
4. **Update the deployment environment** that runs the control plane:
   - `FACTORYOS_EXECUTION_SECRET` (token signing/verification — read by
     `apps/web/lib/rendering/GitHubActionsRenderManager.ts`; absent ⇒ fail closed).
   - `GITHUB_RENDER_TOKEN` (dispatch credential — absent ⇒ `RENDER_DISPATCH_NOT_CONFIGURED`,
     never a simulated dispatch).
   - `FACTORYOS_CONTROL_PLANE_URL` (Send-to-worker target).
   Prefer a separate PAT with scoped `actions:write` for dispatch instead of a personal token.
5. **Update the GitHub Actions secret** `RENDER_WORKER_SECRET` in repository settings
   (`Settings → Secrets and variables → Actions`). Optional related non-secret:
   `FACTORYOS_CONTROL_PLANE_URL`.
6. **Rotate rather than reuse**: do not set the new secret equal to any old literal.
7. **Restart/redeploy** the control plane so the new env values are loaded; in-flight
   jobs signed with old tokens will fail verification (fail-closed by design).
8. **Verify** (no values printed):
   - `gh secret list` (or Settings → Secrets) shows `RENDER_WORKER_SECRET`, plus new PAT
     scope check `gh auth status` on the operator machine.
   - Control plane: config presence check at boot — mapping to environment-variable
     names only; absence must log `EXECUTION_SECRET_MISSING` / `RENDER_DISPATCH_NOT_CONFIGURED`.
   - Worker smoke: trigger one job; the worker claim must succeed with the new secret and
     a 401 must be returned for any worker presenting the old literal.
9. **History remediation**: values cannot be un-exposed by later commits. Options after
   rotation: (a) accept burned values since rotation removes their power, or (b) run a
   history rewrite tool with owner approval (force-push risk; requires coordinating all
   clones). (a) is the safe default.

## Code prerequisites (already merged into PR #247 / #249 branches)

- Workflow fallback literals removed (`RENDER_WORKER_SECRET: ${{ secrets.RENDER_WORKER_SECRET }}`).
- Token signing/verification fail closed when `FACTORYOS_EXECUTION_SECRET` is missing.
- Dispatch fails closed when `GITHUB_RENDER_TOKEN` is missing.
- Until PR #247 merges, a missing worker secret on the scheduled keepalive path degrades
  to a silent "no jobs claimed" response instead of a loud error — merge #247 to get the
  loud `::error::` guard.

## Verification status

| Item | Status |
|---|---|
| PAT revoked | NOT VERIFIED (owner action) |
| `RENDER_WORKER_SECRET` rotated in repo settings | NOT VERIFIED (owner action) |
| `FACTORYOS_EXECUTION_SECRET` rotated in deployment env | NOT VERIFIED (owner action) |
| Fallback literals removed from code | DONE on #247 and #249 branches (CI-verified on both) |
