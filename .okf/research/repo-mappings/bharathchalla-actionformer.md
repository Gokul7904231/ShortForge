# Repository Mapping: BharathChalla/ActionFormer

Status: FUTURE BUILD REFERENCE
Adoption: PATTERN_EXTRACTION
Primary domain: temporal action localization in untrimmed video

Source:
- https://github.com/BharathChalla/ActionFormer
- Inspected 2026-09-26; ECCV 2022 implementation.

Observed mechanism:
- Transformer-based temporal action localization that predicts action start/end boundaries and labels.
- Uses local temporal context and regresses action boundaries without predefined proposal windows.
- Repository includes inference/training/evaluation paths and temporal benchmarks.

ShortForge treatment:
- Candidate VisualEventEvidence producer for action-heavy movie segments.
- Use event boundaries as one evidence stream alongside dialogue, shot, character, audio and visual saliency.
- Preserve tIoU/threshold/evaluation configuration in evidence metadata where applicable.

Limitations:
- Action classes and benchmark-trained priors may not transfer directly to arbitrary film events.
- It should not be treated as the narrative judge or clip selector.

Authority:
- Research only.
