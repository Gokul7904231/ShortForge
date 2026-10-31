# Wave 7.1 Quality Verification Architecture: F07 Creator-Quality Gates

**Authority:** Media QA Specialist & Release Captain  
**Date:** 31 October 2026  
**Repository:** `https://github.com/Gokul7904231/ShortForge`  
**Status:** **AUTHORITATIVE UPGRADE DEFINED**

---

## 1. Executive Summary & Rationale

Historical verification on `job_prod_accept_mvw01pma` produced a score of **96/100 (PASSED)** despite glaring creator-facing defects:
- 100+ seconds of digital zero silence across the 180s video.
- Repetitive 800px pulsating purple circle across every scene.
- Missing background photographs replaced by generic slate cards.
- Headline clipping and caption safe-area violations.
- Empty claim IDs in scene provenance.

The mathematical root cause was that `VerificationEngine.ts` evaluated coarse signal metrics:
- Global `volumedetect` peak of -0.3 dB masked trailing silence dropouts.
- Content quality was awarded 95/100 simply for possessing a script string (`scriptText.length >= 10 && sceneCount > 0`).
- Delivery readiness scored 100/100 simply for byte length > 10,000 bytes.

Wave 7.1 introduces a strict 6-dimension verification model with non-negotiable **Hard Admission Gates**.

---

## 2. Six-Dimension Verification Matrix

```
+---------------------------------------------------------------------------------------------------+
|                                  F07 ACCEPTANCE ARCHITECTURE                                      |
+---------------------------------------------------------------------------------------------------+
|  1. Technical Media Integrity    |  Exact 1080x1920 (9:16), H.264/AAC, ftyp, decode smoke, sync   |
|  2. Audio Quality & Speech       |  Per-scene VAD, speech occupancy >= 75%, max silence <= 1.5s  |
|  3. Visual Quality & Provenance  |  Mandatory asset materialization, no generic card fallback    |
|  4. Composition & Safe Area      |  Safe area margins (80/120/160), zero subtitle collision       |
|  5. Research & Claim Integrity   |  ClaimLedger mapping, 100% factual scenes tied to verified claims|
|  6. Delivery & SLSA Attestation  |  Immutable CAS registration, Drive byte-identity SHA-256 match  |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Hard-Gate Policy & Fail-Closed Invariants

If **ANY** of the following hard gates fail, the overall score is forced to **0 / FAIL**:

1. **`MAX_UNPLANNED_SILENCE_VALID`:**
   Any consecutive silence interval $> 1.50\text{ seconds}$ is an immediate hard failure.
2. **`SCENE_SPEECH_COVERAGE`:**
   Total speech occupancy across the video must be $\ge 70.0\%$. Every required narrative scene must have active speech.
3. **`MANDATORY_ASSETS_MATERIALIZED`:**
   If a recipe requires a visual asset, a physical image file must exist on disk and in CAS. Silent fallback to blank slate cards or gradient boxes is prohibited.
4. **`TYPOGRAPHY_SAFE_AREA_VALID`:**
   No text or caption element may extend beyond horizontal safe margins ($x \in [72, 960]$) or vertical safe margins ($y \in [220, 1560]$).
5. **`CLAIM_PROVENANCE_MAPPED`:**
   Every factual beat must reference at least one verified claim in `ClaimLedger`. Empty `claimIds: []` on educational explainers triggers a hard failure.
6. **`DECODE_SMOKE_PASSED`:**
   Full container decode via `ffmpeg -v error -i <file> -f null -` must exit with 0 errors and 0 corrupt frames.
7. **`DURATION_CONTRACT_VALID`:**
   Physical duration must be within $\pm 5.0\%$ of the target runtime ($[57.0\text{s}, 63.0\text{s}]$ for 60s; $[171.0\text{s}, 189.0\text{s}]$ for 180s).

---

## 4. Elimination of False-Green Mocks

- **`SileroVADAdapter`:** Removed the `proc.on('error')` mock that returned fake passing metrics. The adapter must invoke the genuine silence interval detector and report actual timestamps.
- **`WhisperXAdapter`:** Removed synthetic timestamp generation (`i * 0.4s`) and fake 0.95 confidence. When offline or unconfigured, it reports `ASR_UNAVAILABLE` honestly rather than simulating success.
- **`PySceneDetectAdapter`:** Removed hardcoded 0.95 diversity scores.

