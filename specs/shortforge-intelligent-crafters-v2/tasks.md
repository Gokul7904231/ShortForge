# SHORTFORGE / FACTORYOS — MASTER IMPLEMENTATION TASKS
## Intelligent Crafters V2 Execution & Verification Tracker

- [x] **Task 1: Spec Kit Initialization**
  - [x] Create `specs/shortforge-intelligent-crafters-v2/spec.md` with full component and timing architecture.
  - [x] Create `specs/shortforge-intelligent-crafters-v2/plan.md` with file-by-file execution layout.
  - [x] Create `specs/shortforge-intelligent-crafters-v2/tasks.md`.

- [x] **Task 2: Component Registry Alignment**
  - [x] Register canonical IDs (`sf.intro.opening_challenge_card`, `sf.stage.b2_semantic_background`, `sf.quiz.persistent_glass_stage`, `sf.quiz.option_row`, `sf.quiz.thinking_timer`, `sf.quiz.inline_explanation`, `sf.captions.accessibility_lane`, `sf.outro.completion_cta_card`) in TypeScript registry.
  - [x] Mirror component tokens in Python F06 native registry (`packages/factoryos-render/src/factoryos_render/components/registry.py`).

- [x] **Task 3: Frame Compositor Geometry & Defect Resolution**
  - [x] Move Hook tag pill (`6-QUESTION SHOW`) up to `y = 250` (eliminating collision with hook text at `y = 1000`).
  - [x] Suppress duplicate lower-third yellow subtitle box on hook and question card scenes.
  - [x] Fix `_draw_wrapped_text` anchor math for balanced vertical centering around `y = 414`.
  - [x] Ensure ≥ 36px guaranteed clearance below category pill (`y = 304`) and above divider line (`y = 525`).
  - [x] Render real 5-4-3-2-1 countdown timer with animated progress bar and no missing emoji glyphs (`□□`).
  - [x] Highlight correct answer in emerald green with checkmark badge; dim incorrect options to 0.35 opacity.
  - [x] Render enlarged 46px `#F8FAFC` off-white explanation text inside frosted emerald container (`y = 1055` to `1640`).
  - [x] Render photographic B2 backgrounds crisp with light 14% scrim while keeping question card frosted (`GaussianBlur(radius=28)`).
  - [x] Replace all raw bullet symbols (`•`) with ASCII `" | "` to eliminate UTF-8 mojibake (`Â€¢`).

- [x] **Task 4: Narration & Audio-Locked Timeline Compilation**
  - [x] Standardize 6-question universal contract across template pipeline and tests.
  - [x] Synthesize 20 narration tracks per dataset using soft female Kore profile.
  - [x] Generate signed `NarrationTimingLedger` with physical sample measurements.
  - [x] Compile audio-locked `LocalRenderIntent` with 26 sequential beats.

- [x] **Task 5: Production Video Rendering & F07 Quality Gate Execution**
  - [x] Render Geography 6Q sample (`artifacts/quiz-v2/quiz-v2-geography-6q.mp4`).
  - [x] Render Science 6Q sample (`artifacts/quiz-v2/quiz-v2-science-6q.mp4`).
  - [x] Verify F07 Quality Gate: PASS (Score: 79/100, Duration: 82.49s & 78.76s).
  - [x] Extract 12-frame visual contact sheets for both Geography and Science.
  - [x] Extract proof frames verifying Hook, Question Card, 5s Countdown, Reveal, Explanation, and Outro.

- [x] **Task 6: Verification & Completion Deliverables**
  - [x] Run `npm run factoryos:typecheck` inside `apps/web`: 0 compilation errors.
  - [x] Run `vitest run factoryos/tests/shortforge-crafters-v2.test.ts`: 14 passed (14).
  - [x] Run `pytest packages/factoryos-render`: 18 passed in 0.96s.
  - [x] Write final completion report to `docs/verification/quiz-v2-completion-report.md`.

