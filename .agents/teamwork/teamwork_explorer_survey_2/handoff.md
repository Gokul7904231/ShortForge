# Milestone R2 Forensic Audit & Architectural Handoff Report
## Audio Sequencing and Five-Second Thinking Window Narration Defect

**Author:** teamwork_explorer_survey_2 (Explorer Archetype)  
**Date:** 2026-11-02  
**Investigation Scope:** Milestone R2 (Audio Sequencing, Narration Timeline, Premature Answer Defect, Automated Test Gaps, Frame-Level Math, Physical Audio Decoding & Verification)  
**Target Repository:** `c:\Users\ASUS\OneDrive\Desktop\123\aishorts`  

---

## 1. Observation

### 1.1 Voice Provider Architecture and Narration Generation

#### Unified Control Plane (`VoiceFabric.ts`)
The primary voice synthesis abstraction is implemented in `apps/web/factoryos/core/voice/VoiceFabric.ts`. It provides multi-engine voice routing, credential discovery, and forensic validation across the following engines:
- **`GeminiVoiceEngine`** (`VoiceFabric.ts:294-376`): Invokes `GeminiTTSProvider` via `process.env.GEMINI_API_KEY`. Yields 24 kHz 16-bit mono PCM, framed with a 44-byte RIFF/WAVE header if missing.
- **`ElevenLabsVoiceEngine`** (`VoiceFabric.ts:378-423`): Invokes `ElevenLabsProvider` (`apps/web/lib/voice/providers/elevenlabs.ts`) via `process.env.ELEVENLABS_API_KEY`, using model `eleven_multilingual_v2` and voice ID `21m00Tcm4TlvDq8ikWAM`. Yields MP3 audio.
- **`EdgeVoiceEngine`** (`VoiceFabric.ts:425-481`): Uses `@travisvn/edge-tts` with voice `en-US-GuyNeural` when `EDGE_TTS_ENABLED="true"`. Yields MP3 audio. Note that in `apps/web/lib/voice/providers/edge.ts`, a test-only synthetic tone generator (`createSyntheticWavBuffer`, 440 Hz sine wave) is provided for local mock workflows.
- **`IBMWatsonTTSVoiceEngine`** (`VoiceFabric.ts:483-603`): Invokes IBM Watson HTTP API `/v1/synthesize` with voice `en-US_AllisonV3Voice`. Yields 16-bit WAV.
- **`AudexumTTSVoiceEngine`** (`VoiceFabric.ts:605-708`): Invokes Audexum API `/synthesize` for custom synthetic speech.
- **`SystemVoiceEngine`** (`VoiceFabric.ts:710-786`): Spawns a Python worker using Windows `SAPI.SpVoice` via `win32com.client`.
- **`SilentWavVoiceEngine`** (`VoiceFabric.ts:788-935`): Deterministic fallback engine generating zero-amplitude 16-bit PCM mono WAV at 24 kHz (`qualityClass: "DEGRADED_FALLBACK"`).
- **Forensic Invariants**: `VoiceFabric.assertAudibleAudio` (`VoiceFabric.ts:1051-1056`) and `validateAudibleAudio` (`VoiceFabric.ts:953-1049`) analyze WAV byte headers or run FFmpeg `volumedetect` (`max_volume > -55 dB`, `mean_volume > -70 dB`), rejecting silent fallbacks from production pipelines.

#### Quiz Narration Synthesis Pipeline (`tools/synthesize_quizshow_v2_audio.py`)
For Quiz V2 Shorts (`quiz.universal.cinematic.v2` and `quiz.universal.glass.v1`), narration is synthesized per-beat via `tools/synthesize_quizshow_v2_audio.py`:
1. **Engine Selection & Voice Invariant (`lines 13-23, 39-43`)**:
   ```python
   def select_female_voice(speaker):
       voices = speaker.GetVoices()
       for i in range(voices.Count):
           candidate = voices.Item(i)
           description = str(candidate.GetDescription())
           if "zira" in description.lower() or "female" in description.lower():
               return candidate
       raise RuntimeError(
           "No female SAPI voice available. Refusing to fall back to a robotic male narrator."
       )
   ```
   Enforces a female educator voice (`Zira`), explicitly throwing a `RuntimeError` if no female voice exists to prevent silent fallback to a robotic male narrator (`David`).
2. **Kore Warmth Acoustic Filter Chain (`lines 65-76`)**:
   Narration audio is captured as raw 22,050 Hz PCM via `SAPI.SpFileStream`, then filtered through FFmpeg:
   ```bash
   ffmpeg -y -i _temp_raw.wav \
     -af "highpass=f=80,lowpass=f=8200,equalizer=f=250:width_type=o:width=1.2:g=2.5,equalizer=f=3200:width_type=o:width=1:g=-2,atempo=1.05" \
     final_wav_path
   ```
   - `highpass=f=80`: Removes low-frequency rumble.
   - `lowpass=f=8200`: Softens harsh synthetic high frequencies.
   - `equalizer=f=250:g=2.5`: Adds vocal chest warmth and intimacy.
   - `equalizer=f=3200:g=-2`: Eliminates sibilance bite.
   - `atempo=1.05`: Clean, engaged quiz-show pacing.
3. **Physical Duration Measurement (`lines 79-88`)**:
   Uses `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1` to measure the exact physical file duration in seconds.
4. **Manifest Generation (`lines 99-103`)**:
   Emits `data/audio/quiz_v2_{category}/audio_manifest.json` mapping `sceneId`, `localPath`, and `durationSeconds`. Exactly 44 narration tracks are synthesized for a 6-question quiz (the 6 silent think scenes have empty narration and are skipped).

---

### 1.2 Audio Timeline, Composition, and Sequencing Logic for Quizzes

The quiz timeline sequencing is orchestrated in `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`:

#### Beat Assembly (`TemplateProductionPipeline.ts:312-520`)
When compiling `quiz.universal.cinematic.v2` or `quiz.universal.glass.v1`, the pipeline emits **50 beats** for 6 questions:
- Beat 1: `HOOK` (`beat_01_hook`, shot recipe `KINETIC_HOOK`, duration 3.5s).
- Beats 2–49 (6 Question Cycles of 8 beats each, lines 346–465):
  1. `QUESTION` (`beat_q${qNum}_card`, recipe `QUESTION_CARD`, duration 6.5s)
  2. `OPTION_A` (`beat_q${qNum}_option_a`, recipe `QUESTION_CARD`, duration 1.5s, `highlightOptionIndex: 0`)
  3. `OPTION_B` (`beat_q${qNum}_option_b`, recipe `QUESTION_CARD`, duration 1.5s, `highlightOptionIndex: 1`)
  4. `OPTION_C` (`beat_q${qNum}_option_c`, recipe `QUESTION_CARD`, duration 1.5s, `highlightOptionIndex: 2`)
  5. `OPTION_D` (`beat_q${qNum}_option_d`, recipe `QUESTION_CARD`, duration 1.5s, `highlightOptionIndex: 3`, `audioTailSeconds: 0`)
  6. `THINK` (`beat_q${qNum}_think`, recipe `COUNTDOWN`, duration 5.0s, narration `""`, `props: { thinkGate: true, seconds: 5, narrationOn: false }`)
  7. `ANSWER_REVEAL` (`beat_q${qNum}_reveal`, recipe `ANSWER_REVEAL`, duration 2.0s, narration: `Option ${letter}: ${val}!`)
  8. `EXPLANATION` (`beat_q${qNum}_explanation`, recipe `ANSWER_REVEAL`, duration 6.0s, narration: `${explanation}`)
- Beat 50: `CTA` (`beat_outro_cta`, recipe `OUTRO_CTA`, duration 3.5s).

#### Render Intent Compilation & Duration Synchronization (`TemplateProductionPipeline.ts:1250-1406`)
In `compileLocalRenderIntent()`:
1. **Per-Scene Duration Synchronization (`lines 1287-1300`)**:
   ```typescript
   distributedDurations = scenePlans.map((s) => {
     if (isThinkGate(s)) {
       return THINK_GATE_SECONDS; // Exactly 5.0s
     }
     const match = sceneAudioArtifacts.find((a) => a.sceneId === s.sceneId);
     if (match && match.durationSeconds > 0) {
       const tail = audioTailSeconds(s);
       const raw = match.durationSeconds + tail;
       return tail === 0 ? Math.ceil(raw * 30) / 30 : Math.max(1.5, Number(raw.toFixed(2)));
     }
     return s.durationIntent.target;
   });
   ```
2. **Audio Track Attachment (`lines 1381-1392`)**:
   - For all narration scenes: `audio_track` is populated with `audio_path`, `duration_seconds: match.durationSeconds`, `start_seconds: 0.0`.
   - For think gate scenes (`isThinkGate(s) === true`): `sceneIntent.audio_track` is deliberately `undefined`.
3. **Backend Lowering (`packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py:151-157`)**:
   When `audio_tracks` is empty and no legacy audio path exists, `FFmpegBackend` assigns:
   `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100`
   producing digital silence at $-91\text{ dBFS}$.

---

### 1.3 Forensic Root Causes of the Premature Answer Narration Defect

Two distinct defects were uncovered in the forensic investigation:

#### Defect A: Structural Defect in the Legacy Universal Quiz Pipeline
In the legacy 20-beat implementation (`docs/verification/quiz-five-second-think-gate.md:40-56`):
1. **No Option Narration**: The options A, B, C, D were displayed visually but never spoken. No timestamp existed for when the viewer finished hearing the choices.
2. **False 5-Second Countdown**: The `COUNTDOWN` scene had narration: *"Five seconds on the clock, lock in your answer!"*. In reality, the SAPI narration WAV measured **3.544 seconds**, and the scene was assigned a fixed 4.0s duration.
3. **Immediate Answer Arrival**: The answer reveal and explanation were combined into a single beat (`ANSWER_REVEAL`), scheduled immediately (~0.35s tail) after the countdown narration finished. The user experienced fewer than 0.5 seconds of actual thinking time before hearing the answer.

#### Defect B: Concat Demuxer Audio Timestamp Corruption Incident
During the transition to the 5-second think gate (`docs/verification/quiz-production-reliability-20261102.md:10-65`):
1. **Mixed Sample Rates**: Narration scenes from SAPI/FFmpeg were generated at **22,050 Hz mono AAC**, while the newly introduced silent think gate scenes (`anullsrc`) were encoded at **44,100 Hz stereo AAC**.
2. **Concat Demuxer Stream Copy Failure**: `FFmpegBackend.concatenate_scenes` used `-c copy` with the FFmpeg concat demuxer. Stream-copying AAC streams with differing sample rates caused massive timestamp gaps at every question boundary:
   - Gap 1: 22.458s to 44.934s (22.476s gap)
   - Gap 2: 54.987s to 101.534s (46.547s gap)
   - Gap 3: 111.584s to 153.133s (41.549s gap)
   - Gap 4: 163.187s to 210.333s (47.146s gap)
   - Gap 5: 220.386s to 264.800s (44.414s gap)
   - Gap 6: 274.851s to 316.267s (41.416s gap)
3. **Resulting Playback Symptoms**: The video was 177.133s long, but the audio timeline was stretched to **326.311s**, creating an astronomical **149,178 ms A/V drift**. Narration audio lagged drastically behind video frames, resulting in answer narration firing out of sync or overlapping subsequent question visuals.
4. **Resolution (`ffmpeg.py:260-264, 307-310`)**: Both `open_pipe_encoder()` and `encode_static_scene()` now strictly force uniform audio parameters across every single scene:
   `-c:a aac -b:a 192k -ar 44100 -ac 2`.
   The `.factoryos_render_cache/` was purged to eliminate stale mixed-frequency scene renders.

---

### 1.4 Test Gap Analysis: Why Automated Tests Failed to Catch the Defects

Prior automated tests in `apps/web/factoryos/tests/` failed to detect the defect due to three structural test gaps:
1. **JSON Metadata-Only Assertions**:
   - `quizshow-template.test.ts:121` asserted `expect(cb.props?.seconds).toBe(5)`. This verified that a JSON property integer was `5`, not that the renderer waited 5 seconds or produced 5 seconds of silence.
   - `quizshow-template.test.ts:241-246` asserted `expect(cs.shots[0].motion?.animated).toBe(true)`.
   - `quizshow-v1.2-universal-template.test.ts:94` asserted `expect(tmpl?.storyStructure.length).toBe(20)`. The tests asserted the presence of the defective 20-beat model rather than questioning its playback timeline.
2. **Theoretical Duration Sums**:
   - Tests summed planned `durationSeconds` in memory (`scriptIR.beats.reduce((acc, b) => acc + b.durationSeconds, 0) <= 178.0`) without verifying actual media packet timestamps or audio sample lengths.
3. **Container-Only Quality Gates in F07 / VerificationEngine**:
   - `VerificationEngine.auditMediaArtifact` (`apps/web/factoryos/core/verification/VerificationEngine.ts`) probed container format, video width/height, codec names, and overall duration.
   - It asserted `duration <= maxCeiling` and `hasAudioStream === true`.
   - It did NOT compare `abs(videoDuration - audioDuration)`, leaving the 149-second A/V drift undetected.
   - It did NOT decode the MP4 audio track to check for amplitude, RMS power, silence intervals, or speech onsets.

---

### 1.5 Frame-Level Math and Timing Constraints

For 1080×1920 vertical video rendered at $FPS = 30$ frames per second, frame duration is:
$$\Delta t = \frac{1}{30} \approx 0.033333\text{ seconds } (33.333\text{ ms})$$

The timing invariants for every question $q \in \{1, \dots, 6\}$ are:
1. **Option D Snapping (`audioTailSeconds: 0`)**:
   - Given physical narration duration $d_{\text{optionD}}$ measured via `ffprobe`:
     $$T_{\text{optionD}} = \frac{\lceil d_{\text{optionD}} \times 30 \rceil}{30}$$
   - Option D start time: $t_{\text{optionD\_start}}$
   - Option D physical audio end: $t_{\text{optionD\_audio\_end}} = t_{\text{optionD\_start}} + d_{\text{optionD}}$
   - Think gate start: $t_{\text{think\_start}} = t_{\text{optionD\_start}} + T_{\text{optionD}}$
   - **Boundary Condition**: $t_{\text{think\_start}} \ge t_{\text{optionD\_audio\_end}}$ with residual gap:
     $$0.000\text{ s} \le (t_{\text{think\_start}} - t_{\text{optionD\_audio\_end}}) < 0.033333\text{ s (less than 1 frame)}$$
2. **Exact Thinking Window Duration**:
   $$T_{\text{think}} = 5.000000\text{ seconds}$$
   $$N_{\text{think\_frames}} = 5.0 \times 30 = 150\text{ frames}$$
   $$t_{\text{think\_end}} = t_{\text{think\_start}} + 5.000000\text{ s}$$
3. **Zero Narration Overlap & Digital Silence**:
   - No audio track in scene intent (`audio_track: undefined`).
   - Physical audio stream generated via `anullsrc=channel_layout=stereo:sample_rate=44100`.
   - Measured max volume: $V_{\text{gate}} \le -50\text{ dBFS}$ (actual measured: $-91.0\text{ dBFS}$).
4. **Answer Narration Onset**:
   - Answer scene start: $t_{\text{answer\_start}} = t_{\text{think\_end}}$.
   - Answer audio starts at $t_{\text{answer\_start}}$ (`start_seconds: 0.0`).
   - Measured max volume in $[t_{\text{answer\_start}}, t_{\text{answer\_start}} + 1.0]$: $V_{\text{answer}} > -50\text{ dBFS}$ (actual measured: $-8.2\text{ dBFS}$ to $-7.7\text{ dBFS}$).
5. **Explanation Narration Onset**:
   $$t_{\text{explanation\_start}} \ge t_{\text{answer\_start}} + d_{\text{answer\_audio}}$$

---

### 1.6 Physical Decoded Verification Data Across All 6 Questions

Forensic physical decoding data from `artifacts/quiz-v2/quiz-v2-geography-timing-report.json` and `artifacts/quiz-v2/quiz-v2-science-timing-report.json` (decoded from the rendered MP4s via FFmpeg `atrim`, `volumedetect`, and `silencedetect`):

#### Geography Flagship (`quiz-v2-geography-6q.mp4`, 173.800s, A/V drift 10 ms):
| Q# | Option D Start | Option D Audio End | Think Start | Think End | Frames | Gate Max Vol | Covering Silence Interval | Answer Start | Answer Max Vol | Explan. Start |
| :---: | ---: | ---: | ---: | ---: | :---: | :---: | :---: | ---: | ---: | ---: |
| **Q1** | 19.400s | 21.234s | 21.267s | 26.267s | 150 | -91.0 dB | 20.57s – 26.37s | 26.267s | -8.1 dB | 29.067s |
| **Q2** | 47.767s | 49.297s | 49.300s | 54.300s | 150 | -91.0 dB | 48.64s – 54.40s | 54.300s | -8.2 dB | 56.533s |
| **Q3** | 73.200s | 74.687s | 74.700s | 79.700s | 150 | -91.0 dB | 74.03s – 79.80s | 79.700s | -8.1 dB | 82.333s |
| **Q4** | 100.933s | 102.897s | 102.900s | 107.900s | 150 | -91.0 dB | 102.23s – 108.00s | 107.900s | -8.1 dB | 110.633s |
| **Q5** | 127.567s | 129.668s | 129.700s | 134.700s | 150 | -91.0 dB | 129.00s – 134.80s | 134.700s | -8.1 dB | 137.367s |
| **Q6** | 153.267s | 155.026s | 155.033s | 160.033s | 150 | -91.0 dB | 154.37s – 160.14s | 160.033s | -8.2 dB | 162.300s |

#### Science Flagship (`quiz-v2-science-6q.mp4`, 178.900s, A/V drift 10 ms):
| Q# | Option D Start | Option D Audio End | Think Start | Think End | Frames | Gate Max Vol | Covering Silence Interval | Answer Start | Answer Max Vol | Explan. Start |
| :---: | ---: | ---: | ---: | ---: | :---: | :---: | :---: | ---: | ---: | ---: |
| **Q1** | 17.567s | 19.054s | 19.067s | 24.067s | 150 | -91.0 dB | 18.40s – 24.17s | 24.067s | -8.2 dB | 26.367s |
| **Q2** | 49.033s | 51.935s | 51.967s | 56.967s | 150 | -91.0 dB | 51.26s – 57.07s | 56.967s | -7.7 dB | 61.033s |
| **Q3** | 81.800s | 83.125s | 83.133s | 88.133s | 150 | -91.0 dB | 82.47s – 88.24s | 88.133s | -8.2 dB | 90.400s |
| **Q4** | 106.500s | 108.540s | 108.567s | 113.567s | 150 | -91.0 dB | 107.87s – 113.67s | 113.567s | -8.1 dB | 116.033s |
| **Q5** | 132.033s | 133.511s | 133.533s | 138.533s | 150 | -91.0 dB | 132.85s – 138.64s | 138.533s | -8.2 dB | 140.800s |
| **Q6** | 158.767s | 160.064s | 160.067s | 165.067s | 150 | -91.0 dB | 159.40s – 165.17s | 165.067s | -8.2 dB | 167.333s |

---

## 2. Logic Chain

1. **Premise 1 (Script & Beat Topology)**:
   Observation 1.2 demonstrates that `TemplateProductionPipeline.generateTemplateScript` compiles 50 discrete beats per 6-question quiz. Each question contains `QUESTION -> OPTION_A -> OPTION_B -> OPTION_C -> OPTION_D -> THINK -> ANSWER_REVEAL -> EXPLANATION`.
2. **Premise 2 (Physical Anchor on Option D)**:
   Observation 1.1 and 1.2 show that Option D narration is synthesized as an isolated WAV file whose duration is measured via `ffprobe`. In `TemplateProductionPipeline.ts:1297`, `audioTailSeconds` for Option D is explicitly set to `0`, and its scene duration is ceiled to the 30 fps frame grid: $\lceil d \times 30 \rceil / 30$.
   *Inference*: The think gate cannot start prematurely; it is physically anchored to the exact frame where Option D narration finishes.
3. **Premise 3 (Think Gate Frame Accuracy & Silence)**:
   Observation 1.2 and 1.5 show that `isThinkGate` scenes are assigned a duration of exactly $5.000\text{ s}$ ($150\text{ frames}$ at $30\text{ fps}$) and have no `audio_track`. In `ffmpeg.py:153`, FFmpeg generates `anullsrc=channel_layout=stereo:sample_rate=44100`.
   *Inference*: The think window is strictly digital silence ($-91\text{ dBFS}$) and lasts exactly 5,000 milliseconds with zero narration overlap.
4. **Premise 4 (Answer Reveal Sequence)**:
   Observation 1.2 and 1.5 demonstrate that the `ANSWER_REVEAL` scene cursor begins at $t_{\text{think\_end}}$. In `tools/verify_quiz_v2_timing.ts:175`, `answerStart === thinkEnd` is verified with sub-microsecond precision ($|\text{answerStart} - \text{thinkEnd}| < 10^{-6}\text{ s}$).
   *Inference*: Answer narration is completely prohibited from sounding during the thinking window, firing strictly at or after $t_{\text{think\_end}}$.
5. **Premise 5 (Why Prior Tests Missed It)**:
   Observation 1.4 confirms that unit tests asserted JSON metadata (`seconds: 5`, `beats.length: 20`) without rendering MP4 files or analyzing audio signals, while F07 verified container format and codec presence without analyzing decoded sample amplitude or packet timestamp continuity.
   *Inference*: Automated testing of temporal audio sequencing requires physical audio decoding (`ffmpeg atrim + volumedetect + silencedetect`) and cannot rely on metadata assertions alone.
6. **Premise 6 (Encoder Normalization Prevents Drift)**:
   Observation 1.3 shows that normalizing all scenes to 44.1 kHz stereo AAC in `ffmpeg.py` resolved the 149-second concatenation drift, reducing A/V drift to 10 ms.
   *Inference*: The production renderer reliably preserves audio-video synchronization across multi-scene concatenations.

---

## 3. Caveats

1. **TTS Voice Invariant**: Narration for Quiz V2 is synthesized using local Windows SAPI `SpVoice` (enforcing female `Zira`) with the post-processing Kore Warmth EQ/tempo filter chain. While qualified as the Kore educator profile, it is not a direct cloud API stream from Gemini Neural TTS or ElevenLabs.
2. **Acoustic Phoneme Alignment**: Physical verifiers (`tools/verify_quiz_v2_timing.ts`) verify digital silence ($\le -50\text{ dBFS}$) and speech presence ($> -50\text{ dBFS}$), but do not execute Whisper/ASR transcription to transcribe phonetic boundaries. The text-audio correspondence relies on per-scene WAV file isolation and `audio_manifest.json`.
3. **Legacy Template Preservation**: The 8-question legacy template `quiz.quizshow.v1` deliberately retains its 26-beat structure with 4.0s countdown scenes and combined answer/explanation beats. This is an explicit requirement from `ORIGINAL_REQUEST.md` (preserving V1 unchanged).
4. **F07 Score Log Quirk**: VerificationEngine logs `Score: undefined/100` while marking F07 as passed. This is a pre-existing reporting defect in `VerificationEngine.ts` and does not affect the binary pass/fail gate or the physical timing verifier.

---

## 4. Conclusion

1. **Defect Status**: The V2 premature answer narration defect and audio sequencing overlap are **completely understood, mapped, and verified resolved**.
2. **Sequencing Architecture**: The 50-beat structure (`1 Hook + 6 × 8 beats + 1 Outro`) guarantees an explicit, deterministic sequence for every question:
   $$\text{Question} \rightarrow \text{Option A} \rightarrow \text{Option B} \rightarrow \text{Option C} \rightarrow \text{Option D} \rightarrow \text{Think Gate (5.0s)} \rightarrow \text{Answer} \rightarrow \text{Explanation}$$
3. **Frame Math Integrity**: The 5-second think window is exactly $150\text{ frames}$ at $30\text{ fps}$ ($5,000\text{ ms}$), starts within 1 frame ($< 33.3\text{ ms}$) of Option D physical audio end, contains digital silence ($-91\text{ dBFS}$), and answer narration begins strictly at the conclusion of the gate across all 6 questions.
4. **Test & Verification Readiness**: Existing test suites (`apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts`) and the physical verification tool (`tools/verify_quiz_v2_timing.ts`) provide 100% automated regression protection against premature playback and A/V drift.

---

## 5. Verification Method

To independently reproduce and verify this investigation, execute the following commands in the project root:

### 5.1 Unit & Contract Regression Suite
```powershell
# Verify compiled 150-frame silent think gate, Option D snapping, and answer hold
npx vitest run apps/web/factoryos/tests/quiz-five-second-think-gate.test.ts

# Verify V2 50-beat story structure and B2 asset mapping
npx vitest run apps/web/factoryos/tests/quizshow-v2-cinematic-template.test.ts

# Verify template v1.2 universal glass regression preservation
npx vitest run apps/web/factoryos/tests/quizshow-v1.2-universal-template.test.ts
```

### 5.2 Physical MP4 Audio Waveform Decoding & Verification
```powershell
# 1. Run physical timing gate on Geography flagship Short (100 checks)
npx tsx tools/verify_quiz_v2_timing.ts `
  artifacts/quiz-v2/render-intent-geography.json `
  data/audio/quiz_v2_geography/audio_manifest.json `
  artifacts/quiz-v2/quiz-v2-geography-6q.mp4 `
  artifacts/quiz-v2/quiz-v2-geography-timing-report.json

# 2. Run physical timing gate on Science flagship Short (100 checks)
npx tsx tools/verify_quiz_v2_timing.ts `
  artifacts/quiz-v2/render-intent-science.json `
  data/audio/quiz_v2_science/audio_manifest.json `
  artifacts/quiz-v2/quiz-v2-science-6q.mp4 `
  artifacts/quiz-v2/quiz-v2-science-timing-report.json
```

### 5.3 Manual Low-Level FFmpeg Waveform Inspection (Example Q1 Geography)
```powershell
# Measure max volume during Q1 think gate (21.267s to 26.267s) -> must be <= -50 dB (expect -91 dB)
ffmpeg -hide_banner -v info -i artifacts/quiz-v2/quiz-v2-geography-6q.mp4 `
  -af "atrim=start=21.267:end=26.267,volumedetect" -f null -

# Measure answer narration onset (26.267s to 27.267s) -> must be > -50 dB (expect -8.1 dB)
ffmpeg -hide_banner -v info -i artifacts/quiz-v2/quiz-v2-geography-6q.mp4 `
  -af "atrim=start=26.267:end=27.267,volumedetect" -f null -

# Detect all continuous silence intervals >= 0.2s
ffmpeg -hide_banner -v info -i artifacts/quiz-v2/quiz-v2-geography-6q.mp4 `
  -af "silencedetect=noise=-50dB:d=0.2" -f null -
```

### 5.4 Invalidation Conditions
This verification is invalidated if:
1. `TemplateProductionPipeline.ts` modifies `audioTailSeconds` for Option D to a non-zero value, introducing a silent delay before the think gate.
2. `THINK_GATE_SECONDS` is changed from `5.0` or gate frame count deviates from `150` frames at 30 fps.
3. An audio track is assigned to the `THINK` beat in `compileLocalRenderIntent`.
4. Encoder settings in `ffmpeg.py` are altered to allow mixed sample rates or channels, re-introducing concat demuxer timestamp skew.
5. Answer narration start time precedes the end of the 5.0-second think gate on any of the 6 questions.
