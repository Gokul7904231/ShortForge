# Pydantic AI → Floor 03 Mapping

Source: https://github.com/pydantic/pydantic-ai

Observed pattern:
- Structured outputs are bound to typed schemas.
- Validation failures can be surfaced as retryable model errors rather than silently accepted malformed data.
- Output schema and execution side effects are separate concerns.

ShortForge mapping:
- Reinforces Pydantic-first typed AssetPlanIR with extra=forbid.
- F03 contract now validates graph and semantic invariants before handoff rather than trusting serialization alone.

Not adopted:
- Pydantic AI runtime or model/provider routing.

Status: PATTERN_EXTRACTION

## Current implementation status — 2026-09-25

The mapped typed-output discipline is now enforced in F03's `AssetPlanIR` 1.3.0:
- `extra="forbid"` across the IR models;
- semantic validators for dependency/reference integrity;
- required lineage and node identity fields;
- deterministic fingerprint fields validated as part of the handoff.

Status remains: PATTERN_EXTRACTION.
