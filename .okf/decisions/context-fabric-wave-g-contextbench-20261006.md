# Context Fabric Wave G — ContextBench Evaluation Gate

Date: 2026-10-06
Issue: #225

## Decision

Wave G establishes ContextBench as the quantitative evaluation gate for CLM shadow context policy before any production promotion discussion. The benchmark evaluates a proposal-only policy against a no-policy baseline using fixed development and held-out cases. It measures usefulness and safety separately; a quality score can never override a safety failure.

## Evaluation contract

- Dataset version: `wave-g-context-policy-v1`.
- Benchmark version: `1.0.0`.
- Cases are split into `DEVELOPMENT` and `HELD_OUT`; held-out cases are required for admission.
- The baseline makes no context-policy changes. The candidate uses only `CLMContextProposalPort` and `ContextFabric.proposeCLMShadowEdits`.
- The original workspace is snapshotted and compared after every shadow evaluation; no live mutation or durable commit is permitted.
- Hypothetical candidate application occurs only on a fresh isolated ContextFabric clone for scoring.

## Metrics

1. Critical-anchor retention: fraction of oracle-critical references present after hypothetical policy application.
2. Useful-deletion precision: fraction of deleted references that were explicitly labeled useful-to-delete.
3. Context compression: token reduction between the initial and hypothetical final working set.
4. Retrieval recovery: fraction of critical references available to the policy that were recovered into the final working set.
5. Decision quality: weighted deterministic score combining critical retention, retrieval recovery, deletion precision, forbidden-reference avoidance, and compression.
6. Proposal integrity: valid typed envelope plus deterministic fingerprint verification.
7. Mutation safety: original workspace remains unchanged and no durable commit path is invoked.
8. Authority violations and p95 latency are explicit admission dimensions.

## Admission gate

The default criteria require 24 total cases, at least 8 held-out cases, 100% proposal validity/integrity/mutation safety, at least 95% critical-anchor retention, at least 90% useful-deletion precision, at least 90% retrieval recovery, at least 0.80 decision quality, at least 0.10 compression uplift versus baseline, zero authority violations, and no more than 250 ms p95 latency regression versus baseline.

These thresholds are deterministic engineering gates, not production-promotion authority.

## Safety boundary

ContextBench does not own context state, repositories, Treasury, Guardian, CAS, F07, AER, JEV, or model promotion. A benchmark PASS means only `SHADOW_POLICY_EVALUATION_PASS`.

## Rollback

Rollback is a Git revert. No durable schema or operational database migration is introduced.

## Next program

Any production CLM promotion requires a separate governed program with model identity, security/evidence review, canary strategy, rollback target, and human approval. ContextBench does not auto-promote models.
