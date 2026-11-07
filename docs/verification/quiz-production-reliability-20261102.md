# ShortForge — Quiz Production Reliability Incident (2026-11-02)

**Status:** RESOLVED and physically verified  
**Severity:** High — rendered MP4 passed the quality gate but had a corrupt audio timeline  
**Scope:** Native renderer scene audio encoding, Quiz V2 ceiling accounting, flagship manifest  
**Evidence:** `artifacts/quiz-v2/quiz-v2-{geography,science}-timing-report.json`  

---

## 1. Incident Summary

After the five-second think gate was implemented, the first full Geography render reported:

```
F07 Quality Gate: PASS
Duration: 176.27s
```

But `ffprobe` on the same file showed:

| Stream | Duration |
| :--- | ---: |
| Video (H.264) | 177.133 s |
| Audio (AAC) | **326.311 s** |
| Reported A/V drift | **149,178 ms** |

The quality gate checked that an audio stream existed and that the container/codecs were valid. It did not check that the audio and video timelines agreed. The file was therefore accepted while being unusable: audio packets were spread across a timeline nearly twice as long as the video.

---

## 2. Diagnosis

### 2.1 Packet-level evidence

The final MP4 contained **4,424 AAC packets**. At 44.1 kHz with 1,024 samples per packet, that is only **102.7 s of actual audio payload**, yet the last packet timestamp was at **326.31 s**. Six large timestamp gaps appeared at question boundaries:

| Gap starts | Next packet | Gap |
| ---: | ---: | ---: |
| 22.458 s | 44.934 s | 22.476 s |
| 54.987 s | 101.534 s | 46.547 s |
| 111.584 s | 153.133 s | 41.549 s |
| 163.187 s | 210.333 s | 47.146 s |
| 220.386 s | 264.800 s | 44.414 s |
| 274.851 s | 316.267 s | 41.416 s |

There were no decreasing timestamps. The stream was monotonic but stretched, with long silent holes inserted between question cycles.

### 2.2 Root cause: mixed audio formats across scenes

Per-scene inspection showed two incompatible formats:

| Scene type | Audio format |
| :--- | :--- |
| Narration scenes (question, options, answer, explanation) | **22,050 Hz, mono** |
| Think gate / silent scenes (`anullsrc`) | **44,100 Hz, stereo** |

The renderer concatenates scene MP4s with the FFmpeg concat demuxer and `-c copy`. Stream copy requires every input segment to share the same codec parameters. With 44.1 kHz stereo silent scenes interleaved between 22.05 kHz mono narration scenes, the concat demuxer produced a structurally valid but temporally corrupt audio stream. The video stream, which was uniform, concatenated correctly.

The previous 20-beat quiz did not contain a silent scene, so every scene shared the narration format and the defect stayed hidden.

### 2.3 Why re-encoding during concat did not help

Reproducing the concat with `-c:v copy -c:a aac` still produced a 326.36 s audio stream. The demuxed timestamps were already corrupt before the encoder; re-encoding preserved the gaps. The fix had to happen when each scene was encoded.

---

## 3. Fix

### 3.1 Canonical scene audio format

`packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py` now forces **44.1 kHz / 2 channels** on both scene encode paths:

- `open_pipe_encoder()` — the main raw-frame pipe used by the native renderer;
- `encode_static_scene()` — the static-image path.

```python
"-c:a", "aac",
"-b:a", "192k",
"-ar", "44100",
"-ac", "2",
```

Every scene, including silent think gates, is now encoded with identical AAC parameters. The concat demuxer has nothing to bridge.

### 3.2 Cache invalidation

`.factoryos_render_cache/` is git-ignored and content-addressed. Cached scenes rendered before the encoder change would have retained the old mixed formats, so the cache was deleted before the verification render. This is required whenever scene encode parameters change.

### 3.3 Result

| Metric | Corrupt render | Fixed render (Geography) | Fixed render (Science) |
| :--- | ---: | ---: | ---: |
| Video duration | 177.133 s | 173.800 s | 178.900 s |
| Audio duration | 326.311 s | 173.790 s | 178.890 s |
| A/V drift | 149,178 ms | **10 ms** | **10 ms** |
| Audio format | mixed in segments | 44.1 kHz / 2 ch | 44.1 kHz / 2 ch |
| Physical gate checks | n/a | 100 / 100 | 100 / 100 |

Both files now pass the full physical timing gate and F07.

---

## 4. Secondary Reliability Fixes

### 4.1 Ceiling floor used a fictional tail

`compileLocalRenderIntent()` previously estimated the audio floor with a flat **250 ms** tail for every scene, even though the universal quiz uses a **50 ms** tail and option D uses **0**. A Science script with 146.73 s of speech and six 5-second gates was rejected at **186.23 s** even though the real plan was under 180 s.

The floor now uses the scene’s actual `audioTailSeconds` and counts each gate as exactly 5.0 s. This removed a false `ProductionDurationExceededError` and keeps the guard honest.

### 4.2 Tails were tightened to fit full narration

The universal quiz tail is **50 ms** (last option `0`). Speech is never truncated. The 50 ms is padding after the WAV’s own trailing silence, so it is not audible as a clipped word. Geography speech is 141.54 s; Science speech is 146.73 s; both fit the 180 s ceiling with 30 s of gates.

### 4.3 Manifest could keep stale duplicates

`tools/render_quizshow_v2_samples.ts` merged new samples into the manifest by filtering out only one category. Rendering both datasets left the old Science entry and appended a second Science entry (and could duplicate Geography). The merge now uses a map keyed by category, so each dataset has exactly one current entry.

The manifest narrator label was also corrected to describe the actual engine:

```
Kore profile (Windows SAPI Zira female + warmth filter chain)
```

The prior label implied a cloud voice that was not used.

### 4.4 F07 score reporting

F07 logs `Score: undefined/100` while returning PASS. This is pre-existing reporting debt. It does not affect gate results, but the score should not be quoted until the field is populated. The physical verifier is the authoritative timing check.

---

## 5. Guardrails

1. **Assert format equality before concat.** Before calling `concatenate_scenes`, probe each scene’s audio codec, sample rate, and channel count; fail the render if they differ. The encoder fix prevents the known case, but the assertion prevents the class.
2. **Never accept F07 alone for timing.** F07 proved container/codec/geometry validity, not timeline validity. Keep `tools/verify_quiz_v2_timing.ts` in the release path.
3. **Invalidate the render cache when encoder parameters change.** Content-addressed scenes can outlive a format change.
4. **Measure physical audio, not planned durations.** The original defect was invisible in the timeline metadata and only appeared in the MP4.
5. **Keep speech and padding separate.** A shorter tail is acceptable; truncating narration is not.

---

## 6. Reproduction / Re-verification

```powershell
# Force clean scene renders after any encoder change
Remove-Item -Recurse -Force .factoryos_render_cache

npx tsx tools/render_quizshow_v2_samples.ts all

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

Expected: `100 passed, 0 failed` for each, A/V drift ≤ 500 ms (measured 10 ms), audio `44100 Hz / 2 ch`.

---

## 7. Residual Risks

- The concat demuxer still uses `-c copy`; format equality is currently guaranteed by the encoder, not asserted at concat time. Add the pre-concat probe described above before accepting third-party scene inputs.
- The render cache is shared per job ID; a stale cache can still mask encoder changes if it is not cleared. The cache is ignored and safe to delete.
- F07’s undefined score is unresolved.
- Science is at 178.9 s, only 1.1 s below the 180 s ceiling. Any longer Science script must either reduce narration or move to a higher ceiling; do not silently truncate.
