# Floor Governance Cell Wave 3 — Paired Healing Integration — 2026-09-28

**Classification:** healing-runtime integration
**Status:** implemented; validation pending on corrected PR head

## Objective

Upgrade the existing healer substrate so high-risk/cross-floor incidents can use paired reasoning and resource-scoped fenced mutation without replacing the existing HealerEngine, RepairLockManager, RepairDependencyAnalyzer, or transactional repair primitives.

## Implemented

- Durable JointHealingSessionManager persistence with atomic disk-backed session records.
- Restart safety: in-flight HEALING / VERIFYING sessions are escalated instead of resuming stale physical mutation.
- Wave-3 reasoning-only BaseHealer.diagnose() phase.
- Parallel paired diagnosis with independent healer evidence.
- Resource-grouped mutation scheduling derived from the existing repair dependency analysis.
- Resource-scoped RepairLockManager mutation leasing with fencing epoch and action-scope validation immediately before mutation.
- Fenced rollback path on mutation failure.
- BDA reinspection after paired mutations.
- Independent JointHealingAuditor before closure.
- Explicit Guardian closure authority bound to the affected floor.
- Dynamic ResolutionProof passed into CaseManager.resolveCase().
- Production HealerEngine routing for HIGH/CRITICAL and non-local blast-radius incidents when paired healing is enabled.
- Existing low-risk/legacy healer path remains backward compatible.
- Focused Wave-3 validation workflow plus compatibility coverage for the existing Phase-6 healer safety suite.

## Authority invariants

- Healers reason and execute bounded repair actions; they do not authorize incident closure.
- Resource leases fence mutations; the incident itself is not globally locked.
- BDA supplies boundary/data-integrity evidence, not authority.
- Auditor verifies the joint result independently.
- Floor Guardian alone grants closure authority for its floor.
- ResolutionGate remains the final case-resolution proof gate.
- F07 remains final production verification/release authority.

## Deliberate non-claims

Wave 3 does not claim:

- fine-tuned Ascalon live inference;
- automatic recovery of an in-flight physical mutation after process restart;
- distributed external transaction/ACID semantics across arbitrary providers;
- full BDA coverage of every internal floor boundary;
- workload identity or signed policy bundles;
- predictive prevention or full adversarial evaluation.

## Validation gate

Required before Wave 3 is considered closed:

1. Wave-3 typecheck passes.
2. Wave-3 focused paired-healing tests pass.
3. Existing Phase-6 healer concurrency and healer-swarm suites remain green.
4. Team Change Gate is green on the corrected head.
5. .okf and Team truth records match the verified executable SHA.