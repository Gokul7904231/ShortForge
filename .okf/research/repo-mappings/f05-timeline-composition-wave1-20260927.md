# Floor 05 Timeline Composition — Research & Adoption Ledger (2026-09-27)

External repositories and research are evidence sources only. Executable ShortForge contracts, Guardian policy, CI evidence and .okf governance remain authoritative.

## Repository / research signals

| Source | Relevant signal | ShortForge disposition |
|---|---|---|
| OpenTimelineIO | Rational time, explicit time ranges, track/clip/media-reference separation, serialized interchange | ADOPTED AS BOUNDARY REFERENCE: F05 now uses a rational frame timebase and explicit clip identity; OTIO is not the runtime authority |
| Remotion | Frame-driven programmatic composition and renderer/encoding architecture suitable for programmatic/agentic video | ADOPTED AS FUTURE ADAPTER REFERENCE: renderer abstraction and deterministic frame execution; no replacement of F06/Guardian |
| FFprobe / FFmpeg | Machine-readable stream/container inspection and deterministic command-line media processing | ADOPTED: F05 reference renderer produces real MP4 and physical validation uses ffprobe JSON |
| VBench / VBench-2.0 | Fine-grained multidimensional video-quality evaluation and capability dimensions | ADOPTED AS DOWNSTREAM EVALUATION SIGNAL ONLY |
| C2PA specifications / c2pa-rs | Manifest/ingredient/assertion provenance and cryptographic receipts | RETAINED DOWNSTREAM: F05 carries provenance hashes; C2PA signing remains a later authority boundary |
| OpenAssetIO | Logical media identity separated from physical location | EXTENDS EXISTING RULE: F03 remains logical intent; F04 owns physical asset realization; F05 consumes immutable physical references |

## Concrete F05 improvements

1. Replaced float-only timeline semantics with a rational frame timebase.
2. Added mandatory scene identity to timeline clips.
3. Added deterministic TimelineSpec fingerprinting.
4. Expanded render-input hashing to include timing, subtitles, transitions, trim values, source checksums, source sizes and media metadata.
5. Removed composition-time fallback substitution of one scene's asset for another.
6. Added exact F03/F04 asset-set, path and version enforcement.
7. Replaced header-only fake MP4 generation with real FFmpeg rendering.
8. Replaced header-only video validation with ffprobe stream/container evidence.
9. Added semantic checks for audio overlap and transition-explained visual overlap.
10. Added atomic registry writes and committed-render lookup.
11. Added pre-render crash journaling and evidence quarantine.
12. Hardened F05 -> F06 handoff with committed state, exact artifact checksum/size, timeline fingerprint and render-input identity.
13. Bound TimelineBrain proposals to the input semantic fingerprint and explicit Guardian authorization requirement.
14. Changed Ascalon F05 execution capability to MEDIUM risk with mandatory Guardian gate.
15. Corrected F03 execution-report version metadata to 2.3.1.

## Explicit non-adoption

No third-party code, provider credential, model weight, renderer, storage system or policy authority was copied into ShortForge. Research can shape boundary design but cannot override executable tests, Guardian policy or .okf.


## Research Wave 2 — 2026-09-27

### Recent evidence reviewed

| Source | Recent signal | ShortForge disposition |
|---|---|---|
| PhiloLabs/agentic-vbench | 100 real post-production tasks across repair, assembly, sequencing and repurpose; deterministic verifiers plus rubric judges | ADOPTED AS EVALUATION PATTERN: keep programmatic hard gates separate from model-quality judgment |
| Unified Agentic Video Editing (arXiv:2609.12769, 2026-09-11) | Hierarchical scene/shot metadata, structured intermediate decisions, creative objectives and explicit trade-offs | ADOPTED AS DECISION-TRACE PATTERN: TimelineProposalIR records scene order, transition policy and constraints without granting runtime authority |
| BEAT (arXiv:2605.27067, 2026-05-26) | Rhythm-elastic music/shot alignment using structured signals and dynamic programming | ADOPTED AS FUTURE OPTIONAL SIGNAL: F05 may later add bounded rhythm cues; no music-sync authority is added here |
| Agentic Video Generation via Executable Event Graphs (arXiv:2604.10383, 2026-04-11) | Formal event/time graphs plus a programmatic state backend to guarantee executability | ADOPTED AS ARCHITECTURAL SUPPORT: keep agent proposals typed and execution constraints deterministic |
| remotion-dev/remotion v4.0.529 (2026-09-25) | Active frame-driven programmatic composition stack | RETAINED AS PRIMARY COMPOSITION REFERENCE behind TimelineIR; no renderer becomes semantic authority |
| Lightricks/LTX-2 v1.3.0 (2026-08-26) | Recent deterministic inference and fractional-frame-rate work | RESEARCH-ONLY FOR F03/F04 PROVIDER CAPABILITIES; F05 stays engine-neutral |

### Wave 2 implementation disposition

1. Explicit upstream transition intent is preserved from F03 to F05.
2. Zero-duration CUT transitions are first-class instead of silently converting all scenes to crossfades.
3. Decoder smoke testing is separate from metadata inspection.
4. Recovery is fail-closed unless the journal contains verifiable artifact identity.
5. Idempotent render reuse performs a fresh SHA-256/size integrity check.
6. TimelineBrain produces a typed proposal trace for Ascalon training and evaluation.
7. The new proposal trace is evidence only; Guardian authorization and F07 remain authoritative.

### Non-adoption

No third-party renderer, agent harness, benchmark score, provider credential, model weight, or external policy was promoted into the production authority chain.
