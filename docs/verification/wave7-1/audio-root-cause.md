# Wave 7.1 Audio Forensic Audit: Root Cause of Narration Trailing Silence

**Authority:** Senior Audio Engineer & FactoryOS Pipeline Architect  
**Date:** 31 October 2026  
**Repository:** `https://github.com/Gokul7904231/ShortForge`  
**Reference Incident:** Production Acceptance Job `job_prod_accept_mvw01pma` (Run `run_mission_b_180s`, 180s Mariana Trench Deep Explainer)  
**Status:** **ROOT CAUSE PROVEN & REMEDIATED**

---

## 1. Executive Summary & Defect Statement

Human creator review of the 180-second Mariana Trench documentary (`job_prod_accept_mvw01pma.mp4`) revealed a critical audio continuity flaw:
> **"Approximately 4–5 seconds of silence after individual narration segments."**

Although the physical media container measured 180.05 seconds and passed FFprobe / decode checks, more than 50% of the entire video consisted of digital null silence (`apad` zero-fill). The voice narration would finish, followed by 4.8 to 17 seconds of dead air in every single scene before the next scene began.

---

## 2. Forensic Audio Timeline Analysis (`job_prod_accept_mvw01pma`)

The following table records the exact scene-level measurements reconstructed from the reference run manifest, script beat definitions, and physical TTS artifact measurements:

| Scene ID | Beat ID | Narration Text Excerpt | Planned Scene Dur (s) | TTS Physical Dur (s) | Scene Start (s) | Scene End (s) | Voice Start (s) | Voice End (s) | Trailing Silence (s) | Internal Silence (s) | Voice Provider | Quality Class | Fallback State |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `scene_01` | `beat_01_hook` | "Did you know that at the bottom of Mariana Trench..." (17 words) | 20.00 | 7.50 | 0.00 | 20.00 | 0.00 | 7.50 | **12.50s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_02` | `beat_02_context` | "The Mariana Trench is located in the western Pacific Ocean..." (37 words) | 20.00 | 15.20 | 20.00 | 40.00 | 20.00 | 35.20 | **4.80s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_03` | `beat_03_mechanics` | "Formed through oceanic-to-oceanic subduction..." (26 words) | 20.00 | 11.00 | 40.00 | 60.00 | 40.00 | 51.00 | **9.00s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_04` | `beat_04_bignum` | "At its maximum measured depth, the Challenger Deep plunges..." (23 words) | 20.00 | 9.50 | 60.00 | 80.00 | 60.00 | 69.50 | **10.50s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_05` | `beat_05_compstat` | "At the floor of the trench, hydrostatic pressure exceeds..." (23 words) | 20.00 | 9.50 | 80.00 | 100.00 | 80.00 | 89.50 | **10.50s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_06` | `beat_06_timeline` | "From pioneering bathyscaphe expeditions in the nineteen-sixties..." (20 words) | 20.00 | 8.50 | 100.00 | 120.00 | 100.00 | 108.50 | **11.50s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_07` | `beat_07_quote` | "Chief deep-sea researchers recorded: 'The abyssal zone is not...'" (21 words) | 20.00 | 8.50 | 120.00 | 140.00 | 120.00 | 128.50 | **11.50s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_08` | `beat_08_frontier` | "Modern genomic sequencing of organisms from Mariana Trench..." (23 words) | 20.00 | 10.00 | 140.00 | 160.00 | 140.00 | 150.00 | **10.00s** | < 0.2s | SystemVoice | PRIMARY | false |
| `scene_09` | `beat_09_outro` | "Follow for more deep oceanic discoveries." (7 words) | 20.00 | 3.00 | 160.00 | 180.00 | 160.00 | 163.00 | **17.00s** | < 0.1s | SystemVoice | PRIMARY | false |
| **TOTAL** | **9 Beats** | **197 words total** | **180.00** | **~82.70** | **0.00** | **180.00** | **—** | **—** | **~97.30s (54% silence)** | **—** | **—** | **—** | **—** |

---

## 3. Four-Floor Root Cause Analysis

### Cause 1: Floor 02 Script Word-Count Deficit (Under-Generation)
In `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts` (lines 280–310):
- For a 180s video with 9 scenes, `DurationEngine.allocateBeatBudgets(180, 9)` budgeted **20.0s per beat** (`maxWords: 39` words per beat at 2.3 wps).
- However, `rawNarrations` in `generateTemplateScript()` contained only **17 to 37 words** (average 21.8 words).
- Total words across the 9 beats totaled only **197 words**. At standard documentary pace (~2.3 wps), 197 words produces only **~83 seconds of speech**!
- Because `fitNarrationToBudget()` only truncates when words exceed `maxWords`, the severe word deficit was never detected or expanded.

### Cause 2: Floor 05 The `Math.max` Allocation Trap
In `TemplateProductionPipeline.compileLocalRenderIntent()` (lines 968–994):
- When `sceneVoiceArtifacts` are supplied without a monolithic `voiceArtifact`, `voiceDuration` is `undefined`.
- `distributedDurations` falls back to `scenePlans.map(s => s.durationIntent.target)` = **20.0 seconds** for every scene.
- Line 988: `dur = Math.max(1.0, distributedDurations[idx] || 3.0)` sets `dur = 20.0s`.
- Line 991:
  ```typescript
  if (sceneVoice && sceneVoice.durationSeconds > 0) {
    dur = Math.max(dur, Number((sceneVoice.durationSeconds + 0.4).toFixed(2)));
  }
  ```
  Since `dur` is already `20.0s`, and `sceneVoice.durationSeconds + 0.4` is only ~8s–15.6s, `Math.max(20.0, 15.6)` evaluates to **`20.0s`**.
- The scene duration was **artificially inflated to 20.0s**, ignoring the actual physical audio length.

### Cause 3: Floor 06 FFmpeg Digital Zero Silence Padding (`apad`)
In `packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py` (lines 196–218):
- Each scene MP4 is rendered with `-t 20.000000`.
- The audio filter chain applies `chain.append("apad")`.
- When the voice file reaches EOF (e.g. at 15.2s), `apad` generates digital zero silence for the remaining **4.80 seconds**.
- In `concatenate_scenes`, the 9 scenes are concatenated sequentially. Every scene transition therefore contains between **4.8s and 17.0s of dead digital silence**!

### Cause 4: Discarded Voice Metadata in `synthesizeSceneAudio()`
`TemplateProductionPipeline.synthesizeSceneAudio()` (lines 929–953) stripped `artifactId`, `provider`, `qualityClass`, `isFallback`, and never invoked `validateMandatoryNarration()`.

---

## 4. Corrective Architecture (Audio-First Timeline Construction)

To eliminate trailing silence while strictly preserving the requested physical duration ($180\text{s} \pm 5\%$ or $60\text{s} \pm 5\%$):

1. **Duration-Calibrated Script Generation (F02):**
   - For 180s target duration, narration must target $85\%$ speech occupancy: $153\text{s} \times 2.3 \text{ wps} \approx 350\text{ words}$.
   - For 9 scenes, each scene narration must contain **38–44 words** of rich, educational documentary exposition.
   - For 60s target duration, $51\text{s} \times 2.3 \text{ wps} \approx 120\text{ words}$ across 6–8 scenes.

2. **Audio-First Physical Timeline Construction (F05):**
   - Physical voice duration is authoritative:
     $$\text{sceneDuration} = \text{voiceDuration} + \text{permittedTransitionGap}$$
     where $\text{permittedTransitionGap} \in [0.2\text{s}, 0.5\text{s}]$ (default $0.35\text{s}$).
   - Any residual duration required to satisfy the duration contract is distributed as subtle visual reflection holds (max 0.8s) or outro hold, never as 4–10 second dead air gaps.

3. **Continuous Audio Bed / Soundscape (F06):**
   - The renderer must support continuous audio so that brief natural breathing spaces between spoken sentences do not drop to digital zero silence.

4. **Fail-Closed Voice Invariants (F04):**
   - Retain full `VoiceArtifact` metadata.
   - Execute `validateMandatoryNarration(artifact)` on every scene.
   - Reject any `DEGRADED_FALLBACK` or silent WAV artifacts.

