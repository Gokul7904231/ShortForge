# Branch Inventory — 2026-11-02

Snapshot method: live GitHub PR API for open PR heads; local `git for-each-ref` for
ahead/behind vs `main`; merge state via `git merge-base --is-ancestor`. No fetch was
performed in this phase, so remote-tracking dates reflect the last fetch (2026-11-01).

## Totals

| Metric | Count |
|---|---|
| Remote branches | 142 |
| Local branches | 22 |
| With an open PR | 19 |
| Remote fully merged into `main` | 33 |
| Remote stale (>2026-10-05), unmerged, no open PR | 36 |
| Remote unmerged, no open PR, newer than cutoff | 54 |
| Worktrees | 12 |

## Local branches

| Branch | Ahead/Behind `main` | Last commit | Association | Status | Action |
|---|---|---|---|---|---|
| `maintenance/repository-hygiene-20261102` | 5 / 1 | 2026-11-02 | cleanup commit + 4 `readme-rewrite` commits | ACTIVE | Keep; review cleanup commit |
| `pr-262` | 1 / 0 | 2026-11-01 | PR #262 head | OPEN_PR | Keep |
| `main` | 0 / 0 | 2026-11-01 | default | PRESERVE | Never delete |
| `readme-rewrite` | 4 / 1 | 2026-11-01 | PR #261 (merged); holds 111-line uncommitted WIP | ACTIVE_WORK | Keep; protect WIP |
| `feat/shortforge-production-pipeline-repair-20261031` | 1 / 1 | 2026-11-01 | PR #260 (merged) | MERGED_CANDIDATE | Delete after re-verify |
| `feat/wave8-adaptive-intelligence-fabric` | 4 / 1 | 2026-10-31 | none | UNKNOWN_REQUIRES_REVIEW | Inspect unique commits |
| `fix/creator-output-quality-wave7-1-20261031` | 17 / 1 | 2026-10-31 | worktree `ShortForge-quality-remediation` | ACTIVE_WORK | Keep |
| `feat/production-acceptance-verification-fabric-20261031` | 16 / 1 | 2026-10-31 | worktree `ShortForge-verification-fabric` | ACTIVE_WORK | Keep |
| `feat/non-lightning-production-acceptance-20261030` | 8 / 1 | 2026-10-31 | PR #257, worktree | OPEN_PR | Keep |
| `docs/three-agent-production-speedrun-20261029` | 39 / 1 | 2026-10-30 | PR #254, worktree | OPEN_PR | Keep |
| `feat/product-acceptance-20261029` | 3 / 1 | 2026-10-29 | PR #256 | OPEN_PR / SUPERSEDED | Owner decides close |
| `tmp/coord-read` | 32 / 1 | 2026-10-29 | worktree `aishorts-coord` | ACTIVE_WORK | Keep |
| `agent2/distributed-render-20261029` | 2 / 1 | 2026-10-29 | worktree `ShortForge-agent2-distributed-render` | ACTIVE_WORK | Keep |
| `feat/release-sdlc-spec-kit-20261029` | 1 / 1 | 2026-10-29 | PR #255, worktree | OPEN_PR | Keep |
| `test/integration-244-247-249` | 3 / 16 | 2026-10-21 | PR #250 (closed, unmerged) | CLOSED_PR_CANDIDATE | Review unique commits |
| `feat/job-targeted-render-claims-20261017` | 1 / 50 | 2026-10-18 | none | UNKNOWN_REQUIRES_REVIEW | Inspect unique commit |
| `feat/botkeep-release` | 7 / 67 | 2026-10-17 | PR #246 (draft) | DRAFT_PR | Keep |
| `feat/shortforge-editor-20261012` | 95 / 51 | 2026-10-13 | PR #242 (draft), worktree `pr242-qualify` | DRAFT_PR / BLOCKED | Decompose |
| `feat/editor-feature-lowering-release-20261005` | 3 / 67 | 2026-10-11 | remote counterpart merged; local diverges | REVIEW | Compare before delete |
| `feat/notebook-live-mcp-20261002` | 36 / 610 | 2026-10-02 | worktree `ShortForge-notebook-live` | ACTIVE_WORK (stale) | Confirm owner |
| `feat/f03-runtime-adapter` | 4 / 1719 | 2026-09-26 | none | STALE_UNVERIFIED | Review |
| `unwanted` | 1 / 2704 | 2026-09-22 | none; invalid name | REVIEW_REQUIRED | Inspect single commit |

## Remote branches with open PRs (19)

`Gokul7904231-patch-1`, `feat/aer-shadow-evidence-20261031`,
`feat/ascalon-dataset-admission-20261031`,
`feat/non-lightning-production-acceptance-20261030`,
`feat/product-acceptance-20261029`, `feat/release-sdlc-spec-kit-20261029`,
`docs/three-agent-production-speedrun-20261029`,
`fix/production-readiness-smoke-gates-20261029`, `feat/botkeep-release`,
`feat/reverse-features-foundation-20261017`, `fix/daytona-sdk-lifecycle-20261016`,
`feat/shortforge-editor-20261012`, `feat/aer-core-v3-stacked-20261012`,
`feat/visual-provider-contracts-current-main-20261012`,
`feat/kaggle-wan-dual-t4-current-main-20261012`,
`feat/treasury-wave7-promotion-evidence-20261012`,
`feat/okf-v3-stacked-on-v2-20261012`, `feat/okf-v2-current-main-20261012`,
`feat/sandbox-opencomputer-blaxel-20261006`.

## Worktrees and ownership

| Worktree | Branch | Dirty | Owner (inferred) |
|---|---|---|---|
| `Desktop/123/aishorts` | `maintenance/repository-hygiene-20261102` | yes (WIP) | this session |
| `AppData/Local/Temp/opencode/agent3-coord` | `docs/three-agent-production-speedrun-20261029` | no | Agent 3 / coordinator |
| `Desktop/ShortForge-notebook-live` | `feat/notebook-live-mcp-20261002` | 1 | Notebook agent |
| `Desktop/123/aishorts-coord` | `tmp/coord-read` | no | Coordinator |
| `Desktop/123/pr242-qualify` | `feat/shortforge-editor-20261012` | 2 | Editor qualification agent |
| `Desktop/123/ShortForge-agent1-sdlc` | `feat/release-sdlc-spec-kit-20261029` | no | Agent 1 / SDLC |
| `Desktop/123/ShortForge-agent2-distributed-render` | `agent2/distributed-render-20261029` | no | Agent 2 |
| `Desktop/123/ShortForge-production-acceptance` | `feat/non-lightning-production-acceptance-20261030` | no | Acceptance agent |
| `Desktop/123/ShortForge-quality-remediation` | `fix/creator-output-quality-wave7-1-20261031` | 1 | Quality agent |
| `Desktop/123/ShortForge-verification-fabric` | `feat/production-acceptance-verification-fabric-20261031` | no | Verification agent |
| `.gemini/.../coord-wt` | detached `23a28f58` | no | external tool |
| `.local/share/kilo/.../peppermint-liquid` | detached `566c16fe` | no | external tool |

> Do not delete or rewrite any branch checked out above. Six worktrees belong to
> other agents/tools and were not touched.

## Naming violations still present

`unwanted`, `tmp/coord-read`, `pr-262`, `test/integration-244-247-249`, and local
`feat/editor-feature-lowering-release-20261005` (diverged copy of a merged branch).
