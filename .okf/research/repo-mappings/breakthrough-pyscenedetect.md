# Repository Mapping: Breakthrough/PySceneDetect

Status: FUTURE BUILD REFERENCE
Adoption: PATTERN_EXTRACTION
Primary domain: deterministic shot/scene boundary detection

Source:
- https://github.com/Breakthrough/PySceneDetect
- Inspected 2026-09-26; current README identifies v0.7.1 (2026-07-21)
- License stated by upstream README: BSD-3-Clause

Observed mechanism:
- Multiple scene/shot detectors, including ContentDetector, AdaptiveDetector, and ThresholdDetector.
- Produces explicit scene start/end boundaries and can split media through FFmpeg.
- Exposes a Python API and CLI and documents benchmark evaluation of detector accuracy/speed.

ShortForge treatment:
- Use as a clean-room reference for a deterministic ShotBoundaryEvidence artifact.
- Keep detector choice behind a bounded Movie Source Analyzer.
- Preserve raw detector outputs, thresholds/configuration, and measured confidence as evidence.
- Use as fallback/ensemble evidence around a neural shot detector; do not let it choose highlights by itself.

Limitations:
- Boundary detection is not movie narrative understanding.
- It does not provide character identity, story graph, rights, or cinematic crop authority.

Authority:
- No production runtime dependency is added by this mapping.
- F00/F01/F02/F03/F04/F05/F06/F07 authority remains unchanged.
