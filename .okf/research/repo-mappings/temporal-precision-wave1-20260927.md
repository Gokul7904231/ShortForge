# Temporal Precision Wave 1 — 2026-09-27

## Scope

Upgrade ShortForge so seconds/minutes are production constraints backed by measured audio, bounded corrective synthesis and deterministic frame projection.

## Screened references

- FastSpeech 2 — duration as a controllable speech variable.
- F5-TTS — fixed-duration inference and alignment-aware editing.
- Azure Speech SSML — requested audio-duration control.
- ElevenLabs — timing/alignment metadata and speech-rate controls.
- Amazon Polly — sentence/word/viseme speech marks.
- Google Cloud Speech — SSML pauses and timepoint markers.
- FFmpeg — bounded tempo correction.
- Remotion — frame-domain timing.
- CTC forced alignment — provider-independent alignment concept.

## Adoption

| Reference | Disposition | ShortForge use |
| --- | --- | --- |
| FastSpeech 2 | ADOPT conceptually | Treat duration as controllable synthesis state. |
| F5-TTS | ADAPT | Fixed-duration/alignment ideas inform capability contracts. |
| Azure Speech | ADAPT | Exact-duration support belongs at adapter boundary. |
| ElevenLabs | ADAPT | Timing metadata is optional provider capability. |
| Amazon Polly | ADAPT | Speech-mark granularity informs future AlignmentIR. |
| Google SSML | ADAPT | Pauses/timepoints compile from semantic timing intent. |
| FFmpeg | ADOPT boundedly | Existing AudioPipeline performs micro-correction. |
| Remotion | ADOPT conceptually | Store milliseconds plus deterministic frame projection. |
| CTC forced alignment | CANDIDATE | Later provider-independent alignment layer. |

## Authority

No external system becomes a second scheduler, template authority, or release authority.

Ascalon/SCL proposes timing allocations and repair strategies. Deterministic compilation, TTS execution, physical measurement and F05 remain authoritative.

## Training consequence

Training evidence should distinguish estimate, provider request, provider response, observed physical duration, deterministic frame projection and final verified artifact. Ascalon must not self-certify timing.
