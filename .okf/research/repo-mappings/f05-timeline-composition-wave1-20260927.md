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
