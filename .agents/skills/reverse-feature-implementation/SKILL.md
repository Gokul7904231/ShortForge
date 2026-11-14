---
name: reverse-feature-implementation
description: Implement a winner already selected by a documented Reverse Features comparison. Enforce clean-room changes, existing OKF authority boundaries, isolated branches, regression proof, accurate status, and evidence-backed closure.
---

# Reverse Feature Implementation

## Entry gate

Do not begin winner-dependent implementation unless a current `.okf/reverse-features/` decision record:
- identifies the incumbent and every viable alternative;
- records pairwise comparisons and hard-gate results;
- selects a winner with evidence, trade-offs, provenance/license review and rejection conditions;
- states the exact scope, contracts, acceptance criteria, and rollback conditions;
- records the required OKF review/sweep and any contradictions.

If the record is absent, incomplete or `NEEDS_EVIDENCE`, return to investigation/challenge instead of coding the presumed winner.

## Implementation rules

1. Read the relevant mapping, decision record, canonical source-of-truth contracts, and named implementation/test locations again before editing.
2. Check main and active PRs; use a dedicated branch/worktree and avoid overlapping files or silently superseding existing work.
3. Implement the winning mechanism in ShortForge's existing architecture. Clean-room reimplement external ideas by default; follow license/provenance governance. Do not add external code, test suites, prompts, proprietary assets, or dependencies without explicit review.
4. Preserve Human/Overseer authority, Guardian authorization, Slayer enforcement, Healer remediation, Treasurer economics, worker execution, F07 verification, and canonical floor/IR/contracts. If the winner requires an authority or contract change, record and approve that architecture decision first.
5. Keep scope bounded. Do not perform unrelated cleanup or redesigns as part of the upgrade.
6. Add tests demonstrating the improvement against the incumbent behavior, including regression and negative/recovery cases. Benchmarks must be reproducible and comparable.
7. Run applicable type checks, unit/contract/integration tests, security/license checks, OKF validation/sweep, Team Change Gate, production-helper checks and real/physical verification required by the domain.
8. Record actual results and artifacts. A green mock, successful compile, generated code, or provider assertion alone is not proof of production outcome.

## Closeout

Update the decision record with:
- candidate selected and exact implementation revision;
- tests/benchmarks that ran and their observed outcome;
- unrun/blocked gates and why;
- remaining unknowns/risks;
- rollback/rejection condition and rollout status;
- corresponding `.okf` mapping/ledger changes.

Use `VERIFIED` only when the applicable independent checks support it. Otherwise use `PARTIAL`, `BLOCKED`, or `NEEDS_EVIDENCE`. Do not merge unless required review and governance gates pass.
