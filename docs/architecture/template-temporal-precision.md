# ShortForge Temporal Precision & TTS Contract

Status: Wave 1 implementation — 2026-09-27

## Purpose

ShortForge treats time as a first-class production contract. Word count and words-per-second remain planning estimates only. The authoritative narration duration comes from physically synthesized audio after measurement and validation, then enters F05 as timing evidence.

## Architecture

TemplateDefinition
  -> TemporalCompiler
  -> TemplateScriptIR + TemporalPlanIR
  -> F04 media realization
  -> PrecisionTTSController
  -> physical audio measurement
  -> bounded corrective synthesis
  -> VerifiedAudioAsset + TemporalEvidence
  -> F05 TimelineIR
  -> F06
  -> F07

Provider-specific controls do not belong in templates. Templates express timing intent; adapters expose capabilities.

## TemporalContract

A template can define:
- target and tolerance;
- narration allocation and exact/bounded/flexible mode;
- pacing and pause policy;
- alignment granularity;
- bounded resynthesis and time-stretch policy;
- physical audio quality requirements.

## TemporalPlanIR

Each plan carries target milliseconds, target frames, FPS/timebase, beat start/duration, speech budget, pause budget, visual-only budget, transition budget, and compiler provenance.

Milliseconds describe audio timing. Frames remain the authoritative video quantization domain. A 30 FPS composition has a frame duration of approximately 33.33 ms, so arbitrary millisecond targets are projected deterministically rather than pretending every millisecond is a distinct video frame.

## PrecisionTTSController

Execution loop:
1. Synthesize.
2. Measure actual audio using MediaInspector.
3. Compare actual duration with target.
4. If supported, resynthesize with bounded speed correction.
5. If a small residual remains and policy permits, use bounded FFmpeg tempo correction.
6. Measure again.
7. For EXACT timing, fail closed if tolerance is still exceeded.

Provider claims are never accepted as physical duration truth.

## Cache

Voice cache identity includes target duration and timing mode, preventing a successful 2 second exact asset from being reused for a different timing contract.

## Evidence

TemporalEvidence records requested duration, measured duration, error, sample rate, sample count, provider/model, correction passes and methods, alignment capability and physical verification state.

## Default engine scope

The first temporal wave covers the current default content engines: Quiz, Facts, History and Motivation. The infrastructure is shared; each engine can express a different temporal grammar.

## Research disposition

Screened references include FastSpeech 2, F5-TTS, Azure Speech SSML duration controls, ElevenLabs timing metadata, Amazon Polly speech marks, Google SSML, FFmpeg timing filters, Remotion frame timing, and CTC forced alignment. These are architecture references only and do not become ShortForge authority.

## Current limitation

This wave implements measured closed-loop duration control. Provider-independent forced alignment is retained as a future capability boundary; adapters do not claim timestamps they do not actually produce.

## Verification

Dedicated temporal validation covers deterministic temporal planning and measured TTS correction. CI status is recorded separately in the Team report.
