# script-to-shootable-storyboard → Floor 03 Mapping

Source: https://github.com/zyz254009-crypto/script-to-shootable-storyboard

Observed pattern:
- Strong typed artifact chain: shot list, camera setup, timing plan, generation task, repair plan, provenance.
- Atomic shots carry start/end state, camera motion, dependencies, safe zones, risk, and repair information.
- Graph-wide semantic validation is separate from JSON schema validation.

ShortForge mapping:
- Directly informed typed shot semantics, dependency graph validation, repair locality, and provenance-conscious planning.
- F03 now rejects missing/forward/cyclic scene dependencies.
- F03 fingerprints semantic plan content.

Not adopted:
- Provider-specific generation tasks.
- Rights/safety/release authority outside F03's scope.

Status: CLEAN_ROOM_PATTERN_EXTRACTION

## Current implementation status — 2026-09-25

The clean-room F03 implementation now reflects the mapped typed-artifact pattern with:
- self-contained `AssetPlanNode.asset_id`;
- explicit `PlanLineage` and upstream `source_fingerprint`;
- dependency graph validation and transitive repair impact;
- regeneration remapping that preserves dependency and reference lineage;
- semantic plan/node fingerprints independent of runtime asset identities.

Status remains: CLEAN_ROOM_PATTERN_EXTRACTION.
