# ShortForge Duration Contract & Word Budgeting Specification

**Document Version:** `2026.1-p0`  
**Status:** IMPLEMENTED & VERIFIED  
**Component:** `apps/web/factoryos/core/contracts/DurationContract.ts`, `TemplateProductionPipeline.ts`, `VerificationEngine.ts`  
**Test Suite:** `apps/web/factoryos/tests/duration-contract.test.ts` (17/17 PASS)

---

## 1. Executive Summary

A critical defect identified in prior runs was duration instability: a user request for a 60-second video silently expanded into a 93.93-second video. Under creator-facing and algorithmic distribution standards (YouTube Shorts, Instagram Reels, TikTok), unexpected duration blowup degrades retention and violates explicit creator intent.

Wave 1 introduces an authoritative, fail-closed **Duration Contract** with an exact tolerance window ($\pm 5\%$) and **Word Budgeting Engine** that establishes reverse-engineered acoustic timing before text generation and TTS synthesis.

---

## 2. Hard Contract Invariants

| Target Duration | Tolerance Window ($\pm 5\%$) | Minimum Allowed | Maximum Allowed | Max Word Budget (Total) | Beat Pacing (9 scenes) |
|---|---|---|---|---|---|
| **60 seconds** | $\pm 3.0$ seconds | **57.0 seconds** | **63.0 seconds** | ~117 words | 6.67s / ~13 words |
| **180 seconds** | $\pm 9.0$ seconds | **171.0 seconds** | **189.0 seconds** | ~351 words | 20.0s / ~39 words |

### Evaluation Rules:
1. **Independent FFprobe Measurement is Sovereign:** Duration is evaluated solely using physical container and stream inspection via `ffprobe` (`format.duration` and `streams[v].duration`). Renderer self-declarations cannot override physical truth.
2. **Fail-Closed Gate:** Any video outside $[T - \text{tol}, T + \text{tol}]$ is rejected unconditionally by `VerificationEngine.auditMediaArtifact` with `DURATION_UNDERFLOW` or `DURATION_OVERFLOW`.
3. **No Unbounded Clamping:** Scene durations cannot expand beyond beat tolerance without triggering global proportional timeline reconciliation.

---

## 3. Forensic Analysis: Root Cause of 93.93s Inflation

In previous iterations, `TemplateProductionPipeline.ts` contained an unconstrained clamping loop in `compileLocalRenderIntent`:

```typescript
// Legacy defective snippet:
let dur = Math.max(1.0, distributedDurations[idx] || 3.0);
const sceneVoice = params.sceneVoiceArtifacts?.[scene.sceneId];
if (sceneVoice && sceneVoice.durationSeconds > 0) {
  dur = Math.max(dur, Number((sceneVoice.durationSeconds + 0.4).toFixed(2))); // INFLATION EXPLOSION
}
```

Because script generation did not enforce a word budget, scene 2 generated 36 words of scientific narration. When synthesized via TTS at ~1.6 words/sec, the audio took 22.2 seconds. Line 944 unconditionally expanded scene 2 from 6.67 seconds to 22.6 seconds, and similar expansions across other scenes exploded the total runtime to 93.93 seconds.

---

## 4. Architectural Resolution

1. **`DurationEngine.calculateWordBudget(durationSeconds, wordsPerSecond)`**:
   $$\text{WordBudget} = \lfloor (\text{Duration} \times 0.85) \times 2.3 \rfloor$$
   Allocates 85% of each beat's window to audible speech, reserving 15% for natural pauses and visual transitions.

2. **`DurationEngine.allocateBeatBudgets(targetTotalSeconds, beats)`**:
   Proportionally partitions total target duration across all narrative beats such that $\sum \text{targetSeconds} \equiv \text{targetTotalSeconds}$ exactly.

3. **`DurationEngine.fitNarrationToBudget(narration, maxWords)`**:
   Enforces word budget limits at natural sentence or clause punctuation boundaries rather than arbitrary truncation.

4. **Timeline Reconciliation**:
   In `compileLocalRenderIntent`, the planned scenes are inspected. If the cumulative duration deviates from `targetDurationSeconds` beyond the $\pm 5\%$ tolerance, the timeline is proportionally reconciled, while FFmpeg `apad` guarantees seamless audio alignment without video sync drift.

5. **F07 Verification Gate**:
   `VerificationEngine.auditMediaArtifact` now accepts `durationSeconds`. If supplied, it evaluates the `DurationContract` and records `durationContract` in the final `VerificationReport`.

---

## 5. Automated Verification Evidence

Ran `npx vitest run factoryos/tests/duration-contract.test.ts`:

```
 ✓ Wave 1 — Duration Contract & Fail-Closed Voice Invariants (17 tests)
   ✓ DurationEngine Contract Creation & Evaluation
     ✓ creates a strict ±5% contract for 60s target (window [57s, 63s])
     ✓ creates a strict ±5% contract for 180s target (window [171s, 189s])
     ✓ evaluates and passes 60s target when physical duration is 60.5s
     ✓ evaluates and rejects 60s target when physical duration is 93.93s (DURATION_OVERFLOW)
     ✓ evaluates and passes 180s target when physical duration is 179.5s
     ✓ evaluates and rejects 180s target when physical duration is 150.0s (DURATION_UNDERFLOW)
     ✓ fails closed when physical duration is missing or NaN
   ✓ Word Budgeting & Narration Fitting
     ✓ calculates safe word budget based on speech time and pacing
     ✓ allocates beat budgets guaranteeing exact sum of durations
     ✓ fits narration cleanly to word budget without crude mid-sentence cutting
   ✓ Fail-Closed VoiceArtifact Invariants (validateMandatoryNarration)
     ✓ accepts a valid PRIMARY voice artifact with physical file and matching SHA-256
     ✓ fails closed when voice artifact is marked SILENT
     ✓ fails closed when audio file does not exist on disk
     ✓ fails closed when physical audio file has 0 bytes
     ✓ fails closed when declared SHA-256 does not match physical file content
   ✓ VerificationEngine Integration with DurationContract
     ✓ audits media artifact and passes when duration is within ±5% tolerance
     ✓ audits media artifact and rejects when duration overflows (93.93s on 60s target)

Test Files  1 passed (1)
Tests       17 passed (17)
```
