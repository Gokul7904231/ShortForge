# ShortForge Verification Fabric Specification (VAD, ASR, Visual, Telemetry)

**Document Version:** `2026.1-p0`  
**Status:** IMPLEMENTED & VERIFIED  
**Component:** `apps/web/factoryos/core/verification/VerificationFabric.ts`  
**Test Suite:** `apps/web/factoryos/tests/verification-fabric.test.ts` (10/10 PASS)

---

## 1. Executive Summary

Superficial checks (e.g. merely checking if an MP4 file exists or has an audio track) fail to detect common content generation defects:
- An audio stream is present, but it contains silence after the first scene.
- Audio is synthesized, but the spoken words do not correspond to the approved script.
- Video renders, but frames freeze on a single static slide or black screen.
- Distributed execution loses tracing context between asynchronous stages.

Wave 4 implements the **ShortForge Verification Fabric**, introducing four dedicated forensic adapters:
1. **`SileroVADAdapter`**: Voice Activity Detection and speech occupancy measurement.
2. **`WhisperXAdapter`**: Word-level ASR alignment against expected narration scripts.
3. **`PySceneDetectAdapter`**: Automated cut detection, black-frame rejection, and frame diversity.
4. **`OpenTelemetryAdapter`**: W3C `traceparent` context generation and multi-floor propagation.

---

## 2. Forensic Adapter Specifications

### 2.1 Silero VAD (Voice Activity Detection)
- **Objective:** Quantify audible speech occupancy across the entire video timeline.
- **Rules:**
  - `VAD_SPEECH_OCCUPANCY_TOO_LOW`: Fails closed if active speech occupies $< 60\%$ of the audio stream.
  - `VAD_PROLONGED_SILENCE_GAP`: Fails closed if any uninterrupted silence interval exceeds $3.0$ seconds.
  - Rejects silent tracks, missing files, or muted channels.

### 2.2 WhisperX Word-Level ASR Alignment
- **Objective:** Verify that synthesized speech matches the approved script text.
- **Rules:**
  - Tokenizes recognized speech and aligns against script words.
  - Computes Word Error Rate (WER) and token similarity score.
  - `ASR_ALIGNMENT_MISMATCH`: Fails closed if token agreement is $< 70\%$, preventing mismatched audio tracks from passing F07.

### 2.3 PySceneDetect Visual Diversity
- **Objective:** Verify dynamic visual progression and reject black or frozen video.
- **Rules:**
  - Analyzes video frames with FFmpeg `blackdetect`.
  - `BLACK_FRAMES_DETECTED`: Rejects video if prolonged black frames ($> 0.5$s) are discovered.
  - Computes perceptual frame hashes across scene timestamps to ensure scenes change visually across cuts.

### 2.4 OpenTelemetry W3C Traceparent Propagation
- **Objective:** Maintain distributed context across F00 to F07.
- **Specification:**
  - Formats headers according to W3C Trace Context recommendation: `00-<32 hex traceId>-<16 hex spanId>-01`.
  - Enables end-to-end distributed tracing across microservices and asynchronous workers.

---

## 3. Automated Verification Evidence

Ran `npx vitest run factoryos/tests/verification-fabric.test.ts`:

```
 ✓ Wave 4 — Verification Fabric (Speech VAD, WhisperX ASR, Visual PySceneDetect, OpenTelemetry) (10 tests)
   ✓ SileroVADAdapter
     ✓ fails closed when audio file is missing
     ✓ evaluates mock voice activity correctly
     ✓ rejects predominantly silent audio with low occupancy
   ✓ WhisperXAdapter ASR Script Alignment
     ✓ evaluates and passes when recognized audio matches script
     ✓ rejects when recognized audio severely diverges from script (e.g. wrong audio track)
   ✓ PySceneDetectAdapter Visual Diversity
     ✓ fails closed when video file does not exist
     ✓ detects scene diversity on mock video inspection
   ✓ OpenTelemetryAdapter W3C Trace Propagation
     ✓ generates a compliant W3C traceparent header
     ✓ propagates traceId to child spans with distinct spanId
     ✓ parses valid W3C traceparent header and rejects malformed strings

Test Files  1 passed (1)
Tests       10 passed (10)
```
