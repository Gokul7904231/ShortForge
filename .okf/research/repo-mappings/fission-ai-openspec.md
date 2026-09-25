# OpenSpec → Floor 03 Mapping

Source: https://github.com/Fission-AI/OpenSpec

Observed pattern:
- Specifications act as explicit artifacts.
- Changes and dependency relationships are machine-readable and reviewable.

ShortForge mapping:
- AssetPlanIR is a first-class typed specification artifact.
- Dependency edges, provenance, versioning, semantic fingerprinting, and repair impact are explicit.
- Downstream physical execution consumes the plan rather than redefining it.

Status: DIRECT_PATTERN_ADOPTION
