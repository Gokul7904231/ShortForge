# SHORTFORGE SPECIFICATION: Exclusive Component Registry + High-Intelligence Template Crafter + Closed-Loop Narration Crafter

**Version:** 2.0.0  
**Target Template ID:** `quiz.universal.cinematic.v2`  
**Baseline Invariant:** `quiz.universal.glass.v1` (Strictly preserved without modification)  
**Pipeline DAG:** `F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07`  

---

## 1. Scope & Objective

Deliver an enterprise-grade, deterministic, zero-slop rendering and narration architecture for ShortForge Quiz Shorts (`quiz.universal.cinematic.v2`).
This specification defines:
1. **The Exclusive ShortForge Component Registry:** 8 bounded, versioned native UI primitives with deterministic Z-indices, bounding boxes on 1080×1920 canvas, WCAG ≥ 7:1 contrast ratios, and state machine triggers.
2. **The High-Intelligence Closed-Loop Narration Crafter (F02 + F04):** Segment-level TTS synthesis, acoustic anti-slop silence trimming (VAD, leading/trailing dead air removal, pause compression, -14 LUFS normalization, 250ms anti-clipping safety tail pad), physical probe feedback loop, and signed `NarrationTimingLedger`.
3. **The High-Intelligence Template Crafter (F05):** Audio-locked timing solver converting `NarrationTimingLedger` and F03 `AssetPlanIR` into `CompositionIR` with zero audio-visual desync, layout collision avoidance, and singleton component guarantees.
4. **Hardened F07 Physical Verification Gates:** Complete start/end validation, silence and cut-off audit, 6-distinct B2 background image verification, and watermark compliance.

---

## 2. Exclusive ShortForge Component Registry Schema

Every component implements the `ShortForgeComponentDefinition` contract:

```typescript
export interface ComponentBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  maxHeight?: number;
  padding?: number;
}

export interface ShortForgeComponentDefinition {
  id: string;
  name: string;
  version: string;
  zIndex: number;
  safeZone: ComponentBoundingBox;
  contrastRatioContract: {
    minRatio: number; // e.g., 7.0 for WCAG AAA
    foregroundHex: string;
    backgroundScrimHex: string;
  };
  supportedStates: string[];
  singleton: boolean;
}
```

### The 8 Canonical Components:
1. **`sf.hook.kinetic_stack` (Scene 0 Opening Hook):**
   - Z-Index: 15
   - Bounding Box: `x: 80, y: 640, width: 920, height: 640`
   - Contrast Contract: Foreground `#FFFFFF` on `#0B1220E6` (Ratio ≥ 12:1).
   - Audio Lock: `sceneDurationMs >= hookAudioMs + 200ms`.
2. **`sf.stage.semantic_b2_bg` (Dynamic Background Layer):**
   - Z-Index: 0 (Backdrop) + Z-Index 1 (Dark Navy Scrim `#0B1220CC` / alpha 204).
   - Bounding Box: Full canvas `1080×1920`.
   - Contrast Contract: Guarantees background luminance allows foreground text contrast ≥ 7:1.
   - Behavior: 6 verified distinct B2 photographic assets for 6 questions with SHA-256 validation and Ken Burns subtle pan/zoom.
3. **`sf.quiz.question_glass_card` (Single-Instance Question Container):**
   - Z-Index: 10
   - Bounding Box: `x: 60, y: 340, width: 960, maxHeight: 380, padding: 40`
   - Contrast Contract: Foreground `#FFFFFF` on translucent glass `#0B1220F0` (Ratio ≥ 14:1).
   - Invariant: Exactly 1 card mounted per question cycle. Auto-scales font `56px → 40px` for >3 lines. Zero nested double-boxes.
4. **`sf.quiz.option_matrix_4x1` (State-Machine Answer Cards):**
   - Z-Index: 20
   - Bounding Box: `x: 85, y: 760, width: 910, height: 520` (4 tiles at 125px vertical stride).
   - States: `HIDDEN`, `STAGGER_ENTER`, `THINKING_PULSE`, `ANSWER_REVEAL`.
   - Reveal State: Correct option scaled 1.04x with emerald highlight `#22C55E` (`rgba(16, 95, 48, 0.95)`), incorrect options dimmed to `opacity: 0.35`.
5. **`sf.timer.countdown_ring_5s` (Precision Thinking Clock):**
   - Z-Index: 30
   - Center Anchor: `centerX: 540, centerY: 1420` (Radius: 65px), progress bar at divider.
   - Mutually Exclusive Mount: Unmounts immediately at `t = 5000ms`, forbidden from co-existing with `sf.payoff.explanation_drawer`.
6. **`sf.payoff.explanation_drawer` (Micro-Fact Payoff Card):**
   - Z-Index: 25
   - Bounding Box: `x: 80, y: 1390, width: 920, height: 160`
   - Contrast Contract: Foreground `#38BDF8` / `#FFFFFF` on `#050A14FA` (Ratio ≥ 10:1).
   - Mount Rule: Mounts only during Phase D (Explanation), after countdown timer unmounts.
7. **`sf.outro.scoreboard_cta` (Scoreboard & Subscribe Finisher):**
   - Z-Index: 40
   - Bounding Box: `x: 80, y: 720, width: 920, height: 480`
   - Content: "How many did you get right out of 6? Comment your score & Subscribe!"
   - Hold Rule: Video holds on screen until final spoken outro audio end + mandatory `500ms` tail buffer.
8. **`sf.brand.watermark_lock` (Permanent Brand Layer):**
   - Z-Index: 99
   - Bounding Box: `x: 940, y: 1800, width: 88, height: 88` (`bottom: 80, right: 60`, opacity: 0.85).
   - Invariant: Zero captions or drawers may intersect `[880, 1740, 1080, 1920]`.

---

## 3. High-Intelligence Narration Crafter (F02 + F04) Specification

### 3.1 Universal Voice Calibration Profile
```typescript
export interface VoiceCalibrationProfile {
  voiceId: string;
  provider: "GOOGLE" | "SAPI" | "EDGE" | "SYSTEM";
  supportsSSML: boolean;
  basePaceMultiplier: number;
  pitchAdjust: number;
  targetLufs: number; // -14 LUFS standard
  maxBreathPauseMs: number; // 140ms
  tailSafetyPadMs: number; // 250ms
}
```

### 3.2 Granular Segment Synthesis
Instead of 1 monolithic audio track or naive word estimates, each beat synthesizes a discrete, probe-verified segment:
- `scene0_hook.wav`
- For each question $i \in \{1..6\}$:
  - `q{i}_card.wav` (Stem)
  - `q{i}_opt_a.wav`
  - `q{i}_opt_b.wav`
  - `q{i}_opt_c.wav`
  - `q{i}_opt_d.wav`
  - `q{i}_reveal.wav`
  - `q{i}_explanation.wav`
- `scene_final_outro_cta.wav`

### 3.3 Surgical Silence Trimming & AntiSlop Audio Conditioning
Pipeline order:
1. Raw synthesis (TTS engine).
2. Acoustic filter chain: highpass 80Hz, lowpass 8200Hz, presence EQ.
3. Silence & Dead Air Trimmer:
   - Leading silence > 50ms trimmed to 0ms.
   - Trailing silence > 100ms trimmed to 100ms natural decay.
   - Internal pauses > 350ms compressed to 140ms.
4. Loudness Normalization: `-14 LUFS` target, `-1.5 dBFS` true peak.
5. 250ms Zero-Amplitude Safety Tail Pad: physically prevents final consonant clipping.
6. Exact physical duration measurement via `ffprobe` format/stream inspection.

### 3.4 Signed `NarrationTimingLedger`
```typescript
export interface SegmentTimingRecord {
  segmentId: string;
  beatId: string;
  narrationText: string;
  rawDurationMs: number;
  trimmedDurationMs: number;
  safetyTailMs: number;
  finalAudioDurationMs: number;
  audioPath: string;
  sha256: string;
}

export interface NarrationTimingLedger {
  version: "2.0.0";
  jobId: string;
  voiceProfile: VoiceCalibrationProfile;
  totalAudioDurationMs: number;
  totalVideoDurationMs: number;
  segments: Record<string, SegmentTimingRecord>;
  anchors: {
    anchor_hook_end_ms: number;
    anchor_q_opt_d_ends_ms: number[];
    anchor_q_reveal_ends_ms: number[];
    anchor_outro_end_ms: number;
  };
  signature: string;
}
```

---

## 4. High-Intelligence Template Crafter (F05) Specification

### 4.1 Audio-Locked State Sequencing
The Template Crafter maps the `NarrationTimingLedger` deterministically into scene durations:
- **Scene 0 (Hook):** Duration = `ledger.segments['scene0_hook'].finalAudioDurationMs / 1000 + 0.250`.
- **Question Cycle $i$ (1..6):**
  - Stem & Options: Stagger A, B, C, D to exact spoken beats.
  - Thinking Window: Strict 5.000s duration starting immediately after Option D audio ends.
  - Answer Reveal: Duration = `ledger.segments['q' + i + '_reveal'].finalAudioDurationMs / 1000 + 0.250`.
  - Explanation: Duration = `ledger.segments['q' + i + '_explanation'].finalAudioDurationMs / 1000 + 0.300`.
- **Final Scene (Outro):** Duration = `ledger.segments['scene_final_outro_cta'].finalAudioDurationMs / 1000 + 0.500`.

### 4.2 Deterministic Pre-Render Layout & Contrast Solver
Prior to emitting `CompositionIR`:
1. **Collision Check:** `∀ c1, c2 ∈ activeComponents(t), area(c1 ∩ c2) === 0`.
2. **Singleton Check:** Exactly 1 `sf.quiz.question_glass_card` mounted per question cycle.
3. **Contrast Solver:** Verifies all rendered text satisfies WCAG contrast ratio ≥ 7:1 against background + navy scrim.

---

## 5. Upgraded F07 Physical Verification Gates

1. **Start & End Completeness Gate:**
   - Scene 0 is present at $t = 0.5\text{s}$.
   - Outro CTA is present during final $1.5\text{s}$.
   - Total video duration $\ge$ last spoken word end $+ 400\text{ms}$.
2. **Zero Cut-Off & Silence Audit:**
   - 0ms audio truncated at scene boundaries.
   - No unplanned silence $> 600\text{ms}$ outside the 5.0s think gate.
3. **Visual & 6-Image B2 Audit:**
   - 6 distinct verified B2 background images across 6 questions.
   - Watermark detected at bottom-right corner.
   - Zero double question cards.
