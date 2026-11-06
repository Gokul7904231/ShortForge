# SHORTFORGE ENGINEERING PLAN: High-Intelligence Template & Narration Crafters V2

**Version:** 2.0.0  
**Target:** `quiz.universal.cinematic.v2`  
**Baseline Preservation:** `quiz.universal.glass.v1`  

---

## 1. Architecture & Component Flow

```
+--------------------------------------------------------------------------------+
| Floor 02 (Scripting) & Floor 03 (Asset Realization)                            |
| - Generates verified 6-question quiz payload with citations and 6 B2 images   |
| - F03 verifies B2 images (SHA-256 integrity, local cache path)                |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
| High-Intelligence Narration Crafter (F04 + F02 Feedback)                       |
| - VoiceCalibrationProfile (Warm female Kore / Neural2)                         |
| - Discrete Segment Audio Synthesis (WAV PCM 16-bit)                           |
| - Silence Trimmer & Loudness Normalization (-14 LUFS, 250ms Tail Pad)          |
| - Physical duration probe (ffprobe) -> NarrationTimingLedger                   |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
| High-Intelligence Template Crafter (F05)                                       |
| - Ingests NarrationTimingLedger & AssetPlanIR                                  |
| - Audio-Locked State Sequencing (Hook -> Stem -> Options -> Think -> Reveal    |
|   -> Explanation -> Outro)                                                     |
| - Pre-Render Layout Collision & Contrast Solver                                |
| - Emits LocalRenderIntent with Exclusive Component bindings                    |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
| Exclusive ShortForge Component Registry in F06 (factoryos-render)              |
| - sf.hook.kinetic_stack                                                        |
| - sf.stage.semantic_b2_bg                                                      |
| - sf.quiz.question_glass_card (Singleton, font auto-scaling)                   |
| - sf.quiz.option_matrix_4x1 (State-machine stagger, pulse, emerald reveal)     |
| - sf.timer.countdown_ring_5s (Clean unmount at t=5s)                           |
| - sf.payoff.explanation_drawer (Mounts post-reveal)                            |
| - sf.outro.scoreboard_cta                                                      |
| - sf.brand.watermark_lock                                                      |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
| Hardened F07 Physical Verification Gates                                       |
| - Scene 0 (t=0.5s) & Outro CTA (final 1.5s) present                            |
| - Total video >= lastSpokenWordEnd + 400ms                                     |
| - 6 distinct non-blank B2 backgrounds verified                                 |
| - Zero audio truncation & zero dead air outside countdown                      |
+--------------------------------------------------------------------------------+
```

---

## 2. File-by-File Modification & Creation Plan

### 2.1 Component Registry (TypeScript & Python)
1. **TypeScript Registry Contract:**
   - Create `apps/web/factoryos/core/templates/components/ShortForgeComponentRegistry.ts`:
     Declares all 8 components, safe-zone bounding boxes, Z-index layers, contrast ratios, and validation logic.
2. **Python F06 Native Compositor Upgrades:**
   - Create `packages/factoryos-render/src/factoryos_render/components/registry.py`:
     Python representation and layout bounds validator for the 8 exclusive components.
   - Modify `packages/factoryos-render/src/factoryos_render/backends/image.py`:
     Support exclusive component layout rendering (`sf.hook.kinetic_stack`, `sf.stage.semantic_b2_bg`, `sf.quiz.question_glass_card`, `sf.quiz.option_matrix_4x1`, `sf.timer.countdown_ring_5s`, `sf.payoff.explanation_drawer`, `sf.outro.scoreboard_cta`, `sf.brand.watermark_lock`), implementing Ken Burns dynamic zoom, font auto-scaling (56px -> 40px), emerald highlight 1.04x scaling and opacity dimming on unselected options, singleton card enforcement, and mutually exclusive countdown/explanation drawer mounting.

### 2.2 High-Intelligence Narration Crafter (F02 + F04)
1. Create `apps/web/factoryos/core/voice/NarrationCrafter.ts`:
   - `VoiceCalibrationProfile` definition and voice configuration.
   - Python synthesis & acoustic trimming pipeline invocation (`tools/synthesize_quizshow_v2_audio.py` updated with surgical VAD/silence trimming, -14 LUFS loudness normalization, 250ms zero-amplitude safety tail padding, and `ffprobe` duration measurement).
   - `NarrationTimingLedger` generator and signer.

### 2.3 High-Intelligence Template Crafter (F05)
1. Create `apps/web/factoryos/core/templates/TemplateCrafter.ts`:
   - Consumes `NarrationTimingLedger` and question dataset.
   - Computes deterministic scene timings strictly tied to measured speech anchors.
   - Deterministic pre-render layout solver (collision assertions, singleton assertions, contrast verification).
2. Wire into `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`:
   - Integrate `TemplateCrafter` with `compileLocalRenderIntent` for `quiz.universal.cinematic.v2`.

### 2.4 Upgraded F07 Physical Verification Gates
1. Update `apps/web/factoryos/core/verification/VerificationEngine.ts`:
   - Add media audit gates:
     - `startEndCompleteness`: Scene 0 present at t=0.5s, Outro present during final 1.5s, video duration >= last spoken word + 400ms.
     - `zeroCutOffAudit`: Validates audio track bounds against scene bounds.
     - `visualIntegrityAudit`: Checks for 6 distinct B2 assets, watermark presence, and absence of overlapping question boxes.

### 2.5 Unit Tests & Verification
1. Create `apps/web/factoryos/tests/shortforge-crafters-v2.test.ts`:
   - Tests Component Registry boundaries, safe zones, and contrast contracts.
   - Tests `NarrationCrafter` voice calibration, audio trimming, and timing ledger generation.
   - Tests `TemplateCrafter` audio-locked sequencing and collision/singleton solver.
   - Tests F07 physical gates with valid and invalid artifacts.
2. Execute end-to-end rendering tool `tools/render_quizshow_v2_samples.ts` for Geography and Science, extract keyframes, create contact sheets, and audit the generated MP4.
