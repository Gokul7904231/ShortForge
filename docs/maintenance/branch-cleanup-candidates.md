# Branch Cleanup Candidates — 2026-11-02

Remote deletion is **not authorized** and nothing remote was changed. This file is
the approval package.

## 1. Local branches removed in this phase (safe `git branch -d`)

All 16 were verified: ancestor of `main`, 0 commits ahead, not checked out in any
worktree. `git branch -d` would have refused otherwise.

| Branch | Tip SHA |
|---|---|
| `baseline-e9664878` | `ed966487` |
| `chore/bottle-apps-services` | `d0506ab05` |
| `chore/rename-shortforge` | `0f12efbc1` |
| `chore/repository-architecture-cleanup` | `a14d1ab38` |
| `feat/ascalon-training-readiness` | `1d9bb737c` |
| `feat/f06-unified-render-fabric` | `c4c69e3bd` |
| `feat/kaggle-live-integration` | `0f12efbc1` |
| `feat/three-format-short-qualification-20261031` | `cf4cc2c9` |
| `fix-wt247` | `3b263822` |
| `fix/e2e-safety-patch-20261021` | `1d0a989e` |
| `fix/f07-policy-refresh-20261016` | `78e7172b` |
| `fix/render-worker-fail-closed-20261017` | `575ba848` |
| `fix/render-worker-fail-closed-20261017-wt` | `575ba848` |
| `fix/safe-sqlite-fail-closed-20261021` | `2a945308` |
| `fix/scheduler-bringup-gate-20261023` | `70bcfb07` |
| `proof/e2e-local-render-20261023` | `cf4cc2c9` |

Recovery: `git branch <name> <sha>` or reflog. The remote copies (where they exist)
were not touched.

## 2. Remote branches fully merged into `main` — OWNER APPROVAL

33 branches. Their commits are reachable from `main`, so deletion loses no code.
Recommended first remote batch after approval; tag tips if an audit trail is wanted.

```
feat/aer-decision-core-foundation-20261004
feat/colab-api-render-adapter-20261003
feat/compute-resilience-optimization-20261002
feat/editor-feature-lowering-f06-20261005
feat/editor-feature-lowering-final-20261005
feat/editor-feature-lowering-release-20261005
feat/editor-runtime-f06-f07-20261005
feat/external-api-mcp-fabric-20261005
feat/glide-decision-system-20261002
feat/treasurer-model-api-compute-admission-wave3-20261003
feat/treasury-compute-admission-wave2-main-20261003
feat/treasury-economic-calibration-wave6-20261004
feat/treasury-economic-intelligence-wave5-20261004
fix/cleanup-orphan-team-report-20261002
fix/crossref-live-diagnostics-20261005
fix/daytona-f07-physical-proof-20261004
fix/e2e-safety-patch-20261021
fix/f07-policy-refresh-20261016
fix/generate-video-startmission-syntax-20261003
fix/post-merge-typecheck-20261002
fix/render-worker-fail-closed-20261017
fix/safe-sqlite-fail-closed-20261021
fix/scheduler-bringup-gate-20261023
fix/typecheck-mission-collab-event-topic-20261002
integrate/editor-durable-current-main-20261005
integrate/treasury-wave3-current-main-20261003
reconcile/ascalon-readiness-current-main-20261003
reconcile/colab-mcp-current-main-20261003
reconcile/kaggle-proof-current-main-20261003
reconcile/lightning-teamspace-current-main-20261003
reconcile/overseer-w3-5-current-main-20261003
reconcile/provider-mcp-native-current-main-20261003
reconcile/remaker-v2-current-main-20261003
```

Note: `origin/main-1` also exists as a duplicate pointer to `main`; include it only
after confirming no automation references it.

## 3. Remote stale unmerged, no open PR — REVIEW REQUIRED

36 branches, last commit 2026-10-02…04. Age alone is not proof of abandonment; each
family must be checked for unique commits before deletion.

```
chore/close-daytona-f07-proof-trigger-20261004
docs/ascalon-overseer-finetune-prep-20261002
docs/kaggle-finalized-20261003
feat/aer-decision-core-architecture
feat/colab-mcp-interop-20261003
feat/compute-connection-onboarding-v2-20261004
feat/compute-live-sandbox-proof-20261002
feat/compute-pool-20261002
feat/compute-pool-hosted-sandboxes-20261002
feat/compute-provider-connect-ux-20261004
feat/hf-zerogpu-live-f07-proof-20261004
feat/kaggle-finalize-20261003
feat/kaggle-show-artifact-20261003
feat/lightning-live-mcp-20261003
feat/lightning-physical-mp4-proof-20261004
feat/notebook-live-mcp-20261002
feat/overseer-wave1-collaboration-fabric-20261002
feat/overseer-wave2-durable-work-20261002
feat/overseer-wave3-agent-workforce-20261002
feat/overseer-wave4-agent-intercom-20261002
feat/overseer-wave5-fleet-orchestration-20261002
feat/provider-mcp-native-interop-20261003
feat/remaker-v2-20261002
feat/remaker-v2-clean-20261002
feat/treasurer-control-plane-wave1-20261003
feat/treasury-compute-admission-wave2-20261003
feat/treasury-economic-intelligence-wave4-20261003
feat/treasury-economic-promotion-wave7-20261004
feat/treasury-promotion-evidence-wave7-20261004
fix/daytona-sandbox-unique-name-20261004
fix/f07-verifier-host-ffmpeg-20261004
fix/live-daytona-f07-test-order-20261004
fix/live-provider-activation-20261002
integrate/treasury-economic-intelligence-current-main-20261003
reconcile/lightning-live-current-main-20261003
reconcile/treasury-economic-intelligence-clean-20261003
```

Suggested triage: overseer waves (5), compute (5), kaggle/notebook (9), treasury
(6), daytona/provider (7), chores/reconcile (4). Archive tips as tags first.

## 4. Local branches still under review (not deleted)

| Branch | Why |
|---|---|
| `feat/wave8-adaptive-intelligence-fabric` | 4 unique commits, no PR |
| `test/integration-244-247-249` | PR #250 closed unmerged; 3 unique commits |
| `feat/job-targeted-render-claims-20261017` | 1 unique commit |
| `feat/editor-feature-lowering-release-20261005` | local diverges from merged remote |
| `feat/f03-runtime-adapter` | 4 unique commits, 1,719 behind |
| `unwanted` | 1 unique commit; invalid name |
| `feat/shortforge-production-pipeline-repair-20261031` | PR #260 merged; delete after re-verify |

## 5. Deletion exclusions

Never delete: `main`, any branch checked out in the 12 worktrees, any head of the 19
open PRs, `fix/f07-policy-refresh-20261016` on the remote while #230/#243 still
target it, or any branch whose unique commits have not been inspected.
