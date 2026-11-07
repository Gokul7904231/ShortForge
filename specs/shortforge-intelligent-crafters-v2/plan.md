# SHORTFORGE / FACTORYOS — MASTER IMPLEMENTATION PLAN
## Intelligent Crafters V2: Architecture, Lowering & Verification Gates

**Canonical Path:** `F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07`  
**Target:** `quiz.universal.cinematic.v2`  

---

## 1. File Structure & Responsibilities

1. **Component Registry (`apps/web/factoryos/core/templates/components/ShortForgeComponentRegistry.ts`):**
   - Maps both canonical IDs (`sf.intro.opening_challenge_card`, `sf.stage.b2_semantic_background`, `sf.quiz.persistent_glass_stage`, `sf.quiz.option_row`, `sf.quiz.thinking_timer`, `sf.quiz.inline_explanation`, `sf.captions.accessibility_lane`, `sf.outro.completion_cta_card`) and existing alias tokens.
   - Enforces bounding boxes, safe-zones, and single-panel invariants.

2. **Python F06 Native Compositor (`packages/factoryos-render/src/factoryos_render/backends/image.py`):**
   - Implements two-character anchor-balanced `_draw_wrapped_text` preventing vertical text collision.
   - Centers question text at `y = 414` with guaranteed ≥ 36px clearance from top pill and bottom divider.
   - Renders 5-4-3-2-1 countdown timer with animated progress bar and no broken emoji glyphs (`□□`).
   - Renders emerald green correct option highlight with checkmark badge.
   - Renders enlarged 46px `#F8FAFC` off-white explanation text inside frosted emerald container (`y = 1055` to `1640`).
   - Keeps photographic B2 background crisp and vibrant (14% scrim) with blurred frosted question card.

3. **Narration Crafter (`apps/web/factoryos/core/voice/NarrationCrafter.ts` & `tools/synthesize_quizshow_v2_audio.py`):**
   - Segment-level TTS synthesis using soft female Kore profile.
   - Physical audio measurement and `NarrationTimingLedger` generation.

4. **Template Crafter (`apps/web/factoryos/core/templates/TemplateCrafter.ts`):**
   - Audio-locked `LocalRenderIntent` compilation.
   - 26-beat sequential lifecycle: 1 Hook + 6 × (Question, Think 5s, Reveal, Explanation) + 1 Outro.

5. **Physical Verification Engine (`apps/web/factoryos/core/verification/VerificationEngine.ts`):**
   - F07 automated audit validating duration, B2 images, silence, and stream properties.

---

## 2. Dependency Ordering & Execution Phasing

- **Phase 1: Component Registry Alignment**
  - Register all `sf.*` component contracts in TypeScript and Python.
  - Verify WCAG contrast contracts.

- **Phase 2: Frame Compositor Geometry Verification**
  - Test `image.py` against 1-line, 2-line, 3-line question texts and 1-4 line explanation texts.
  - Verify zero-collision bounds.

- **Phase 3: Production Render Execution**
  - Render Geography 6Q sample (`quiz-v2-geography-6q.mp4`).
  - Render Science 6Q sample (`quiz-v2-science-6q.mp4`).

- **Phase 4: F07 Media Verification & Proof Extraction**
  - Extract proof frames for Hook, Question Card, 5s Countdown, Reveal, Explanation, and Outro.
  - Generate 12-frame visual contact sheets.
  - Run `factoryos:typecheck`, `shortforge-crafters-v2.test.ts`, and `pytest`.
  - Write comprehensive completion report to `docs/verification/quiz-v2-completion-report.md`.

