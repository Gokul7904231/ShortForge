# Floor 03 Post-Merge Hardening Audit

**Date:** 2026-09-26
**Latest verified main:** `0fa169cae74c9b77def147df55dc4572b91769d2`
**Latest post-merge verification run:** `36219665043`

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

## Verification history

The first post-merge attempt on the initial merge commit exposed two verifier-environment defects rather than F03 runtime failures: the TypeScript job ran without installing `apps/web` dependencies, and the F03/F04/F05 contract test omitted the Floor 04 compatibility path. Both were corrected in PR #21. The corrected merged-main run `36219665043` passed both post-merge jobs.

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



## Final evidence refresh — 2026-09-26

- Latest verified main: `0fa169cae74c9b77def147df55dc4572b91769d2`
- Floor 03 Post-Merge Verification: `36219665043` — PASS
- Repository TypeScript typecheck: PASS
- Repository CI: `36219665012` — PASS
- F03 suite: 37 passed
- F03 Guardian: 1 passed
- F03/F04/F05 typed seam: 2 passed
- Ascalon ontology JSON: valid
