# Repo Mapping — Dagster

Repository: https://github.com/dagster-io/dagster

Observed pattern:
- Assets may have explicit checks with metadata.
- Blocking checks can prevent downstream work until the required condition is satisfied.
- Asset definitions, checks, and dependency relationships are separately inspectable.

ShortForge mapping:
- F03's AssetPlanIR validator is a deterministic structural preflight.
- Broken dependency/reference bindings fail before downstream handoff.
- Guardian remains the policy/safety authority and F07 remains physical verification authority.

Not adopted:
- Dagster orchestration, sensors, or asset runtime.

Status: PATTERN_EXTRACTION
