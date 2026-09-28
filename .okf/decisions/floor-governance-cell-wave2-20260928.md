# Floor Governance Cell Wave 2 — Production Integration — 2026-09-28

**Classification:** integration hardening
**Status:** implemented on PR branch; repository CI and focused Wave-2 validation are the release gate.

## Objective

Connect the Wave-1 Floor Governance Cell foundation to the existing ShortForge runtime without changing the locked F00–F07 topology.

## Implemented

- Guardian mutations now cross FloorGovernanceCell action contracts before legacy execution.
- Existing four runtime Guardians retain their current authority semantics while gaining persistent governance cells.
- Floor Blackboard supports disk-backed, hash-chained append-only journal reconstruction.
- Python execution handoffs now cross BorderDefenseAgent egress inspection before control-plane world-state mutation.
- BDA inspection results are emitted as durable governance events and retained as case evidence for bridge-originated failures.
- Direct legacy CaseManager.resolveCase() now requires explicit ResolutionProof through ResolutionGate.
- Boot recovery no longer silently resolves cases.
- Added focused Wave-2 integration tests and a dedicated validation workflow.

## Authority invariants

- Guardian remains the local floor authority.
- Ascalon remains proposal-only; Wave 2 does not claim a production Ascalon inference checkpoint.
- BDA remains a boundary/data-integrity judge, not a replacement for Guardian policy.
- F07 remains the final production verification/release authority.
- Untrusted evidence cannot create Guardian authorization.
- Existing F00–F07 topology remains unchanged.

## Deliberate non-claims

Wave 2 does not claim:

- production Advisor runtime;
- complete BDA coverage for every non-Python internal floor boundary;
- durable JointHealingSession persistence;
- graph-aware paired-healing scheduler replacement;
- workload identity or signed authorization bundles;
- OpenLineage/in-toto/C2PA runtime wiring;
- predictive failure prevention;
- full adversarial evaluation corpus;
- production Ascalon model execution.

## Release gate

Required evidence:

1. FGC Wave-1 validation remains green.
2. Wave-2 focused typecheck/test workflow is green.
3. Team Change Gate is green.
4. Repository CI baseline findings are distinguished from FGC-caused regressions.
5. .okf remains synchronized with executable truth.
