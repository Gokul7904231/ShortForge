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

## Current implementation status — 2026-09-25

The OpenSpec-derived specification-as-artifact pattern is now represented by AssetPlanIR 1.3.0 as a typed, versioned specification with:
- explicit node/dependency graph;
- upstream lineage;
- semantic fingerprints;
- local repair scope and transitive impact;
- a stable provider-neutral downstream contract.

Status remains: DIRECT_PATTERN_ADOPTION.
