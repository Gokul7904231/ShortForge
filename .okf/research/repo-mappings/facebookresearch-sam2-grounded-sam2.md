# Repository Mapping: facebookresearch/sam2 + IDEA-Research/Grounded-SAM-2

Status: FUTURE BUILD REFERENCE
Adoption: PATTERN_EXTRACTION
Primary domain: promptable video segmentation, open-vocabulary grounding, subject tracking

Sources:
- https://github.com/facebookresearch/sam2
- https://github.com/IDEA-Research/Grounded-SAM-2
- Inspected 2026-09-26

Observed mechanism:
- SAM 2 provides promptable segmentation and video mask propagation with multi-object tracking support.
- Grounded SAM 2 combines open-set grounding with SAM 2 and supports text, box, point, and mask prompt paths.
- Grounded SAM 2 also documents continuous-ID tracking experiments, while explicitly noting that this path is still under development and not yet stable.

ShortForge treatment:
- Candidate CharacterTrackEvidence / SubjectTrackEvidence producer.
- Use open-vocabulary prompts to identify recurring characters/objects within a bounded scene window.
- Preserve masks/boxes, track IDs, source frame ranges, confidence and model fingerprints as evidence.
- Do not equate a track ID with a legally/semantically verified character identity without an additional identity resolver.

Limitations:
- Tracking can drift or fragment across shot cuts.
- Continuous identity across an entire movie requires cross-shot association and verification.
- Model execution is compute-heavy and must stay behind a worker/provider boundary.

Authority:
- Research only. F07 remains final physical verification authority; this subsystem cannot create release evidence by itself.
