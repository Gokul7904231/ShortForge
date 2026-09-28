# Documentation & Code Audit — Floor Governance Cell Wave 1

**Date:** 2026-09-28  
**Branch:** `feat/floor-governance-cell-wave1-20260928`

## Audit objective

Check that the new bounded-autonomy architecture fits the existing ShortForge authority and evidence hierarchy and does not silently claim integrations that do not yet exist.

## Existing implementation inspected

- `apps/web/factoryos/core/guardian/GuardianKernel.ts`
- `apps/web/factoryos/core/guardian/GuardianPolicy.ts`
- `apps/web/factoryos/core/guardian/GuardianContracts.ts`
- `apps/web/factoryos/core/healers/HealerEngine.ts`
- `apps/web/factoryos/core/healers/RepairLockManager.ts`
- `apps/web/factoryos/core/healers/RepairDependencyAnalyzer.ts`
- `apps/web/factoryos/core/healers/TransactionalRepairGate.ts`
- `apps/web/factoryos/core/cases/CaseManager.ts`
- `apps/web/factoryos/core/validator/ValidatorAgent.ts`
- `apps/web/factoryos/core/intelligence/decision/DecisionEngine.ts`
- `apps/web/factoryos/core/intelligence/decision/DecisionContracts.ts`
- `apps/web/factoryos/core/observability/TraceContext.ts`
- `.okf/decision-protocol.md`
- `.okf/hierarchy-map.md`
- `.okf/cognitive/layer-contract.md`
- `.okf/intelligence/ascalon-model.md`

## Findings

### Finding 1 — Guardian authority already exists

Existing Guardian code already performs floor-local observation, audit, planning, worker recovery, load balancing and escalation. The FGC therefore extends an existing authority boundary rather than replacing it.

### Finding 2 — Ascalon already has a bounded-identity contract

Existing Ascalon documentation explicitly treats the model as a cognitive substrate and keeps authorization, leases/fencing, verification and physical execution outside the model. The new runtime adapter makes that boundary executable.

### Finding 3 — Healing has concurrency primitives but no fencing epoch

Existing `RepairLockManager` uses TTL and optional LeaseManager ownership. The wave adds per-resource fencing metadata and a `MutationLease` seam while keeping the old lock API.

### Finding 4 — Healing remains largely sequential

`HealerEngine.dispatchHealersForCase()` currently runs the allocated squad sequentially. The new JointHealingSession is therefore a foundation, not yet a replacement for production healing scheduling.

### Finding 5 — Direct CaseManager resolution remains a legacy escape hatch

`CaseManager.resolveCase()` can directly set `RESOLVED`. `ValidatorAgent` already uses a stronger VERIFYING→RESOLVED path, but full ResolutionGate enforcement across all callers remains future integration work.

### Finding 6 — Advisor is not yet a runtime minister

Current Advisor references are mainly model/lobby/documentation concepts. Wave 1 defines the typed CounselPacket but does not claim a production Advisor runtime subsystem.

### Finding 7 — BDA is not yet wired to every production boundary

Wave 1 introduces the BDA contract and quarantine behavior, but the live F03/F04/F05/F06 handoff pipeline still needs explicit border integration.

## Documentation consistency

The new docs intentionally distinguish:

- implemented foundation;
- target architecture;
- unimplemented integrations.

No current file should treat Wave 1 as evidence that a production Ascalon checkpoint or complete FGC deployment exists.

## Required next audit

Before Wave 2:

1. inspect every F03–F07 handoff;
2. bind BDA to actual ingress/egress;
3. add persistent incident/blackboard storage;
4. wire resolution gating;
5. integrate Guardian runtime adapter;
6. replace sequential paired-healing dispatch safely;
7. add negative security tests at real boundaries;
8. run production-helper and repository CI evidence.

## Audit conclusion

Wave 1 is architecturally aligned with the existing hierarchy and provides a concrete bounded-autonomy substrate. It is not yet the full production Floor Governance Cell.


## Verification update — 2026-09-28

The dedicated **Floor Governance Cell Validation** workflow passed on the current branch. It typechecks the FGC governance sources independently of the repository-wide tsconfig and executes the focused FGC Vitest suite.

The repository-wide CI lane still reports pre-existing TypeScript failures in:

- `factoryos/core/intelligence/decision/CLMDecisionAdapter.ts`
- `factoryos/core/intelligence/decision/LLMDecisionAdapter.ts`

The same errors are present on the current `main` baseline CI run, so they are recorded as an unrelated baseline defect rather than attributed to the FGC wave.

FGC-specific code therefore has direct focused typecheck and runtime test evidence, while merge/release readiness remains gated by the repository baseline.
