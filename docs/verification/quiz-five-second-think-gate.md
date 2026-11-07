# ShortForge — Quiz V2 Five-Second Think Gate

**Date:** 2026-11-02  
**Status:** PASS — physically verified on rendered MP4  
**Templates affected:** `quiz.universal.cinematic.v2`, `quiz.universal.glass.v1`  
**Template deliberately unchanged:** `quiz.quizshow.v1` (8-question legacy 26-beat cycle)  
**Renderer:** native `factoryos-render` (FFmpeg + Pillow), 1080×1920, 30 fps, H.264/AAC  

---

## 1. Contract

Every question must run in this order:

```
QUESTION narration
  -> OPTION_A narration
  -> OPTION_B narration
  -> OPTION_C narration
  -> OPTION_D narration
  -> 5.000 s silent think gate      (150 frames @ 30 fps)
  -> ANSWER_REVEAL visual + answer narration
  -> EXPLANATION narration
```

Timing invariants:

| Invariant | Requirement |
| :--- | :--- |
| `think_start` | Actual end of option D audio (frame-ceiled, no 350 ms narration tail) |
| `think_end` | `think_start + 5.000 s` |
| `think_frames` | Exactly `150` at 30 fps |
| Think audio | No narration track; digital silence |
| `answer_start` | `>= think_end` (first frame at or after the gate) |
| Answer / explanation | Separate beats, separate synthesized audio |
| Speech content | Never truncated, padded, or shortened to fit the gate |

---

## 2. Root Cause of the Defect

The previous universal quiz compiled a 20-beat script:

```
HOOK -> (QUESTION -> 4.0 s COUNTDOWN -> combined ANSWER_REVEAL) × 6 -> OUTRO
```

Three independent defects followed from that structure:

1. **No option narration.** The four answers were shown but never spoken, so there was no physical “last option audio” to anchor the think period to.
2. **The countdown was not five seconds.** The `COUNTDOWN` beat carried the narration “Five seconds on the clock, lock in your answer!” but the physical WAV measured **3.544 s**; the scene was padded to 4.0 s. The spoken claim and the actual wait disagreed.
3. **The answer arrived immediately.** The combined `ANSWER_REVEAL` beat held both answer and explanation in one narration segment, and it began roughly **0.35 s** after the countdown audio ended. The viewer could hear the answer before any full five-second think period.

The old tests asserted `beats.length === 20` and `COUNTDOWN` presence, so they encoded the defect rather than catching it.

---

## 3. Fix

### 3.1 Beat structure

`apps/web/factoryos/core/templates/TemplateProductionPipeline.ts` now emits **50 beats** for a 6-question universal quiz:

```
1 HOOK + 6 × (QUESTION + OPTION_A + OPTION_B + OPTION_C + OPTION_D
              + THINK + ANSWER_REVEAL + EXPLANATION) + 1 OUTRO
```

The gate is a real scene:

| Beat | Narration | Duration | Props |
| :--- | :--- | :--- | :--- |
| `OPTION_D` | `D. <text>.` | audio only, no tail | `audioTailSeconds: 0` |
| `THINK` | empty | exactly `5.0` | `thinkGate: true`, `seconds: 5` |
| `ANSWER_REVEAL` | answer only | audio + 50 ms | answer visual |
| `EXPLANATION` | explanation only | audio + 50 ms | explanation visual |

### 3.2 Gate-aware compilation

`compileLocalRenderIntent()` now:

- forces a gate scene to `5.0 s` regardless of any audio or duration hint;
- never attaches an audio track to a gate scene;
- excludes gate scenes from the audio-completeness floor;
- starts the gate at the frame-ceiled end of option D audio because option D has zero tail;
- places the answer scene immediately after the gate.

The universal quiz ceiling moved from **145 s to 180 s**. A full 44-track narration plus six 5-second gates cannot fit in 145 s without cutting speech.

### 3.3 Narration length without truncation

To keep both six-question flagships under 180 s without deleting content:

- options are read as `A. Mariana Trench.` rather than `Option A: Mariana Trench`;
- questions are read as `Question 1: ...` rather than `Question 1 of 6: ...`;
- universal-quiz inter-beat tails are **50 ms** (last option: `0`);
- answer and explanation remain separate, fully spoken beats.

This reduced Geography speech to **141.54 s** and Science speech to **146.73 s**; both fit with six gates.

### 3.4 Voice and visual correctness

- `tools/synthesize_quizshow_v2_audio.py` selects a female SAPI voice explicitly (`Zira`/`Female`) and **throws** if none exists. It cannot silently fall back to a male narrator.
- The “Kore” profile is the warmth filter chain applied to the selected female voice (`highpass 80 Hz`, `lowpass 8200 Hz`, `250 Hz +2.5 dB`, `3200 Hz -2 dB`, `atempo 1.05`), not a claim that Gemini TTS was used.
- `packages/factoryos-render/src/factoryos_render/backends/image.py` honors `highlightOptionIndex`, so the question card can visually emphasize the option being narrated.

---

## 4. Physical Evidence

### 4.1 Deliverables

| Dataset | MP4 | Duration | Size | SHA-256 |
| :--- | :--- | ---: | ---: | :--- |
| Geography | `artifacts/quiz-v2/quiz-v2-geography-6q.mp4` | 173.80 s | 6,018,739 B | `c04d45e050d499b83c9b4b74676102abe4a3594f2c1d74de5aa7d04f40c98854` |
| Science | `artifacts/quiz-v2/quiz-v2-science-6q.mp4` | 178.90 s | 6,131,185 B | `8a5c5e4f65757d8d94477dd6e6f024576f9a4047b3a49396de444cede740af8f` |

Both: 50 scenes, 1080×1920, 30 fps, 44.1 kHz / 2-channel AAC, 44 measured narration tracks + 6 silent gate scenes.

### 4.2 Geography — six gates

| Q | Option D audio ends | Think start | Think end | Frames | Gate max | Answer starts | Answer max |
| :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 21.234 s | 21.267 s | 26.267 s | 150 | −91 dB | 26.267 s | −8.1 dB |
| 2 | 49.297 s | 49.300 s | 54.300 s | 150 | −91 dB | 54.300 s | −8.2 dB |
| 3 | 74.687 s | 74.700 s | 79.700 s | 150 | −91 dB | 79.700 s | −8.1 dB |
| 4 | 102.897 s | 102.900 s | 107.900 s | 150 | −91 dB | 107.900 s | −8.1 dB |
| 5 | 129.668 s | 129.700 s | 134.700 s | 150 | −91 dB | 134.700 s | −8.1 dB |
| 6 | 155.026 s | 155.033 s | 160.033 s | 150 | −91 dB | 160.033 s | −8.2 dB |

### 4.3 Science — six gates

| Q | Option D audio ends | Think start | Think end | Frames | Gate max | Answer starts | Answer max |
| :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 19.054 s | 19.067 s | 24.067 s | 150 | −91 dB | 24.067 s | −8.2 dB |
| 2 | 51.935 s | 51.967 s | 56.967 s | 150 | −91 dB | 56.967 s | −7.7 dB |
| 3 | 83.125 s | 83.133 s | 88.133 s | 150 | −91 dB | 88.133 s | −8.2 dB |
| 4 | 108.540 s | 108.567 s | 113.567 s | 150 | −91 dB | 113.567 s | −8.1 dB |
| 5 | 133.511 s | 133.533 s | 138.533 s | 150 | −91 dB | 138.533 s | −8.2 dB |
| 6 | 160.064 s | 160.067 s | 165.067 s | 150 | −91 dB | 165.067 s | −8.2 dB |

Gate max volume is measured on the decoded MP4 with `atrim` + `volumedetect`; −91 dB is the digital-silence floor. Answer max volume is measured on the first second of the answer scene, proving the answer narration is present and is not background music. This render path has no background-music track: every audible frame is narration.

### 4.4 Automated gate

`tools/verify_quiz_v2_timing.ts` performs **100 checks per video** (frame math, audio-track presence, ceiling, geometry, format, A/V drift, `atrim` silence, `silencedetect` coverage, answer speech):

```
Geography: 100 passed, 0 failed | A/V drift 10 ms | duration 173.800 s
Science:   100 passed, 0 failed | A/V drift 10 ms | duration 178.900 s
```

Reports:

- `artifacts/quiz-v2/quiz-v2-geography-timing-report.json`
- `artifacts/quiz-v2/quiz-v2-science-timing-report.json`

F07 acceptance gates also pass for both renders (duration, geometry, codecs, audio stream). The F07 log prints `Score: undefined/100`; this is a pre-existing score-reporting quirk, not a gate failure.

### 4.5 Contact sheets

- `artifacts/quiz-v2/geography-contact-sheet.png` (12 frames: think midpoint + answer reveal per question)
- `artifacts/quiz-v2/science-contact-sheet.png`

---

## 5. Regression Coverage

| Layer | Artifact | What it proves |
| :--- | :--- | :--- |
| Compiled timeline | `apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts` | Gate is exactly 150 frames, has no audio track, starts at option D audio end, answer starts at gate end, explanation starts after answer audio |
| Structure | `quizshow-v2-cinematic-template.test.ts` | 50 beats, per-question A–D / THINK / ANSWER / EXPLANATION order, option D tail 0 |
| Structure | `quizshow-v1.2-universal-template.test.ts` | Same 50-beat contract for `quiz.universal.glass.v1` |
| Preserved legacy | `quizshow-template.test.ts` | `quiz.quizshow.v1` still emits its 26-beat 8-question cycle |
| Physical MP4 | `tools/verify_quiz_v2_timing.ts` | The rendered file, not just metadata, obeys the contract |

Current result: **38 quiz tests pass**, `npm run typecheck` passes.

---

## 6. Reproduce

```powershell
# Render both six-question flagships (writes intent + audio manifests + contact sheets)
npx tsx tools/render_quizshow_v2_samples.ts all

# Physical gate (100 checks each)
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

Do not use `ffmpeg -ss` as an output option for the silence measurement; it measured the whole file in testing. The verifier uses `atrim` and `silencedetect` deliberately.

---

## 7. Known Limits

- The narration engine is Windows SAPI Zira (female) with the Kore warmth filter, not a cloud TTS voice. The female-voice invariant is enforced, but cloud-voice quality is a separate upgrade.
- The verifier proves digital silence and answer onset; it does not transcribe speech to prove the words. Script text and audio manifests supply that link.
- `quiz.quizshow.v1` intentionally keeps the legacy 26-beat cycle. It is an 8-question format and was out of scope.
- F07’s score field is not populated. Gates pass, but the score should not be cited as evidence until the reporting bug is fixed.
