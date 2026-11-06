# SHORTFORGE TASKS: Master Engineering Mission Implementation

**Version:** 2.0.0  
**Target:** `quiz.universal.cinematic.v2`  

---

## Task Checklist & Dependency Ordering

- [x] **Task 0: Workspace Safety & Feature Branch Setup**
  - Verify git status, branch, and stash list.
  - Checkout feature branch `feat/intelligent-template-narration-crafters-v2`.
  - Preserve `quiz.universal.glass.v1` and do not drop existing stashes or artifacts.

- [x] **Task 1: SpecKit Lifecycle Artifacts**
  - [x] Create `specs/shortforge-crafters-v2/spec.md`.
  - [x] Create `specs/shortforge-crafters-v2/plan.md`.
  - [x] Create `specs/shortforge-crafters-v2/tasks.md`.

- [x] **Task 2: Exclusive ShortForge Component Registry**
  - [x] Implement `apps/web/factoryos/core/templates/components/ShortForgeComponentRegistry.ts` with all 8 component contracts:
    - `sf.hook.kinetic_stack`
    - `sf.stage.semantic_b2_bg`
    - `sf.quiz.question_glass_card` (singleton, font auto-scaling)
    - `sf.quiz.option_matrix_4x1` (4-state machine: HIDDEN, STAGGER_ENTER, THINKING_PULSE, ANSWER_REVEAL)
    - `sf.timer.countdown_ring_5s` (mutually exclusive with explanation drawer)
    - `sf.payoff.explanation_drawer`
    - `sf.outro.scoreboard_cta`
    - `sf.brand.watermark_lock`
  - [x] Implement `packages/factoryos-render/src/factoryos_render/components/registry.py`.
  - [x] Update `packages/factoryos-render/src/factoryos_render/backends/image.py` with native rendering of all 8 components, font auto-scaling, Ken Burns zoom, emerald 1.04x highlight, unselected option dimming to 0.35 opacity, countdown unmount, and watermark locking.

- [x] **Task 3: High-Intelligence Narration Crafter (F02 + F04)**
  - [x] Create `apps/web/factoryos/core/voice/NarrationCrafter.ts` with `VoiceCalibrationProfile`, granular segment synthesis protocol, and `NarrationTimingLedger`.
  - [x] Update `tools/synthesize_quizshow_v2_audio.py` to support surgical silence trimming (strip leading dead air > 50ms, trailing dead air > 100ms, pause compression > 350ms to 140ms, loudness normalization to -14 LUFS, 250ms zero-amplitude safety tail padding, and `ffprobe` duration measurement).

- [x] **Task 4: High-Intelligence Template Crafter (F05)**
  - [x] Create `apps/web/factoryos/core/templates/TemplateCrafter.ts` consuming `NarrationTimingLedger`.
  - [x] Implement audio-locked state sequencing:
    - Scene 0: `measuredAudioMs(scene0_hook) + 250ms`.
    - Question i: Stem + Options staggered -> Thinking Window 5.0s -> Answer Reveal `measuredAudioMs(reveal) + 250ms` -> Explanation `measuredAudioMs(explanation) + 300ms`.
    - Outro: `measuredAudioMs(outro) + 500ms`.
  - [x] Implement deterministic pre-render layout solver (collision assertions, singleton assertions, contrast verification).
  - [x] Wire `TemplateCrafter` into `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`.

- [x] **Task 5: Upgrade F07 Physical Verification Gates**
  - [x] Upgrade `VerificationEngine.ts` with:
    - Start & End Completeness Gate (Scene 0 at 0.5s, Outro in final 1.5s, video duration >= last spoken word + 400ms).
    - Zero Cut-Off & Silence Audit (no audio truncated, no unplanned dead air > 600ms outside think window).
    - Visual Integrity & 6-Image B2 Audit (6 distinct B2 background images, bottom-right watermark, no duplicate question boxes).

- [x] **Task 6: Unit & Integration Test Suite**
  - [x] Create `apps/web/factoryos/tests/shortforge-crafters-v2.test.ts`.
  - [x] Verify with `npm run factoryos:typecheck` and vitest (72/72 tests passing).
  - [x] Verify pytest on `packages/factoryos-render` (18/18 tests passing).

- [x] **Task 7: End-to-End Render Proof & Contact Sheet Generation**
  - [x] Execute `tools/render_quizshow_v2_samples.ts` for Geography and Science.
  - [x] Verify physical MP4 artifacts and F07 compliance report (PASS score 83/100).
  - [x] Verify contact sheets with key moments: Hook (t=1.0s), Question + 4 Options + Countdown, Answer Reveal emerald highlight, Explanation Drawer, Outro Scoreboard/CTA.
