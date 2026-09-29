# Repository Mapping: soCzech/TransNetV2

Status: FUTURE BUILD REFERENCE
Adoption: PATTERN_EXTRACTION
Primary domain: neural shot boundary detection

Source:
- https://github.com/soCzech/TransNetV2
- Inspected 2026-09-26; upstream README identifies TransNet V2 as a neural network for fast shot transition detection.
- Upstream README reports evaluation on ClipShots, BBC Planet Earth, and RAI and provides inference plus PyTorch inference paths.

Observed mechanism:
- Learns shot-transition evidence directly from video rather than relying only on simple frame-difference heuristics.
- Produces shot-transition predictions suitable for converting long media into explicit shot boundaries.

ShortForge treatment:
- Candidate neural detector for Movie Source Analyzer.
- Store predictions as evidence, then reconcile with deterministic detectors such as PySceneDetect.
- Create an ensemble/consensus boundary artifact rather than trusting one detector.
- Retain model/version/config fingerprint so later re-analysis is reproducible.

Limitations:
- Shot boundaries are not semantic scenes.
- Does not by itself solve character identity, narrative event extraction, rights, or reframing.

Authority:
- Research only. No direct model dependency or provider authority is introduced.
