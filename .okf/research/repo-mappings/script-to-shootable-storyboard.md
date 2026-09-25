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
