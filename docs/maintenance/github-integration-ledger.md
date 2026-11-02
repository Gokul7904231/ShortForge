# GitHub Integration Ledger — 2026-11-02

**Source of truth:** live GitHub state. If this file disagrees with GitHub, GitHub
wins and this ledger must be corrected.

Verified: 19 open PRs · 3 drafts · 0 reviews · 142 remote branches · 12 worktrees.
All GitHub PRs are authored by `Gokul7904231`; worktree owners below are inferred
from directory names, not from GitHub accounts.

## Workstreams

| # | Workstream | Branch | PR | Owner / worktree | Status | Dependency | Blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| 1 | Repo hygiene | `maintenance/repository-hygiene-20261102` | — | this session | ACTIVE (local) | none | none | Review/commit docs; keep off remote until approval |
| 2 | README fix | `Gokul7904231-patch-1` | #262 | owner | BLOCKED_BY_GATE | none | Team-report / OKF-lint checks | Merge or close; drop duplicate local edit |
| 3 | Deploy readiness | `fix/production-readiness-smoke-gates-20261029` | #253 | owner | CI_BLOCKED | none | Lightning job | Rerun Lightning; review |
| 4 | AER shadow evidence | `feat/aer-shadow-evidence-20261031` | #259 | owner | CI_BLOCKED | none | Lightning job | Rerun; review |
| 5 | Ascalon admission | `feat/ascalon-dataset-admission-20261031` | #258 | owner | CI_BLOCKED | none | Lightning job | Rerun; review |
| 6 | Production acceptance | `feat/non-lightning-production-acceptance-20261030` | #257 | acceptance worktree | CANONICAL; CI_BLOCKED | none | Lightning + single-mission gates | Fix/re-run acceptance; close #256 |
| 6b | Creator journey truth | `feat/product-acceptance-20261029` | #256 | owner | SUPERSEDED | #257 | duplicate | Owner approves close |
| 7 | SDLC governance | `feat/release-sdlc-spec-kit-20261029` | #255 | Agent 1 worktree | CI_BLOCKED | none | Lightning job | Rerun; review |
| 8 | Speedrun docs | `docs/three-agent-production-speedrun-20261029` | #254 | Agent 3 worktree | CI_BLOCKED | none | Lightning job | Rerun; review |
| 9 | Editor | `feat/shortforge-editor-20261012` | #242 (draft) | pr242-qualify worktree | BLOCKED / oversized | none | 205 commits, mixed scope | Split into A–E slices |
| 10 | OKF V2 | `feat/okf-v2-current-main-20261012` | #234 | owner | LIKELY_READY | none | informational web job only | Confirm policy; merge first |
| 11 | OKF V3 | `feat/okf-v3-stacked-on-v2-20261012` | #235 | owner | CI PASS / stacked | #234 | root unmerged | Merge after #234 |
| 12 | Treasury evidence | `feat/treasury-wave7-promotion-evidence-20261012` | #237 | owner | CI PASS / stacked | #235 | chain | Merge after #235 |
| 13 | Kaggle Wan | `feat/kaggle-wan-dual-t4-current-main-20261012` | #238 | owner | CI PASS / stacked | #237 | chain | Merge after #237 |
| 14 | Visual contracts | `feat/visual-provider-contracts-current-main-20261012` | #239 | owner | CI PASS / stacked | #237 | chain | Merge after #237 |
| 15 | AER-Core V3 | `feat/aer-core-v3-stacked-20261012` | #241 | owner | CI PASS / stacked | #235 | chain | Merge after #235 |
| 16 | Daytona lifecycle | `fix/daytona-sdk-lifecycle-20261016` | #243 | owner | RETARGET_REQUIRED | base merged | base ≠ main | Owner retargets to main |
| 17 | Hosted sandboxes | `feat/sandbox-opencomputer-blaxel-20261006` | #230 | owner | RETARGET_REQUIRED | base merged | base ≠ main; Lightning cancelled | Owner retargets; rerun |
| 18 | Reverse Features | `feat/reverse-features-foundation-20261017` | #245 (draft) | owner | DRAFT | none | Floor 07 / Lightning | Ready for review (docs-only) |
| 19 | Botkeep release | `feat/botkeep-release` | #246 (draft) | owner | DRAFT | none | Floor 07 / Lightning | Owner decides finish/archive |
| 20 | Notebook live | `feat/notebook-live-mcp-20261002` | — | notebook worktree | ACTIVE_WORK (stale since Oct 2) | — | no PR | Confirm owner; open PR or archive |
| 21 | Distributed render | `agent2/distributed-render-20261029` | — | Agent 2 worktree | ACTIVE_WORK | — | no PR | Confirm owner; open PR or archive |
| 22 | Quality remediation | `fix/creator-output-quality-wave7-1-20261031` | — | quality worktree | ACTIVE_WORK | — | no PR | Open PR when verified |
| 23 | Verification fabric | `feat/production-acceptance-verification-fabric-20261031` | — | verification worktree | ACTIVE_WORK | — | no PR | Open PR when verified |
| 24 | Wave 8 | `feat/wave8-adaptive-intelligence-fabric` | — | unknown | REVIEW_REQUIRED | — | 4 unique commits | Identify owner |
| 25 | Integration stack | `test/integration-244-247-249` | #250 closed | unknown | CLOSED_UNMERGED | — | 3 unique commits | Review/archive |
| 26 | Job claims | `feat/job-targeted-render-claims-20261017` | — | unknown | REVIEW_REQUIRED | — | 1 unique commit | Review |
| 27 | F03 adapter | `feat/f03-runtime-adapter` | — | unknown | STALE_UNVERIFIED | — | 4 unique commits | Review |
| 28 | Unnamed experiment | `unwanted` | — | unknown | REVIEW_REQUIRED | — | invalid name | Inspect single commit |

## Prioritized integration queue

| Priority | Item | Action | Requires owner |
|---|---|---|---|
| P0 | Uncommitted WIP on `readme-rewrite` | Protect (backed up; not committed) | yes |
| P1 | #234 → #235 → #237 → #238/#239/#241 | Confirm informational gate, merge bottom-up | yes |
| P2 | #257 | Fix acceptance gate; then close #256 | yes |
| P3 | #253, #262 | Rerun/fix gates; merge or close | yes |
| P4 | #259, #258, #255, #254 | Rerun Lightning; review | yes |
| P5 | #243, #230 | Retarget to `main`; rerun | yes |
| P6 | #242 | Split into slices A–E | yes |
| P7 | #245, #246 | Finish/readiness review | yes |
| P8 | 33 merged remote branches | Delete after tagging | yes |
| P9 | 36 stale remote branches | Triage by family, archive tips | yes |

## Discrepancies and unverified items

- Required checks / branch protection: not readable without authentication.
- Reviews: none recorded on any PR.
- `origin/main-1` duplicate pointer exists.
- Remote-tracking ref dates were not refreshed this phase (no fetch by design).
