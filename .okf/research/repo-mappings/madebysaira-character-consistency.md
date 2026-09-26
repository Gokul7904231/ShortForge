# CharacterConsistency → Floor 03 Mapping

Source: https://github.com/madebysaira/CharacterConsistency

Observed pattern:
- Separate stable character/style invariants from per-shot action/camera deltas.
- Reuse the invariant block and references across shots.
- Use negative constraints for drift-prone attributes.

ShortForge mapping:
- F03 now emits locked subject IDs, invariant attributes, allowed changes, character reference bindings, and negative constraints when F02 provides them.

Not adopted:
- Model-specific weights or vendor prompt recipes.
- Claims about provider performance.

Status: PATTERN_EXTRACTION
