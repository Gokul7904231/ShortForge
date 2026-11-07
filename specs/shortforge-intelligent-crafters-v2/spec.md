# SHORTFORGE / FACTORYOS — UNIFIED MASTER SPECIFICATION
## Exclusive Component Registry + Intelligent Template Crafter (F05) + Audio-First Narration Crafter (F04)

**Version:** 2.1.0  
**Canonical Trajectory:** `F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07`  
**Target Template ID:** `quiz.universal.cinematic.v2`  
**Baseline Invariant:** `quiz.universal.glass.v1` (Strictly preserved unchanged)  
**Multi-Engine Temporal Scope:** `Quiz`, `Facts`, `History`, `Motivation`  

---

## 1. Architectural Philosophy & Invariants

1. **FactoryOS Authority:** FactoryOS owns semantic planning, narrative structure, and temporal contracts.
2. **Render Fabric Authority:** Render Fabric (`F06`) owns execution, deterministic frame synthesis, and audio-video multiplexing.
3. **Physical Evidence as Ground Truth:** Physical artifacts (`real bytes + SHA-256 CAS digest + ffprobe + decode verification`) are the only source of truth. No heuristic estimates or mock passes.
4. **V1 Immutability:** Legacy Quiz V1 (`quiz.universal.glass.v1`) and frozen quiz generator cores remain untouched.

---

## 2. Exclusive ShortForge Component Registry (`sf.*`)

The component registry enforces strict single-panel geometry, bounding boxes on a 1080×1920 canvas, safe zones, Z-index ordering, and WCAG ≥ 7:1 contrast ratios:

| Component ID | Role | Z-Index | Canvas Plane | Bounding Box [x, y, w, h] | Contrast Contract |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sf.intro.opening_challenge_card` (`sf.hook.kinetic_stack`) | Opening Challenge Hook | 15 | Plane 1 | `[80, 240, 920, 800]` | `#FFFFFF` on dark navy scrim (≥ 12:1) |
| `sf.stage.b2_semantic_background` (`sf.stage.semantic_b2_bg`) | 6-Distinct B2 Subject Backdrops | 0 | Plane 0 | `[0, 0, 1080, 1920]` | 14% scrim preserving photographic vibrance |
| `sf.quiz.persistent_glass_stage` (`sf.quiz.question_glass_card`) | Single Persistent Question Card | 10 | Plane 1 | `[80, 280, 920, 1400]` | `#FFFFFF` on frosted blurred glass (≥ 14:1) |
| `sf.quiz.option_row` (`sf.quiz.option_matrix_4x1`) | 4-Choice Progressive Option Matrix | 20 | Plane 2 | `[105, 550, 870, 480]` | Letters A-D, Emerald highlight on reveal |
| `sf.quiz.thinking_timer` (`sf.timer.countdown_ring_5s`) | Dynamic Countdown Timer (5-4-3-2-1) | 30 | Plane 3 | `[480, 252, 120, 56]` | `#F59E0B` / `#EF4444` on glass (≥ 8:1) |
| `sf.quiz.inline_explanation` (`sf.payoff.explanation_drawer`) | Integrated Lower Explanation Drawer | 25 | Plane 3 | `[115, 1085, 850, 555]` | `#F8FAFC` 46px text + `#34D399` tag (≥ 10:1) |
| `sf.captions.accessibility_lane` | Dedicated Subtitle Lane (Guarded) | 35 | Plane 4 | `[120, 1720, 840, 70]` | Non-overlapping, suppressed on card bodies |
| `sf.outro.completion_cta_card` (`sf.outro.scoreboard_cta`) | Outro Scoreboard & Subscribe CTA | 40 | Plane 1 | `[80, 720, 920, 480]` | `#FFFFFF` on `#1E1B4BE6` (≥ 9:1) |
| `sf.brand.watermark_lock` | Permanent Brand Watermark | 99 | Plane 5 | `[940, 1800, 88, 88]` | Alpha 0.85, protected safe zone |

---

## 3. High-Intelligence Narration Crafter (`F02` + `F04`)

1. **Audio-First Physical Timing Engine:**
   - Synthesizes each narration segment independently using the warm, natural female Kore persona.
   - Decodes physical PCM samples to determine exact millisecond durations (`audioDurationMs = (sampleCount / sampleRate) * 1000`).
   - Generates signed `NarrationTimingLedger` with cryptographic integrity.
2. **Anti-Slop Guardrails:**
   - Bans word-count heuristics (`words / 2.5`).
   - Trims unnatural leading/trailing TTS silence.
   - Enforces 250ms anti-clipping safety pad on speech endings.
   - Strictly bans FFmpeg `-shortest` or `-t` cuts.

---

## 4. High-Intelligence Template Crafter (`F05`)

1. **Sequential Lifecycle State Machine (Zero Audio Leak):**
   For each question cycle $i \in \{1..6\}$:
   ```text
   Question visual appears
     → Question narration plays
     → Option A appears
     → Option B appears
     → Option C appears
     → Option D appears
     → All option visual entry completes
     → Thinking timer window runs (5.0s, counting 5-4-3-2-1)
     → Answer reveal activates (Option turned Emerald Green + Checkmark, unselected muted)
     → Answer reveal narration plays
     → Explanation drawer opens + explanation narration plays (46px font)
     → Explanation completes + tail pad
     → Transition to Question i+1 (or Outro CTA)
   ```
2. **Multi-Engine Temporal Grammar Support:**
   - **Quiz:** `Question → Options A–D → Thinking Interval → Answer Reveal → Explanation`
   - **Facts:** `Hook → Claim → Evidence → Explanation → CTA`
   - **History:** `Hook → Event → Cause → Consequence → Next Event`
   - **Motivation:** `Hook → Setup → Conflict → Turning Point → Lesson → CTA`

---

## 5. Physical Media Verification Gates (`F07`)

1. File existence and non-zero byte check.
2. FFprobe stream validation: 1080×1920 vertical format, H.264 video, AAC audio.
3. Decoded video duration matching planned audio-locked timeline within ±0.3s tolerance.
4. Total duration strictly within Shorts ceiling (≤ 180.0s).
5. 6 distinct Backblaze B2 background image verification.
6. Zero narration cut-offs on Hook, Explanations, and Outro CTA.
7. Verification of contact sheets proving all visual states.

