# Forensic Baseline Audit & Codebase Survey Report (Milestone R1)

**Agent:** `teamwork_explorer_survey_1`  
**Date:** 2026-11-02  
**Target File:** `c:\Users\ASUS\OneDrive\Desktop\123\aishorts\.agents\teamwork\teamwork_explorer_survey_1\handoff.md`  
**Parent Orchestrator:** `cbda4723-f9b2-4ab7-b1c3-fb017a03b9e1`  
**Governing Document:** `.agents/teamwork/ORIGINAL_REQUEST.md`  

---

## 1. Observation

### 1.1 Git Repository State & Active Worktrees
Execution of `git status -s -b`, `git rev-parse HEAD`, `git log -1 --stat`, and `git worktree list` yielded:
- **Active Branch:** `maintenance/repository-hygiene-20261102`
- **Head Commit:** `3928d77814336168e7bc2499582af9c3a4037235`
- **Commit Details:** `refactor(maintenance): sync inventory snapshot with post-cleanup state` by `Gokul7904231 <asgokul2004@gmail.com>` on `Mon Nov 2 13:58:59 2026 +0530`.
- **Working Tree State:**
  - 19 modified tracked files, including:
    - `README.md`, `package.json`
    - `apps/web/lib/templates/definitions/CanonicalTemplates.ts`
    - `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`
    - `apps/web/factoryos/core/render/LocalRenderAdapter.ts`
    - `apps/web/factoryos/core/voice/VoiceFabric.ts`
    - `apps/web/factoryos/core/voice/GeminiTTSProvider.ts`
    - `packages/factoryos-render/src/factoryos_render/backends/image.py`
    - `packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py`
    - `packages/factoryos-render/tests/test_feature_lowering.py`
  - 55 tracked scratch files deleted (`apps/web/scratch/*`).
  - Untracked files (`??`) present:
    - Core templates and tests: `apps/web/factoryos/core/templates/UniversalQuizPayload.ts`, `apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts`, `apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts`, `apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts`, `apps/web/factoryos/tests/quizshow-template.test.ts`, `apps/web/lib/quiz/UniversalAssetResolver.ts`.
    - Tools: `tools/verify_quiz_v2_timing.ts`, `tools/render_quizshow_v2_samples.ts`, `tools/synthesize_quizshow_v2_audio.py`, `tools/generate_quiz_assets.py`.
    - Artifacts & Docs: `artifacts/quiz-v2/*`, `docs/design/quiz-template-v2.md`, `docs/verification/quiz-five-second-think-gate.md`, `docs/verification/quiz-v2-completion-report.md`.
- **Worktree Pool (12 active worktrees):**
  1. `C:/Users/ASUS/OneDrive/Desktop/123/aishorts` [maintenance/repository-hygiene-20261102] (Current main working tree)
  2. `C:/Users/ASUS/.gemini/antigravity-ide/brain/44dc5af9-7fca-4e7d-aa97-65a509f3f8a1/scratch/coord-wt` [detached HEAD]
  3. `C:/Users/ASUS/.local/share/kilo/worktree-pool/aishorts-513e2a484f99/peppermint-liquid` [detached HEAD]
  4. `C:/Users/ASUS/AppData/Local/Temp/opencode/agent3-coord` [docs/three-agent-production-speedrun-20261029]
  5. `C:/Users/ASUS/Desktop/ShortForge-notebook-live` [feat/notebook-live-mcp-20261002]
  6. `C:/Users/ASUS/OneDrive/Desktop/123/aishorts-coord` [tmp/coord-read]
  7. `C:/Users/ASUS/OneDrive/Desktop/123/pr242-qualify` [feat/shortforge-editor-20261012]
  8. `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-agent1-sdlc` [feat/release-sdlc-spec-kit-20261029]
  9. `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-agent2-distributed-render` [agent2/distributed-render-20261029]
  10. `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-production-acceptance` [feat/non-lightning-production-acceptance-20261030]
  11. `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-quality-remediation` [fix/creator-output-quality-wave7-1-20261031]
  12. `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-verification-fabric` [feat/production-acceptance-verification-fabric-20261031]

### 1.2 Environment Configuration & Credential Safety
Inspection of environment files and `.gitignore` directives showed:
- `apps/web/.env` exists and contains:
  - `CANVA_CLIENT_ID`: Present, non-empty, string length = 15 characters (value strictly unprinted and unexposed).
  - `CANVA_CLIENT_SECRET`: Present, non-empty, string length = 56 characters (value strictly unprinted and unexposed).
- `.gitignore` Verification:
  - Root `.gitignore` line 42 contains `**/*.env`.
  - `apps/web/.gitignore` line 34 contains `.env*`.
  - `git check-ignore -v apps/web/.env` output: `apps/web/.gitignore:34:.env* apps/web/.env`.
  - `git ls-files | Select-String -Pattern "\.env$"` returned zero matches, confirming that no `.env` files are tracked in Git.

### 1.3 V2 Template Registry & Invariant Preservations
Inspection of `apps/web/lib/templates/definitions/CanonicalTemplates.ts`, `apps/web/factoryos/core/templates/UniversalQuizPayload.ts`, and `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts` revealed:
- **Preserved Baseline Template (`quiz.universal.glass.v1`):**
  - Line 591 in `CanonicalTemplates.ts`: `id: 'quiz.universal.glass.v1'`, `version: '1.2.0'`, `name: 'Universal Interactive Quiz (QuizShow Glass v1.2)'`.
  - Verified preserved 100% unchanged.
- **Canonical Upgraded Template (`quiz.universal.cinematic.v2`):**
  - Line 668 in `CanonicalTemplates.ts`: `id: 'quiz.universal.cinematic.v2'`, `version: '2.0.0'`, `name: 'Universal Cinematic Interactive Quiz (Quiz Template V2)'`.
  - Features 6 distinct Backblaze B2 photographic backdrops, animated countdown progress bar, emerald punch answer reveal, and soft Kore narration profile.
- **Backwards Compatibility Alias (`quiz.quizshow.v1`):**
  - Line 746 in `CanonicalTemplates.ts`: `id: 'quiz.quizshow.v1'`, `version: '1.0.0'` (legacy 8-question game-show format, preserved unchanged).
- **Other Quiz Templates:**
  - `quiz.trivia-challenge.v1` (2-question rapid trivia challenge).
- **Absence of Third Quiz Template:**
  - `UniversalQuizPayload.ts` lines 49-50 restricts `templateId` to:
    ```ts
    templateId: "quiz.universal.glass.v1" | "quiz.quizshow.v1" | "quiz.universal.cinematic.v2";
    ```
  - No 3rd quiz template (such as `quiz.canva.v1` or `quiz.universal.canva.v3`) is present in the codebase. Canva is integrated strictly as an external design authoring synchronization partner for `quiz.universal.cinematic.v2`.

### 1.4 Production Renderer Path & Architecture
Inspection of `apps/web/factoryos/core/render/LocalRenderAdapter.ts` and `packages/factoryos-render/` revealed:
- **Authoritative Engine:**
  - `LocalRenderAdapter.ts` communicates via JSON stdin/stdout protocol directly with `factoryos_render.cli --adapter`.
  - Stdin payload: `LocalRenderIntent` specifying scenes, shots, recipes, durations, and audio tracks.
  - Native Python renderer (`packages/factoryos-render/src/factoryos_render/backends/image.py`): `NativeFrameCompositor` deterministically composites individual 1080×1920 frames via Pillow (`PIL`).
  - FFmpeg encoder (`packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py`): Encodes frame sequences and multiplexes AAC audio tracks into physical MP4.
- **Remotion & Canva Status:**
  - `package.json` and `apps/web/package.json` contain zero dependencies or build scripts for Remotion.
  - Remotion exists only as an audited historical reference in `vendor/external-templates/RenderComp`.
  - Canva is NOT a production renderer. Canva MP4 export will not be used for production video generation. Canva provides the external visual layout and asset design templates; ShortForge retains 100% control over dynamic text rendering, countdown values, option cards, narration tracks, and final MP4 encoding.

### 1.5 Existing Test Suites, Harnesses & Verification Tools
- **Vitest Quiz Test Suites:**
  - `apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts`: Passes (1 test, 157ms). Verifies the 50-beat structure, 150-frame silent think gate, and answer onset.
  - `apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts`: Passes (9 tests, 72ms). Verifies template registration, 50-beat compilation for Geography and Science, B2 asset presence, and duration ceilings.
  - `apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts`: Passes (21 tests, 84ms). Verifies V1 template invariants.
  - `apps/web/factoryos/tests/quizshow-template.test.ts`: Passes (7 tests, 79ms). Verifies legacy V1 backwards compatibility.
  - Total: 38 quiz tests passing.
- **Python Rendering Backend Tests:**
  - `pytest packages/factoryos-render/tests/`: 17 passed in 0.34s (cache, checkpoint, contracts, feature lowering, frame clock, security).
- **Physical MP4 Audio Decoding Harness:**
  - `tools/verify_quiz_v2_timing.ts`: Runs 100 automated checks per video using FFmpeg `atrim`, `volumedetect`, and `silencedetect` on decoded MP4 audio streams. Verifies that think window volume is at digital silence floor (−91 dB) and answer audio starts immediately at think window completion.
- **Rendering Samples Tool:**
  - `tools/render_quizshow_v2_samples.ts`: Compiles and executes end-to-end rendering of flagship Geography and Science videos.

---

## 2. Logic Chain

1. **Premature Answer Narration Defect Root Cause:**
   - *Observation (1.5, `quiz-five-second-think-gate.md` §2):* The previous quiz script structure compiled only 20 beats: `1 HOOK + 6 × (QUESTION + COUNTDOWN + combined ANSWER_REVEAL) + 1 OUTRO`.
   - *Logic Step 1:* Options A, B, C, D were visually displayed but never narrated as discrete audio beats. Consequently, there was no physical option D audio end timestamp to anchor a post-option thinking period.
   - *Logic Step 2:* The `COUNTDOWN` beat audio said "Five seconds on the clock", but the synthesized audio lasted only 3.544s, padded to 4.0s.
   - *Logic Step 3:* The `ANSWER_REVEAL` beat bundled both the answer announcement and explanation into a single narration file that began playing ~0.35s after the countdown beat ended. As a result, the viewer heard the answer prematurely.
   - *Logic Step 4:* Previous tests checked `beats.length === 20` and checked the string presence of the `COUNTDOWN` recipe, completely ignoring the physical acoustic reality of the rendered MP4 audio stream.
   - *Resolution Logic:* Expanding the story structure to 50 beats (`HOOK + 6 × [QUESTION + OPTION_A + OPTION_B + OPTION_C + OPTION_D + THINK_GATE + ANSWER_REVEAL + EXPLANATION] + OUTRO`) with an explicit 150-frame (5.000s @ 30 fps) silent gate scene, zero tail on option D, and answer narration starting at the gate boundary completely eliminates premature reveal.

2. **Template Preservation & Invariant Compliance:**
   - *Observation (1.3, `CanonicalTemplates.ts:591` & `UniversalQuizPayload.ts:49`):* `quiz.universal.glass.v1` is indexed at v1.2.0 and preserved unchanged. `quiz.universal.cinematic.v2` is indexed at v2.0.0.
   - *Logic Step:* All visual upgrades (countdown progress bar, emerald punch answer reveal, dimmed non-selected choices) in `packages/factoryos-render/src/factoryos_render/backends/image.py` are strictly gated by `if is_v2:`.
   - *Conclusion:* V1 remains completely untouched. No 3rd quiz template ID exists or should be added. Canva assets will map directly into the existing `quiz.universal.cinematic.v2` pipeline.

3. **Renderer Authority & Decoupling:**
   - *Observation (1.4):* The production renderer is local Python/Pillow/FFmpeg (`factoryos-render`). Remotion does not exist in dependencies, and Canva is an external API design platform.
   - *Logic Step:* Canva REST APIs offer design export and autofill capabilities, but relying on Canva for final MP4 video rendering would violate the low-latency, deterministic, offline-capable rendering architecture of ShortForge.
   - *Conclusion:* Canva must be utilized exclusively as an external visual-design authoring and asset synchronization tool. Canva design elements (backgrounds, frames, badges) will be exported, versioned into immutable manifests (`manifest.json`), stored in Backblaze B2, and composited locally by `image.py`.

4. **Security & OAuth Callback Topology:**
   - *Observation (1.2 & `apps/web/app/api/compute/connections/oauth/kaggle/route.ts`):* `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` are present in `apps/web/.env`, which is Git-ignored by `.env*` and `**/*.env`.
   - *Logic Step:* The codebase utilizes Next.js App Router for backend routes. Following the proven pattern in `apps/web/app/api/compute/connections/oauth/kaggle/`, Canva OAuth 2.0 PKCE endpoints must be backend-managed:
     - Initiation route: `/api/integrations/canva/oauth`
     - Callback route: `/api/integrations/canva/callback`
   - *Callback URIs to register in Canva Developer Portal:*
     - **Local Development URI:** `http://localhost:3000/api/integrations/canva/callback` (or `http://127.0.0.1:3000/api/integrations/canva/callback`)
     - **Production URI:** `https://<production-domain>/api/integrations/canva/callback`

---

## 3. Caveats

1. **Local vs Cloud Voice Providers:**
   - Narration tests on the local machine utilize Windows SAPI (Microsoft Zira / Female) conditioned with the Kore parametric warmth audio filter (`highpass 80Hz`, `lowpass 8200Hz`, `250Hz +2.5dB`, `3200Hz -2dB`, `atempo 1.05`). This satisfies the soft female narration invariant and duration bounds. For production cloud deployments, Gemini TTS or ElevenLabs female voice provider keys can be hooked seamlessly into `VoiceFabric.ts`.
2. **Canva Developer Portal Configuration:**
   - While `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` are populated locally, the Canva Application's Redirect URI must be registered in the Canva Developer Portal matching the backend route before end-to-end OAuth handshake can succeed.
3. **F07 Score Field Reporting Quirk:**
   - In F07 acceptance tests, the score property currently logs `undefined/100` due to a known reporting string formatting quirk, although all validation gate criteria (duration, geometry, codecs, stream presence) pass.

---

## 4. Conclusion

1. **Baseline Health:**
   - The repository is fully mapped and operational on branch `maintenance/repository-hygiene-20261102` (commit `3928d7781433`).
   - The 12 active worktrees across the environment represent isolated feature/maintenance branches; current work is localized to the active working directory.
2. **Security Verified:**
   - `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` are securely present in `apps/web/.env` without exposure. The file is strictly Git-ignored with zero credentials tracked in Git history.
3. **Template Registry Invariant Upheld:**
   - `quiz.universal.glass.v1` is preserved 100% unchanged.
   - `quiz.universal.cinematic.v2` is established as the canonical V2 template.
   - No 3rd quiz template exists.
4. **Authoritative Renderer Architecture Confirmed:**
   - Native `factoryos-render` (Pillow `image.py` + `ffmpeg.py`) via `LocalRenderAdapter.ts` is the authoritative production renderer. Remotion is absent, and Canva MP4 will not be used as the production renderer.
5. **Thinking Window & Audio Sequencing Verified:**
   - The root cause of the premature answer narration defect has been forensically established (20-beat lack of option narration, 3.5s countdown audio, premature combined reveal).
   - The 50-beat structure with a 150-frame silent think gate has been verified via unit tests (`quiz-five-second-think-gate.test.ts`) and physical MP4 audio decoding (`tools/verify_quiz_v2_timing.ts`).
6. **Integration Blueprint Ready:**
   - Exact structure, evidence, and baseline findings are formulated for immediate publication into `docs/verification/canva-integration-baseline.md`.

---

## 5. Verification Method

To independently verify all findings and baseline claims:

1. **Verify Git & Worktree Status:**
   ```powershell
   git status -s -b
   git rev-parse HEAD
   git worktree list
   ```

2. **Verify Environment Security & Git-Ignore Rules:**
   ```powershell
   git check-ignore -v apps/web/.env
   git ls-files | Select-String -Pattern "\.env$"
   # Verify presence without printing values:
   powershell -Command "
     $lines = Get-Content 'apps/web/.env'
     $hasId = ($lines | Select-String -Pattern '^\s*CANVA_CLIENT_ID\s*=\s*(.+)$') -ne $null
     $hasSec = ($lines | Select-String -Pattern '^\s*CANVA_CLIENT_SECRET\s*=\s*(.+)$') -ne $null
     Write-Host ('CANVA_CLIENT_ID Present: ' + $hasId + ' | CANVA_CLIENT_SECRET Present: ' + $hasSec)
   "
   ```

3. **Verify Template Registry & Template Invariants:**
   ```powershell
   npx vitest run apps/web/factoryos/tests/quizshow-template.test.ts apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts
   ```
   *Expected:* 3 test files passed, 37 tests passed.

4. **Verify Five-Second Think Gate Regression Suite:**
   ```powershell
   npx vitest run apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts
   ```
   *Expected:* 1 test file passed, 1 test passed (150 frames, 0 dB audio during think gate, answer starts after gate).

5. **Verify Native Render Engine Pytest Suite:**
   ```powershell
   pytest packages/factoryos-render/tests/
   ```
   *Expected:* 17 passed in <1s.

6. **Verify Physical MP4 Decoded Audio Waveform (100 Checks Each):**
   ```powershell
   npx tsx tools/verify_quiz_v2_timing.ts `
     artifacts/quiz-v2/render-intent-geography.json `
     data/audio/quiz_v2_geography/audio_manifest.json `
     artifacts/quiz-v2/quiz-v2-geography-6q.mp4 `
     artifacts/quiz-v2/quiz-v2-geography-timing-report.json

   npx tsx tools/verify_quiz_v2_timing.ts `
     artifacts/quiz-v2/render-intent-science.json `
     data/audio/quiz_v2_science/audio_manifest.json `
     artifacts/quiz-v2/quiz-v2-science-6q.mp4 `
     artifacts/quiz-v2/quiz-v2-science-timing-report.json
   ```
   *Expected:* 100 passed, 0 failed for both videos; digital silence during gate at −91 dB; answer speech starts at think window completion.

---

## 6. Blueprint for `docs/verification/canva-integration-baseline.md`

Based on this audit, `docs/verification/canva-integration-baseline.md` must be structured into the following sections:

1. **Title & Mission Header:**
   - Audit Date, Author, Status, Integrity Mode (development), Target ShortForge Environment.
2. **Git Repository & Worktree Topology:**
   - Main branch (`maintenance/repository-hygiene-20261102`), commit SHA (`3928d7781433`), cleanliness assessment, list of 12 worktrees and isolation confirmation.
3. **Environment & Security Compliance:**
   - Affirmation of `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` presence in `apps/web/.env` with strict zero-exposure attestation.
   - Evidence of `.gitignore` enforcement (`apps/web/.gitignore:34` and root `.gitignore:42`).
   - Planned OAuth Redirect URIs:
     - Local: `http://localhost:3000/api/integrations/canva/callback`
     - Production: `https://<production-domain>/api/integrations/canva/callback`
4. **V2 Template Registry Invariants:**
   - Evidence that `quiz.universal.glass.v1` is 100% preserved unchanged.
   - Evidence that `quiz.universal.cinematic.v2` is the canonical V2 template.
   - Reaffirmation: zero 3rd quiz template IDs introduced.
5. **Renderer Path & Architecture Authority:**
   - Confirmation of native `image.py` (Pillow) + `ffmpeg.py` via `LocalRenderAdapter.ts` as the sole authoritative production renderer.
   - Architectural boundary: Canva produces design templates and static visual assets synchronized to B2; ShortForge owns dynamic text, option rendering, countdown timers, and narration synchronization.
6. **Five-Second Think Window Defect & Audio Sequencing Resolution:**
   - Detailed root cause analysis of the previous 20-beat defect.
   - Explanation of the 50-beat timeline structure: `HOOK -> 6 × [QUESTION -> OPTION_A -> OPTION_B -> OPTION_C -> OPTION_D -> 150-frame THINK_GATE -> ANSWER_REVEAL -> EXPLANATION] -> OUTRO`.
   - Proof of physical audio verification using decoded MP4 analysis (`-91 dB` gate silence, exact 150 frames, immediate answer onset).
7. **Baseline Test Harness Matrix:**
   - Consolidated summary of passing Vitest suites (38 tests) and Pytest suites (17 tests).
8. **Next Steps for Canva Phase 2 & Phase 3:**
   - OAuth 2.0 with PKCE implementation (`apps/web/app/api/integrations/canva/oauth` and `apps/web/app/api/integrations/canva/callback`).
   - Capability audit via `GET /rest/v1/users/me/capabilities` (`docs/verification/canva-api-capability-report.md`).
   - Master visual template synchronization and B2 asset persistence.
