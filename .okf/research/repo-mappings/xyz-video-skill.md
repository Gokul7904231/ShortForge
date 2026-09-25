# xyz-video-skill → Floor 03 Mapping

Source: https://github.com/huangserva/xyz-video-skill/tree/refactor/video-creator

Observed pattern:
- storyboard is a strict scenes→shots protocol.
- video_references are purpose-driven: first frame, character, prop, composition, style, stage, target state.
- continuity_mode and chain_from_previous are explicit.
- Review modes separate automated checks from director review.

ShortForge mapping:
- ReferenceUse and GenerationInputMode were added as provider-neutral equivalents.
- ContinuityMode is now first-class.
- F03 remains upstream planning; review authority stays outside the floor.

Status: PATTERN_EXTRACTION
