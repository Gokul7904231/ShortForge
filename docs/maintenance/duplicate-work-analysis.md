# Duplicate Work Analysis — 2026-11-02

## 1. #256 is fully contained in #257 (superseded, no unique work)

Evidence from the GitHub compare API for `285e8b43` (#256 head) → `2d453fe2` (#257 head):

| Field | Value |
|---|---|
| Status | `ahead` |
| Ahead by | 13 commits |
| Behind by | 0 |
| Merge base | `285e8b43` — exactly #256's head |

File-level comparison:

| Set | Count | Result |
|---|---|---|
| #256 files | 29 | — |
| #257 files | 98 | — |
| Shared | 29 | **every file in #256 is in #257** |
| Only in #256 | 0 | — |
| Only in #257 | 69 | duration contract, verification fabric, F02 runtime adapter, checkpoint store, acceptance artifacts, production scripts, etc. |

**Conclusion:** #257 contains #256's history and all of its changes. No commit or file
would be lost by closing #256. Recommendation: keep #257 canonical; close #256 only
after owner approval. Preserve `Team/reports/pr-256.json` (it already exists in #257).

## 2. OKF/AER stack is a strict dependency chain, not duplication

```
#234 (feat/okf-v2-current-main-20261012 → main)
  └─ #235 (feat/okf-v3-stacked-on-v2-20261012)
       ├─ #237 (feat/treasury-wave7-promotion-evidence-20261012)
       │    ├─ #238 (feat/kaggle-wan-dual-t4-current-main-20261012)
       │    └─ #239 (feat/visual-provider-contracts-current-main-20261012)
       └─ #241 (feat/aer-core-v3-stacked-20261012)
```

All five child PRs have zero failing checks; #234 fails only the job named
“Web Regression Suite (Informational)”. Merge order must be
**#234 → #235 → #237 → (#238, #239, #241)**. Do not merge children before the root.

## 3. Shared stale base: #230 and #243

Both target `fix/f07-policy-refresh-20261016`, which is **already merged into `main`**
(confirmed in the 33 merged remote branches). Their merge previews are therefore
relative to an obsolete base, and they cannot be merged to `main` as-is.

Proposal (owner approval required):

1. Retarget #243 and #230 to `main` via GitHub “Edit base branch”.
2. Resolve any resulting conflicts in the respective head branches.
3. Re-run CI; the Lightning job is cancelled on both heads and must be re-triggered.

## 4. README duplication: #262 vs merged #261 vs local WIP

#262 changes a single line in `README.md` (logo link target). The current working
tree also carries a one-line uncommitted `README.md` change. They are the same
trivial edit, so #262 is redundant with the local WIP branch. Merge one, discard the
other.

## 5. Duplicate local branches already removed

| Branch | SHA | Duplicate of |
|---|---|---|
| `fix/render-worker-fail-closed-20261017-wt` | `575ba848` | `fix/render-worker-fail-closed-20261017` |
| `feat/kaggle-live-integration` | `0f12efbc1` | `chore/rename-shortforge` |

Both pairs pointed at identical commits; removed with `git branch -d` (fully merged).

## 6. Duplicate tracked files still present

| Set | Size | Evidence |
|---|---|---|
| `hybrid-video/assets/backgrounds/*.png` vs `services/rendering-engine/assets/backgrounds/*.png` | 3.17 MB | Byte-identical blobs |
| `apps/web/app/favicon.ico` = `apps/web/public/favicon.ico` = `apps/web/public/favicon-black.png` | 27.6 KB ×3 | Byte-identical blobs |
| `hybrid-video/` renderer vs `packages/factoryos-render/` | — | `hybrid-video` referenced only by `apps/web/lib/python-runner.ts`; needs render-path tracing before removal |

## 7. Proposed decomposition of #242 (205 commits / 47 files)

#242 mixes an editor feature with pipeline and docs changes. Suggested reviewable PRs:

| Slice | Files | Notes |
|---|---|---|
| A. Editor contracts + runtime | `factoryos/core/editor/*` (9), `RenderIntentContracts.ts`, editor tests (8) | Pure domain + tests; review first |
| B. Editor API routes | `app/api/editor/*` (4 routes) | Depends on A |
| C. Editor UI | `app/(os)/factory/editor/page.tsx`, `components/editor/*` (2), `QuickGenerateOverlay.tsx`, library page, `jobs-history.ts`, `.github/workflows/editor-focused.yml` | Depends on B |
| D. Timeline/CAS integration | `core/timeline/*`, `core/compute/cas/ContentAddressedStore.ts`, `floor03` handoff/pipeline, `floor05` handoff/bridge/worker, `visual-assets` framework, `OverseerControlPlane.ts` | Highest risk; split from editor UI |
| E. Evidence/docs | `.okf/research/*` (3), `Team/reports/pr-242.json` | Can ship independently |

Do not close #242 while the slice branches are prepared; its commits are unique.
