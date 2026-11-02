# Repository Maintenance Execution — 2026-11-02

Read-only audit followed by controlled local execution. No push, merge, close,
retarget, remote-branch deletion, history rewrite, or force-push was performed.

## 1. Backup location and verification

Location: `C:\Users\ASUS\AppData\Local\Temp\opencode\shortforge-backup-20261102`

| Artifact | Result |
|---|---|
| `tracked-unstaged.patch` | 75 files (56 deletions), binary-safe, SHA256 `21D7FD63…DACEFAE` |
| Patch integrity | `git apply --check --reverse` → **exit 0** (patch exactly matches the working-tree diff) |
| Untracked copy | 109 files + 3 vendored repos: `apps` 8, `assets` 55 (76.8 MB), `artifacts` 7 (non-ignored only), `docs` 25, `tools` 10, `vendor` 692 (113.2 MB) |
| Hash spot-check | `UniversalQuizPayload.ts`, `render_quizshow_flagship.ts` → SHA256 match |
| Staged changes | None existed (`git diff --cached` empty); no `staged.patch` needed |
| `MANIFEST.md` | Written with reconstruction commands and worktree ownership notes |

Ignored render outputs under `artifacts/` were not copied; they are regenerable and
were not touched.

## 2. Dirty-worktree protection

- Original HEAD `abd72c31` on `readme-rewrite`; 113-status worktree.
- All 75 tracked changes and 112 untracked entries have a verified recovery path.
- Existing `apps/web/scratch/*` deletions were left exactly as they were (unstaged).
- No other worktree was modified. Dirty worktrees at backup time:
  `ShortForge-notebook-live` (1), `pr242-qualify` (2),
  `ShortForge-quality-remediation` (1). All remain untouched.
- Work was **not** committed: it still needs to be separated by workstream by its owner.

## 3. Local branches removed (16)

`baseline-e9664878`, `chore/bottle-apps-services`, `chore/rename-shortforge`,
`chore/repository-architecture-cleanup`, `feat/ascalon-training-readiness`,
`feat/f06-unified-render-fabric`, `feat/kaggle-live-integration`,
`feat/three-format-short-qualification-20261031`, `fix-wt247`,
`fix/e2e-safety-patch-20261021`, `fix/f07-policy-refresh-20261016`,
`fix/render-worker-fail-closed-20261017`,
`fix/render-worker-fail-closed-20261017-wt`,
`fix/safe-sqlite-fail-closed-20261021`,
`fix/scheduler-bringup-gate-20261023`, `proof/e2e-local-render-20261023`.

Every one was verified as an ancestor of `main`, 0 commits ahead, and not checked
out in any worktree. `git branch -d` (refuses unmerged branches) was used.
Two pairs pointed at identical SHAs, confirming local duplicates.

## 4. Files removed (commit `cb6e96fb`, 29 paths, ~43.5 MB)

| Path | Reason |
|---|---|
| `services/pipeline/floor03_asset_realization/storage/tmp{5xwtwkff,75icnsmo,78ehsy5e,hfua2o14,rxcmfrmu}` | Temp uploads, no references (5.7+5.5+5.5+5.4+5.4 MB) |
| `.../storage/asset_memory.lock` | 0-byte runtime lock |
| `apps/web/generated/local-ai/output/_tmp_quiz_test/` | Test render output, no references |
| `apps/web/generated/local-ai/output/test_quiz_job/` | Test render output, no references |
| `apps/web/generated/local-ai/output/_tmp_job/` | Test render output + duplicate temp audio |
| `apps/web/generated/local-ai/output/_tmp_test/` | Test render output |
| `apps/web/local-ai/placeholder-does-not-exist` | 0-byte placeholder, 0 references |

Pre-removal checks: `git grep` for each path/name found **no** code, test, workflow,
or script reference. Small `generated/jobs/*.json` inputs were deliberately kept as
reproduction fixtures.

## 5. Preserved and why

| Item | Reason |
|---|---|
| `apps/web/public/german-quiz.mp4` (10.1 MB) | Referenced by landing components and a security test |
| `services/rendering-engine/assets/audio/*.wav` | Production audio assets |
| `.../storage/asset_memory.json` (6.1 MB) | Referenced by `config.py`; runtime asset memory |
| `apps/web/generated/jobs/*.json` | Small job inputs useful for reproduction |
| `apps/web/scratch/*` deletions | Existing owner work; left unstaged |
| `assets/` (55 files, 76.8 MB) | Declared “single canonical source of truth” in `assets/README.md`; kept un-ignored |
| `knowledge/.obsidian/*` | Tracked knowledge-graph plugin, not editor junk |
| `artifacts/` | Verification evidence; left untracked/unignored pending owner decision |
| Historical docs, `Team/` reports, `.okf/` | Engineering record |

## 6. `.gitignore` changes

Added:

```
vendor/                      # nested external template checkouts
production-helper/.venv/     # 1 GB local virtualenv
**/asset_memory.lock         # runtime lock
```

Kept the pre-existing local `!assets/**` exception after confirming `assets/README.md`
declares that tree canonical. Verified with `git check-ignore`:

- `vendor/` → ignored
- `production-helper/.venv/` → ignored
- `asset_memory.lock` → ignored
- `assets/` → un-ignored (intentional)
- `artifacts/`, `data/` → still un-ignored (owner decision pending)

No broad pattern hides source code.

## 7. GitHub governance documents created

`docs/maintenance/branch-inventory.md`, `pr-inventory.md`,
`github-integration-ledger.md`, `duplicate-work-analysis.md`,
`branch-cleanup-candidates.md`, `pr-merge-readiness.md`
(committed locally as `37fd9c27`).
All built from live PR/check data; protection policy is recorded as unverified.

## 8. Duplicate PR findings

- **#256 ⊂ #257**: compare API says #257 is 13 commits ahead, 0 behind, merge base
  = #256 head. All 29 #256 files appear in #257; none are unique. Close #256 only
  with owner approval.
- **#230/#243** share the obsolete base `fix/f07-policy-refresh-20261016`, which is
  already merged into `main`. Retarget required.
- **#262** duplicates the one-line README edit already present in the working tree.
- **#234–#241** is a strict dependency chain, not duplicate work.

## 9. Integration dependencies

```
#234 → #235 → #237 → #238
                  └→ #239
       #235 → #241
#230, #243 → obsolete merged base (retarget to main)
#256 ⊂ #257
```

## 10. Tests and results

| Check | Result |
|---|---|
| `npm run typecheck` (`apps/web`, `tsc --noEmit`) | **PASS** (exit 0, no diagnostics) |
| `git diff --check` | PASS (no whitespace errors) |
| Reference search for every removed path | PASS (no references) |
| Full test suite / CI workflows | **NOT EXECUTED** — provider credentials, network jobs, and long-running acceptance gates unavailable locally |
| Python tests | NOT EXECUTED — no Python code changed |

Existing vs new failures: none introduced by the removed files (they were compile-
and test-invisible outputs). The repository already had failing remote acceptance
jobs; those are pre-existing and recorded in `pr-merge-readiness.md`.

## 11. Remaining risks

1. **The 75-file WIP is still uncommitted** and now sits on branch
   `maintenance/repository-hygiene-20261102` (cleanup commit `cb6e96fb`). It must be
   committed by workstream or the branch must be switched back deliberately.
2. `!assets/**` makes 76.8 MB of binaries stageable. Accidental `git add -A` risk.
3. The cleanup commit is local only; remote `readme-rewrite` is unchanged.
4. 36 stale remote branches and 33 merged remote branches remain.
5. Required-check policy is unverified; no PR can be called merge-ready.
6. `production-helper/` still contains a 1 GB `.venv` locally (now ignored).

## 12. Owner decisions required

1. Approve closing #256 (superseded by #257).
2. Approve retargeting #230 and #243 to `main`.
3. Confirm whether “Web Regression Suite (Informational)” is non-blocking; if yes,
   merge the #234 chain bottom-up.
4. Decide the Team-report gate for #262, or close it as duplicate of local WIP.
5. Approve decomposition plan for #242.
6. Decide fate of drafts #245 and #246.
7. Approve deletion of the 33 merged remote branches (after optional tip tags).
8. Approve triage/deletion of the 36 stale remote branches.
9. Decide whether `assets/` (76.8 MB) should use Git LFS instead of plain tracking.
10. Decide whether `artifacts/` evidence should be tracked, archived, or ignored.
