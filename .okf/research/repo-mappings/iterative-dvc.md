# Repo Mapping — DVC

Repository: https://github.com/iterative/dvc

Observed pattern:
- Pipeline stages make dependencies and outputs explicit.
- Reproducibility depends on declared semantic state rather than transient execution identity.
- Lock-style state preserves inspectable stage provenance.

ShortForge mapping:
- F03 already has dependency-aware AssetPlanIR nodes.
- Wave 4 adds source_fingerprint and node_fingerprint so semantic content identity is separated from runtime asset UUIDs.
- Whole-plan fingerprints normalize revision/runtime fields while retaining meaningful lineage.

Not adopted:
- DVC CLI, storage, cache, or orchestration runtime.

Status: PATTERN_EXTRACTION
