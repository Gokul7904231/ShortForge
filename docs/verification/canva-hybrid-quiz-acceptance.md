# Canva Hybrid Quiz V2 Flagship Acceptance & Verification Report

**Document Reference:** `docs/verification/canva-hybrid-quiz-acceptance.md`  
**Execution Date:** 2026-11-03  
**Status:** PASS — Full F07 & Physical Waveform Acceptance  
**Governing Directives:** Canva Hybrid Architecture Mission & RFC 7636 PKCE Specification  
**Templates Verified:** `quiz.universal.cinematic.v2` (Canonical V2), `quiz.universal.glass.v1` (Preserved V1 Baseline)  
**Authoritative Renderer:** Native `factoryos-render` (Pillow 1080×1920 30fps + FFmpeg H.264/AAC muxer)  

---

## Executive Summary

The Canva Hybrid Design Integration enables ShortForge creators to author and maintain reusable 9:16 portrait visual styling assets in Canva while strictly retaining ShortForge's native production engine for deterministic video rendering, audio alignment, and quality gate enforcement.

ShortForge produced, Lowered, and verified two complete six-question flagship shorts:
1. **Geography Flagship Short:** `artifacts/quiz-v2/quiz-v2-geography-6q.mp4` (173.80s, 6,018,739 bytes, SHA-256 `c04d45e050d4...`)
2. **Science Flagship Short:** `artifacts/quiz-v2/quiz-v2-science-6q.mp4` (178.90s, 6,131,185 bytes, SHA-256 `8a5c5e4f6575...`)

Both flagship videos passed 100/100 automated physical timing gate checks, 0 failed, with exactly 150 frames (5.000s) of digital silence during every question's thinking window, complete option narration, zero answer leakage, authentic Backblaze B2 photographic backdrops, and active Canva visual layer compositing.

---

## 1. Full Production Acceptance Matrix

| # | Verification Criterion | Geography Flagship Short | Science Flagship Short | Acceptance Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | **6 Distinct B2 Backgrounds** | 6 authentic photographic backdrops resolved via B2 storage | 6 authentic diagrammatic/space backdrops resolved via B2 storage | **PASS** |
| **2** | **Voice & Pronunciation** | Windows SAPI Zira (Female) with Kore warmth filter | Windows SAPI Zira (Female) with Kore warmth filter | **PASS** |
| **3** | **No Male Fallback Voice** | Strict female voice assertion (throws on missing female voice) | Strict female voice assertion (throws on missing female voice) | **PASS** |
| **4** | **Complete Option Narration** | All 24 options (A–D across 6 Qs) read in full | All 24 options (A–D across 6 Qs) read in full | **PASS** |
| **5** | **Option D Audio Snapping** | Gate starts at frame-ceiled end of option D (`tail = 0`) | Gate starts at frame-ceiled end of option D (`tail = 0`) | **PASS** |
| **6** | **Exact 5.0s Think Gate** | Exactly 150 frames (5.000s @ 30 fps) per question | Exactly 150 frames (5.000s @ 30 fps) per question | **PASS** |
| **7** | **Digital Silence Floor** | Max volume: **-91.0 dBFS** (anullsrc generated) | Max volume: **-91.0 dBFS** (anullsrc generated) | **PASS** |
| **8** | **No Premature Answer Voice** | Answer narration onset: $t \ge t_{\text{think\_end}}$ | Answer narration onset: $t \ge t_{\text{think\_end}}$ | **PASS** |
| **9** | **Emerald Answer Punch** | High-contrast emerald fill + checkmark + active indicator | High-contrast emerald fill + checkmark + active indicator | **PASS** |
| **10** | **Complete Explanation** | Spoken in full; separate beat from answer reveal | Spoken in full; separate beat from answer reveal | **PASS** |
| **11** | **Zero Narration Clipping** | Physical audio duration completely accommodated | Physical audio duration completely accommodated | **PASS** |
| **12** | **Zero Text Clipping** | Segoe UI wrapped within 920px content area | Segoe UI wrapped within 920px content area | **PASS** |
| **13** | **Total Video Duration** | **173.80s** (Ceiling: 180.0s, delta: -6.20s) | **178.90s** (Ceiling: 180.0s, delta: -1.10s) | **PASS** |
| **14** | **Audio / Video Drift** | **10 ms** (tolerance $\le 50\text{ ms}$) | **10 ms** (tolerance $\le 50\text{ ms}$) | **PASS** |
| **15** | **Canva Visual Layer Styling** | Composited from versioned pack `quiz.universal.cinematic.v1` | Composited from versioned pack `quiz.universal.cinematic.v1` | **PASS** |
| **16** | **Offline B2 Caching Fallback** | Seamless local & B2 fallback with 0 network dependencies | Seamless local & B2 fallback with 0 network dependencies | **PASS** |
| **17** | **9:16 Vertical Geometry** | 1080×1920 pixels, H.264 High Profile, AAC Stereo 44.1kHz | 1080×1920 pixels, H.264 High Profile, AAC Stereo 44.1kHz | **PASS** |
| **18** | **F07 Acceptance Gate** | **PASS** (Duration: 173.82s, Size: 5.74MB) | **PASS** (Duration: 178.92s, Size: 5.85MB) | **PASS** |

---

## 2. Decoded Physical Audio Waveform Gate Evidence

Measurements performed via `tools/verify_quiz_v2_timing.ts` using FFmpeg `atrim`, `volumedetect`, and `silencedetect`:

### 2.1 Geography Flagship Short (`quiz-v2-geography-6q.mp4`)
- **Total Duration:** 173.800s | **Audio Duration:** 173.790s | **A/V Drift:** 10 ms | **50 Scenes**
- **Automated Verification:** **100 passed, 0 failed**

| Q# | Option D Spoken End | Gate Start | Gate End | Frames | Gate Max Vol | Covering Silence Window | Answer Voice Start | Answer Max Vol | Explanation Start |
| :-: | ---: | ---: | ---: | :-: | :-: | :---: | ---: | :-: | ---: |
| **Q1** | 21.234s | 21.267s | 26.267s | 150 | -91.0 dB | 20.57s – 26.37s | 26.267s | -8.1 dB | 29.067s |
| **Q2** | 49.297s | 49.300s | 54.300s | 150 | -91.0 dB | 48.64s – 54.40s | 54.300s | -8.2 dB | 56.533s |
| **Q3** | 74.687s | 74.700s | 79.700s | 150 | -91.0 dB | 74.03s – 79.80s | 79.700s | -8.1 dB | 82.333s |
| **Q4** | 102.897s | 102.900s | 107.900s | 150 | -91.0 dB | 102.23s – 108.00s | 107.900s | -8.1 dB | 110.633s |
| **Q5** | 129.668s | 129.700s | 134.700s | 150 | -91.0 dB | 129.00s – 134.80s | 134.700s | -8.1 dB | 137.367s |
| **Q6** | 155.026s | 155.033s | 160.033s | 150 | -91.0 dB | 154.37s – 160.14s | 160.033s | -8.2 dB | 162.300s |

### 2.2 Science Flagship Short (`quiz-v2-science-6q.mp4`)
- **Total Duration:** 178.900s | **Audio Duration:** 178.890s | **A/V Drift:** 10 ms | **50 Scenes**
- **Automated Verification:** **100 passed, 0 failed**

| Q# | Option D Spoken End | Gate Start | Gate End | Frames | Gate Max Vol | Covering Silence Window | Answer Voice Start | Answer Max Vol | Explanation Start |
| :-: | ---: | ---: | ---: | :-: | :-: | :---: | ---: | :-: | ---: |
| **Q1** | 19.054s | 19.067s | 24.067s | 150 | -91.0 dB | 18.40s – 24.17s | 24.067s | -8.2 dB | 26.367s |
| **Q2** | 51.935s | 51.967s | 56.967s | 150 | -91.0 dB | 51.26s – 57.07s | 56.967s | -7.7 dB | 61.033s |
| **Q3** | 83.125s | 83.133s | 88.133s | 150 | -91.0 dB | 82.47s – 88.24s | 88.133s | -8.2 dB | 90.400s |
| **Q4** | 108.540s | 108.567s | 113.567s | 150 | -91.0 dB | 107.87s – 113.67s | 113.567s | -8.1 dB | 116.033s |
| **Q5** | 133.511s | 133.533s | 138.533s | 150 | -91.0 dB | 132.85s – 138.64s | 138.533s | -8.2 dB | 140.800s |
| **Q6** | 160.064s | 160.067s | 165.067s | 150 | -91.0 dB | 159.40s – 165.17s | 165.067s | -8.2 dB | 167.333s |

---

## 3. Canva Visual Design Pack Manifest (`manifest.json`)

The versioned visual design pack is stored immutably at:
- **Local Cache:** `assets/canva/packs/quiz.universal.cinematic.v1/manifest.json`
- **Backblaze B2 Repository:** `data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quiz.universal.cinematic.v1/manifest.json`
- **Manifest Digest (SHA-256):** `d7884d6378986d8d65f9ef63b68c5944f6382aa877dec38121b845c0d08517ab`

Synchronized Visual Assets:
1. `glass_card_frame.png` — SHA-256 `5591110422...` (15,842 bytes)
2. `category_badge.png` — SHA-256 `1fbcac3b57...` (16,061 bytes)
3. `progress_track.png` — SHA-256 `f30743b7cf...` (8,248 bytes)
4. `reveal_punch.png` — SHA-256 `b480d9fd38...` (20,205 bytes)
5. `explanation_card.png` — SHA-256 `9cfe530789...` (8,548 bytes)
6. `outro_card.png` — SHA-256 `82709a2c24...` (26,097 bytes)

---

## 4. Visual Evidence: Contact Sheets

Visual contact sheets with 12 keyframes each (capturing think-time countdown midpoint and emerald answer reveal for each of the 6 questions):
- **Geography Contact Sheet:** `artifacts/quiz-v2/geography-contact-sheet.png`
- **Science Contact Sheet:** `artifacts/quiz-v2/science-contact-sheet.png`

---

## 5. Automated Regression Test Summary

| Test Suite | File | Tests Passed | Duration |
| :--- | :--- | :---: | ---: |
| Canva OAuth 2.0 PKCE | `apps/web/factoryos/tests/canva-oauth-pkce.test.ts` | 6 / 6 | 13ms |
| Canva Design Sync Adapter | `apps/web/factoryos/tests/canva-design-sync-adapter.test.ts` | 4 / 4 | 9ms |
| Quiz V2 5-Second Think Gate | `apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts` | 1 / 1 | 106ms |
| QuizShow V2 Cinematic Template | `apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts` | 9 / 9 | 19ms |
| QuizShow V1.2 Universal Template | `apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts` | 21 / 21 | 82ms |
| Legacy QuizShow V1 Template | `apps/web/factoryos/tests/quizshow-template.test.ts` | 7 / 7 | 31ms |
| Native Python Render Engine | `packages/factoryos-render/tests/` | 18 / 18 | 270ms |
| Physical Timing Gate (Geography) | `tools/verify_quiz_v2_timing.ts` | 100 / 100 | ~35s |
| Physical Timing Gate (Science) | `tools/verify_quiz_v2_timing.ts` | 100 / 100 | ~35s |
| TypeScript Compiler (`tsc --noEmit`) | `apps/web/package.json` | 0 errors | ~10s |

**Total Automated Checks:** **266 Passed, 0 Failed, 0 Flaky.**
