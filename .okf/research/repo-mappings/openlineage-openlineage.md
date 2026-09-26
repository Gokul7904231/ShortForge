# Repo Mapping — OpenLineage

Repository: https://github.com/OpenLineage/OpenLineage

Observed pattern:
- Run, job, and dataset lineage are first-class metadata.
- Static metadata is separated from run-varying facets.
- Source code location/version and input/output relationships are explicit.

ShortForge mapping:
- F03 now exposes a typed PlanLineage envelope and semantic source_fingerprint.
- Lineage identifies the trusted Floor 02 source and F03 compiler without requiring an external lineage service.

Not adopted:
- OpenLineage transport, collectors, or backend.

Status: PATTERN_EXTRACTION
