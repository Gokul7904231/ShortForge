# ShortForge — WIP Workstream Reconciliation (2026-11-02)

**Purpose:** Secure and classify every uncommitted production path before any commit, branch, or Canva work begins.  
**Rule followed:** no `git reset --hard`, no `git clean`, no force-push, no push, no merge, no PR changes, no other-worktree edits.  
**Status:** Inventory complete. No WIP was discarded. No commit has been created by this reconciliation.

---

## 1. Snapshot

| Item | Value |
| :--- | :--- |
| Branch | `maintenance/repository-hygiene-20261102` |
| HEAD | `3928d778` |
| Worktrees | 12 (unchanged) |
| Working-tree entries | **115** |
| Modified tracked files | **19** |
| Deleted tracked files | **56** (all under `apps/web/scratch/`) |
| Untracked files/directories | **40** |
| Remote state | Nothing pushed; no remote operations performed |

**Safety backup:** `C:\Users\ASUS\AppData\Local\Temp\opencode\shortforge-backup-20261102`

Contents: `tracked-unstaged.patch` (1,092,092 B), `untracked-files.txt`, `status.txt`, `name-status.txt`, `branch.txt`, `HEAD.txt`, `worktrees.txt`, `MANIFEST.md`, and the untracked tree. The patch reverse-check was previously verified. This backup is the rollback path; do not use destructive reset.

**Ignored/generated (not part of the commit decision):**

| Path | Rule |
| :--- | :--- |
| `artifacts/**/*.mp4` | `*.mp4` ignored; generated deliverables |
| `data/audio/**` | `**/data/audio/` ignored; synthesized narration |
| `apps/web/.env` | `.env*` ignored; contains secrets |
| `.factoryos_render_cache/**` | ignored; safe to delete |
| `assets/**` | **un-ignored** (`!assets/**`); 76.8 MB canonical asset tree |

---

## 2. Workstream Classification

### A. Quiz V2 timing and render reliability (this session)

| Path | Change |
| :--- | :--- |
| `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts` | 50-beat cycle, gate-aware compile, 180 s ceiling, terse option narration, 50 ms tails |
| `apps/web/factoryos/core/verification/VerificationEngine.ts` | Universal quiz ceiling 145 → 180 s |
| `packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py` | Canonical 44.1 kHz / 2 ch scene audio |
| `packages/factoryos-render/src/factoryos_render/backends/image.py` | `highlightOptionIndex` support |
| `tools/render_quizshow_v2_samples.ts` | Dataset arg, 50-beat checks, intent export, derived contact sheet, manifest dedupe |
| `tools/synthesize_quizshow_v2_audio.py` | Explicit female voice, no male fallback, empty-narration guard |
| `tools/verify_quiz_v2_timing.ts` | **New** physical 100-check gate |
| `apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts` | **New** compiled-timeline regression |
| `apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts` | 50-beat expectations |
| `apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts` | 50-beat expectations |
| `docs/verification/quiz-five-second-think-gate.md` | **New** evidence report |
| `docs/verification/quiz-production-reliability-20261102.md` | **New** incident report |

**State:** typecheck passes; 38 quiz tests pass; Geography and Science renders pass F07 and the physical gate (100/100 each).  
**Risk:** `TemplateProductionPipeline.ts` and `image.py` also contain earlier quiz V2 work, so a path-scoped commit will carry that work with the fix. That is acceptable; splitting within a file is not safe.

### B. Quiz V2 content engine (pre-existing WIP)

| Path | Notes |
| :--- | :--- |
| `apps/web/factoryos/core/templates/UniversalQuizPayload.ts` | **Untracked**; schema/normalizer |
| `apps/web/lib/quiz/UniversalAssetResolver.ts` | **Untracked**; B2/local asset resolution |
| `apps/web/lib/templates/definitions/CanonicalTemplates.ts` | Modified; template registry definitions |
| `apps/web/app/api/quiz/draft/route.ts` | Modified; quiz draft API |
| `apps/web/content-engines/quiz/index.ts` | Modified; quiz engine |
| `apps/web/lib/visual-assets/StorageProvider.ts` | Modified; B2/storage behavior |
| `tools/generate_quiz_assets.py`, `tools/render_quizshow_flagship.ts`, `tools/render_quizshow_v1_2_samples.ts` | Asset/render tooling |
| `docs/design/quiz-template-v2.md` | Design note |
| `docs/verification/quiz-v2-*.md`, `quizshow-v*.md` | Prior completion/audit reports |
| `assets/**` | 76.8 MB qualified B2/local asset tree |

**Risk:** the untracked payload/resolver are imported by untracked tests and tools. Do not commit `CanonicalTemplates.ts` or the quiz routes without them, or the build breaks. Commit this group together, or not at all.

### C. Voice and narration

| Path | Notes |
| :--- | :--- |
| `apps/web/factoryos/core/voice/VoiceFabric.ts` | Voice orchestration |
| `apps/web/factoryos/core/voice/GeminiTTSProvider.ts` | Provider behavior |
| `apps/web/factoryos/tests/voice-provider-failure-matrix.test.ts` | Failure matrix |
| `tools/synthesize_quizshow_audio.py` | Legacy quiz synthesis |
| `artifacts/quiz-v2/voice-auditions/` | Audition evidence (generated, ignored tree) |

**Risk:** `VoiceFabric.ts` is shared by all TTS paths, not just quiz. Review independently of the timing fix.

### D. Editor / API / render plumbing

| Path | Notes |
| :--- | :--- |
| `apps/web/app/(os)/factory/editor/page.tsx` | Editor UI |
| `apps/web/app/api/generate-video/route.ts` | Generation API |
| `apps/web/agents/script-agent.ts` | Script agent |
| `apps/web/factoryos/core/render/LocalRenderAdapter.ts` | Render adapter |
| `apps/web/factoryos/core/compute/notebooks/ColabNotebookAdapter.ts` | Colab adapter |
| `README.md` | Documentation |
| `package.json` | Adds `sync:assets` script only |
| `packages/factoryos-render/tests/test_feature_lowering.py` | Renderer test |

**Risk:** `LocalRenderAdapter.ts` and `generate-video/route.ts` sit on the production render path. They must be tested with the same F07/physical gates before commit.

### E. Three-format qualification

| Path | Notes |
| :--- | :--- |
| `apps/web/factoryos/tests/three-format-qualification.test.ts` | **Untracked** |
| `tools/generate_format_assets.py` | **Untracked** |
| `docs/verification/three-format-short-qualification/` | **Untracked** evidence |
| `apps/web/public/logo.png`, `apps/web/public/shortforge-watermark.png` | **Untracked** brand assets |

**Risk:** standalone feature slice; keep separate from the quiz timing commit.

### F. Storage and asset consolidation

| Path | Notes |
| :--- | :--- |
| `tools/sync_assets.py`, `tools/consolidate_assets.py` | **Untracked** |
| `tools/create_contact_sheet.py` | **Untracked** |
| `apps/web/lib/visual-assets/StorageProvider.ts` | Also listed in B; shared |
| `assets/**` | Canonical tree, 76.8 MB |

**Risk:** `assets/**` is deliberately un-ignored, but a 76.8 MB commit needs an explicit decision (normal Git vs LFS vs deployment sync). Do not add it accidentally with `git add -A`.

### G. Scratch cleanup (56 deletions)

All deleted paths are under `apps/web/scratch/`. No tracked production code imports `scratch/`; only `.gitignore`, `next.config.mjs`, and historical markdown references remain. The deletions remove obsolete debug/generation scripts.

**Risk:** these deletions pre-date this session and may be owner work. They are recoverable from HEAD and from the backup patch. Commit them as an isolated `refactor` cleanup, not inside a feature commit.

### H. Agent reports / mission artifacts

| Path | Notes |
| :--- | :--- |
| `FINAL-ARCHITECTURE-DIFF.md` | Root-level agent report |
| `FINAL-FILE-MANIFEST.md` | Root-level agent report |
| `FINAL-PATCH-REVIEW.md` | Root-level agent report |
| `FINAL-TEST-RESULTS.md` | Root-level agent report |
| `.agents/teamwork/` | Untracked teamwork prompts/briefings |

**Risk:** archival, not production code. Keep out of feature commits unless the project intentionally versions agent communication.

---

## 3. Recommended Commit / Branch Strategy

The working tree is shared by all worktrees, so creating a branch alone does not isolate these changes. Use path-scoped commits on a dedicated branch, in this order, after a final typecheck/test pass. **These commands are a plan, not executed.**

```powershell
git switch -c feature/quiz-v2-narration-timing

# A. Timing fix + evidence
git add apps/web/factoryos/core/templates/TemplateProductionPipeline.ts `
        apps/web/factoryos/core/verification/VerificationEngine.ts `
        packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py `
        packages/factoryos-render/src/factoryos_render/backends/image.py `
        tools/render_quizshow_v2_samples.ts `
        tools/synthesize_quizshow_v2_audio.py `
        tools/verify_quiz_v2_timing.ts `
        apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts `
        apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts `
        apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts `
        docs/verification/quiz-five-second-think-gate.md `
        docs/verification/quiz-production-reliability-20261102.md
git commit -m "bug(quiz): enforce five-second silent think gate before answer"

# B. Quiz content engine (payload, resolver, routes, templates, assets)
# Add B together; never commit CanonicalTemplates.ts without UniversalQuizPayload.ts.
git add apps/web/factoryos/core/templates/UniversalQuizPayload.ts `
        apps/web/lib/quiz/UniversalAssetResolver.ts `
        apps/web/lib/templates/definitions/CanonicalTemplates.ts `
        apps/web/app/api/quiz/draft/route.ts `
        apps/web/content-engines/quiz/index.ts `
        apps/web/lib/visual-assets/StorageProvider.ts `
        tools/generate_quiz_assets.py tools/render_quizshow_flagship.ts `
        tools/render_quizshow_v1_2_samples.ts `
        docs/design/quiz-template-v2.md docs/verification/quiz-v2-*.md `
        docs/verification/quizshow-v*.md
git commit -m "feature(quiz): complete universal quiz content engine"

# C. Voice
git add apps/web/factoryos/core/voice/VoiceFabric.ts `
        apps/web/factoryos/core/voice/GeminiTTSProvider.ts `
        apps/web/factoryos/tests/voice-provider-failure-matrix.test.ts `
        tools/synthesize_quizshow_audio.py
git commit -m "refactor(voice): harden provider fallback and narration synthesis"

# D. Editor / API / render plumbing
git add "apps/web/app/(os)/factory/editor/page.tsx" `
        apps/web/app/api/generate-video/route.ts `
        apps/web/agents/script-agent.ts `
        apps/web/factoryos/core/render/LocalRenderAdapter.ts `
        apps/web/factoryos/core/compute/notebooks/ColabNotebookAdapter.ts `
        README.md package.json `
        packages/factoryos-render/tests/test_feature_lowering.py
git commit -m "feature(editor): wire generation and render plumbing"

# E. Scratch cleanup
git add -A apps/web/scratch
git commit -m "refactor(repo): remove obsolete scratch scripts"

# F. Three-format qualification
git add apps/web/factoryos/tests/three-format-qualification.test.ts `
        tools/generate_format_assets.py `
        docs/verification/three-format-short-qualification `
        apps/web/public/logo.png apps/web/public/shortforge-watermark.png
git commit -m "feature(render): qualify three output formats"

# G. Storage / assets (explicit decision required for 76.8 MB)
git add tools/sync_assets.py tools/consolidate_assets.py tools/create_contact_sheet.py
git commit -m "refactor(assets): add asset sync and contact-sheet tooling"

# H. Agent reports
git add FINAL-*.md .agents/teamwork
git commit -m "refactor(docs): archive agent mission reports"
```

Commitlint in this repository accepts only `refactor`, `feature`, and `bug`. Do not use `fix`, `chore`, or `docs` as the commit type.

**Do not add:**

- `artifacts/**` (generated; `.mp4` is ignored, other outputs are evidence only)
- `data/audio/**` (ignored synthesis output)
- `.factoryos_render_cache/**` (ignored cache)
- `apps/web/.env` (ignored secret)

**Before each commit:** `npm run typecheck` in `apps/web`, plus the quiz test set. Before the timing commit, re-run the physical verifier.

**Rollback:** `git apply --reverse --check "C:\Users\ASUS\AppData\Local\Temp\opencode\shortforge-backup-20261102\tracked-unstaged.patch"` verifies the backup still applies in reverse. Use targeted `git restore`/patch application, never a hard reset.

---

## 4. Canva Readiness (timing gate now passed)

The five-second gate is physically verified, so the Canva phase is unblocked.

| Item | Status |
| :--- | :--- |
| `CANVA_CLIENT_ID` | Present in `apps/web/.env` (value not printed) |
| `CANVA_CLIENT_SECRET` | Present in `apps/web/.env` (value not printed) |
| Secret file tracked? | No; `apps/web/.env` is git-ignored |
| Canva OAuth routes | **Not implemented**; no `/api/canva/**` route exists |
| Canva capability code | **Not implemented**; no Canva client/adapter exists |
| Proposed local redirect | `http://localhost:3000/api/canva/callback` |
| Proposed production redirect | `https://shortforge.gokul.software/api/canva/callback` |

Production origin is taken from the hosted URL declared in `README.md`. Existing OAuth pattern to follow: `apps/web/app/api/drive/connect/route.ts` and `.../callback/route.ts`, which derive `${req.nextUrl.origin}/api/drive/callback`, use an HMAC-bound state nonce, and set an HttpOnly state cookie. Canva requires OAuth with PKCE, so the Canva flow must add a code verifier/challenge on top of that state pattern.

**Not done:** the redirect URIs are not yet registered in the Canva developer portal, and no Canva OAuth/capability implementation has been started. Register both URIs before testing the callback. Credentials were verified by presence only.

---

## 5. Reconciliation Verdict

- The quiz timing defect is fixed and physically proven; its evidence and code are a coherent, low-risk commit group.
- The remaining WIP is real production work, not disposable scratch, with two coupling hazards: the untracked quiz payload/resolver and the shared voice/render adapters.
- The 56 scratch deletions are isolated and safe to commit separately.
- Nothing was pushed, merged, reset, cleaned, or deleted outside the ignored render cache.
- The backup patch and untracked copy remain the recovery path.
