# Repository CI Baseline Correction — 2026-09-28

**Classification:** extends existing rule
**Status:** IMPLEMENTED ON PR #49 / VALIDATION IN PROGRESS

## Problem

The canonical main at 43c0e0ea21c51ade382a16d99a76b190e606946b failed the strict repository TypeScript gate in the pre-existing CLM decision adapter.

Concrete failures:

- DecisionBatchResult.adapterUsed did not declare CLM_SHADOW.
- CLMDecisionAdapter.invalidAnswer() returned the broad DecisionAnswer union from subtype-specific parser methods, producing invalid assignments to NoulAnswer, ChoiceAnswer, and ScoreAnswer.

These are type-contract defects in the CLM shadow adapter. They are separate from the FGC/AEF/HITL integration.

## Correction

PR #49 adds:

1. CLM_SHADOW to the DecisionBatchResult.adapterUsed union.
2. Overloaded invalidAnswer() signatures preserving the concrete answer type for NOUL, CHOICE, and SCORE parser branches.
3. No changes to authority, capabilities, execution routing, HITL semantics, floor topology, or F07 behavior.

## Architecture invariant

> Intelligence proposes. Authority authorizes. Runtime executes. Evidence proves.

The CLM adapter remains shadow/advisory cognition only.

## Validation

Fresh CI evidence is required before merge. The informational full Web Regression suite remains non-blocking by workflow design and must not be reclassified as a passing product certification merely because its job is informational.
