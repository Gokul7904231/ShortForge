# Floor 03 Post-Merge Hardening Audit

**Date:** 2026-09-26
**Final merged main:** `e341b6f9e8d2a090812b038dbc7cde90d0b83e2a`
**Post-merge verification run:** `36219440438`

## Scope

This change set addresses the post-merge findings from the canonical Floor 03 audit: runtime canonicalization, the F03→F05 typed join, evidence truthfulness, distributed handoff persistence, post-merge CI, repository-wide typecheck failures, documentation/ontology reconciliation, and Ascalon training-readiness gating.

## Canonical production path

`F02 canonical handoff -> Overseer -> Floor03RuntimeAdapter -> F03 /v1/assets/execution-report -> validated AssetPlanIR 1.4.0 -> distributed control-plane handoff`.

The Overseer F03 executor no longer uses the TemplateProductionPipeline asset-planning implementation as a production fallback.

## Authority boundaries

F03 remains planning/specification only. It does not generate physical media, select providers, hold provider credentials, mint capabilities, authorize release, or replace Overseer, Guardian, TimelineIR, RenderFabric, or F07.

## F03 -> F05

`Floor05Input` now carries both `floor03_payload` and `floor04_payload`. F05 validates that the explicit F03 lineage matches the F03 lineage embedded in the F04 envelope before composition. The production DAG remains `F02 -> (F03 || F04) -> F05`.

## Evidence truthfulness

F03 completion events now use `durationTruth: MEASURED`, `evidenceClass: TYPED_F03_RUNTIME_HANDOFF`, and `physicalMediaProduced: false`. Physical artifact claims remain downstream.

## Persistence

The Python JSON memory store is treated as local cache/idempotency state. The FactoryOS control plane persists canonical F03 handoffs in `factoryos_floor03_handoffs` using immutable request identity, fingerprint checks, and conflict detection.

## CI

`.github/workflows/floor03-post-merge.yml` validates the F03 suite, F03 Guardian contract, the F03/F04/F05 contract seam, Ascalon ontology JSON, and the repository-wide TypeScript typecheck whenever relevant changes reach `main`.

## Training readiness

Ascalon F03 admission criteria are satisfied on the final merged-main evidence:
- canonical runtime path is in use;
- durable control-plane handoff boundary is implemented;
- explicit F03→F05 typed join is validated;
- F03 suite and Guardian contract pass;
- F03/F04/F05 handoff seam passes;
- Ascalon ontology validates;
- repository TypeScript typecheck passes.

The informational web regression remains separate from this admission gate.

