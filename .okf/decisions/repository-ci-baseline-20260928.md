# Repository CI Baseline Correction — 2026-09-28

**Classification:** extends existing rule  
**Status:** MERGED / VALIDATED IN MAIN

## Problem

The canonical main at `43c0e0ea21c51ade382a16d99a76b190e606946b` failed the strict repository TypeScript gate in the CLM shadow decision adapter.

Concrete failures:

- `DecisionBatchResult.adapterUsed` did not declare `CLM_SHADOW`.
- `CLMDecisionAdapter.invalidAnswer()` returned the broad `DecisionAnswer` union from subtype-specific parser methods, producing invalid assignments to `NoulAnswer`, `ChoiceAnswer`, and `ScoreAnswer`.

These were type-contract defects in the CLM shadow adapter and were separate from the FGC/AEF/HITL integration.

## Correction

PR #49 added:

1. `CLM_SHADOW` to the `DecisionBatchResult.adapterUsed` union.
2. Overloaded `invalidAnswer()` signatures preserving the concrete answer type for NOUL, CHOICE, and SCORE parser branches.
3. No changes to authority, capabilities, execution routing, HITL semantics, floor topology, or F07 behavior.

## Architecture invariant

> Intelligence proposes. Authority authorizes. Runtime executes. Evidence proves.

The CLM adapter remains shadow/advisory cognition only.

## Validation closure

- PR #49 merged into `main` at `63f781f0646b22e1ea1bb3ee14688f57b857b523`.
- Strict TypeCheck + Floor 01 Contract Tests: PASS (`36401655484`).
- Team Change Gate: PASS (`36401655510`).
- FGC Wave 4: PASS (`36401655685`).
- FGC Final Wave: PASS (`36401655665`).
- Floor 04 / 05 / 06 / 07 affected validation: PASS.
- Post-merge `main` CI blocking jobs: PASS (`36401876595`).
- Full Web Regression remains informational (`continue-on-error: true`) and must not be represented as product certification.

## Scope conclusion

The repository-wide blocking typecheck debt identified after PR #47 is closed. The FGC/AEF/HITL architecture remains unchanged and merged.
