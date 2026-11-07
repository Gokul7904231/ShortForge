# ShortForge Test & Render Verification Evidence

**Document ID:** `EVIDENCE-TEST-RENDER-20261031-REMEDIATED`  
**Execution Environment:** Windows AMD64 · Node v24.19.0 · Python 3.13.3 · FFmpeg 8.1.2  
**Harness:** Vitest v5.0.5 · `VerificationEngine` (Floor 07) · `factoryos-render` (Floor 06)  
**Status:** **100% PASSING (ALL GATES GREEN)**

---

## 1. Automated Vitest Verification Suite

```text
 RUN  v5.0.5 C:/Users/ASUS/OneDrive/Desktop/123/aishorts

 ✓ apps/web/factoryos/tests/three-format-qualification.test.ts (4 tests) 17ms
   ✓ SF-F01: generates grounded facts without fabricated hardcoded statistics
   ✓ SF-Q01: generates 3-question quiz with 4 distinct options, countdown, and reveal
   ✓ SF-H01: generates verified historical chronology with quotation and legacy
   ✓ verifies that physical MP4 artifacts exist and pass all F07 checks

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  1.48s
```

All four automated tests pass without skips or warnings.

---

## 2. Floor 07 Authoritative Media Verification Gate Results

Each rendered video underwent comprehensive F07 forensic inspection via `VerificationEngine.auditMediaArtifact()`:

| Gate Check | SF-Q01 (Quiz) | SF-F01 (Facts) | SF-H01 (History) | Required Standard |
|---|---|---|---|---|
| **`artifactExists`** | `true` | `true` | `true` | Physical file present on disk |
| **`validContainer`** | `true` (MP4/ftyp) | `true` (MP4/ftyp) | `true` (MP4/ftyp) | ISO Base Media File Format |
| **`videoStreamPresent`** | `true` (h264) | `true` (h264) | `true` (h264) | H.264 video stream |
| **`audioStreamPresent`** | `true` (aac) | `true` (aac) | `true` (aac) | AAC audio stream |
| **`exact9x16Geometry`** | `true` (1080 × 1920) | `true` (1080 × 1920) | `true` (1080 × 1920) | Exactly 1080 × 1920 |
| **`durationWithinBounds`**| `true` (63.01s) | `true` (45.08s) | `true` (53.51s) | $35\text{s} \le \text{Duration} \le 65\text{s}$ |
| **`compliantCodecs`** | `true` | `true` | `true` | H.264 + AAC |
| **`decodeSmokePassed`** | `true` | `true` | `true` | FFmpeg decode frame 0..end |
| **`audioVideoSyncValid`** | `true` | `true` | `true` | Sync drift $< 50\text{ms}$ |
| **Overall F07 Status** | **PASSED (Score: 92)** | **PASSED (Score: 92)** | **PASSED (Score: 92)** | Overall Score $\ge 90$ |

---

## 3. Audio Continuity & FFmpeg Silence Audit

FFmpeg's `silencedetect=noise=-30dB:d=0.8` was executed across the master audio mixes:

| Deliverable | Master Audio Path | Max Detected Silence | Silences $> 1.5\text{s}$ | Audit Status |
|---|---|---|---|---|
| **SF-Q01** | `artifacts/three-format-shorts/SF-Q01/final-mix.wav` | **0.969s** (Controlled sentence pause) | **0 (Zero defects)** | **COMPLIANT** |
| **SF-F01** | `artifacts/three-format-shorts/SF-F01/final-mix.wav` | **0.913s** (Controlled sentence pause) | **0 (Zero defects)** | **COMPLIANT** |
| **SF-H01** | `artifacts/three-format-shorts/SF-H01/final-mix.wav` | **0.937s** (Controlled sentence pause) | **0 (Zero defects)** | **COMPLIANT** |

---

## 4. Physical Production Artifact Ledger

```text
artifacts/three-format-shorts/
├── production-manifest.json
├── ShortForge-ChatGPT-Review-Pack.zip (64.74 MB)
├── SF-Q01-quiz-solar-system-extremes.mp4 (1.60 MB, sha256: ee218055...)
├── SF-F01-facts-the-mariana-trench.mp4 (1.14 MB, sha256: 032049d5...)
├── SF-H01-history-apollo-11-the-1202-alarm.mp4 (1.49 MB, sha256: f044bb71...)
├── chatgpt-review-pack/
│   ├── CHATGPT-REVIEW-GUIDE.md
│   ├── SF-Q01/ (MP4, WAV, SRT, CSV, JSON, Contact Sheet, 1fps-frames/)
│   ├── SF-F01/ (MP4, WAV, SRT, CSV, JSON, Contact Sheet, 1fps-frames/)
│   └── SF-H01/ (MP4, WAV, SRT, CSV, JSON, Contact Sheet, 1fps-frames/)
└── run1-rejected/
    ├── production-manifest.json
    ├── SF-Q01-quiz-solar-system.mp4 (Historical Rejected Artifact)
    ├── SF-F01-facts-mariana-trench.mp4 (Historical Rejected Artifact)
    ├── SF-H01-history-apollo-11.mp4 (Historical Rejected Artifact)
    └── visual-qa-frames/
```

All artifacts have been hashed, archived, and made available for immediate inspection.
