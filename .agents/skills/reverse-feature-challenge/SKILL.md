---
name: reverse-feature-challenge
description: Adversarially compare the existing ShortForge implementation against every viable alternative and plausible hybrid for a Reverse Features decision. Require equivalent tests, complete pairwise comparisons, hard-gate checks, measured evidence and explicit unknowns before selecting a winner.
---

# Reverse Feature Challenge

## Non-negotiable comparison rule

The **incumbent and every viable candidate must be challenged against one another**, not merely described separately. With N viable candidates, record the comparable pairwise set (N × (N − 1) / 2 comparisons), or explicitly justify why a pair is inapplicable. Candidates typically include the current ShortForge implementation, reverse-engineered external mechanisms, alternative designs, and plausible hybrids.

## Before comparing

- Confirm the complete OKF review and machine sweep record exist for the workstream.
- Confirm relevant existing repository mappings and named implementation paths were reviewed.
- Confirm candidates solve the same stated outcome and are evaluated against the same workload, interface, environment and constraints.
- Separate known facts from assumptions; unimplemented designs cannot claim measured runtime results.

## Required evaluation dimensions

1. **Hard gates (veto, not points):** correctness, security, license/compliance, authority compatibility, data integrity, mandatory contract compatibility, and any domain-specific safety/release conditions.
2. **Effectiveness:** outcome quality, behavioral parity, feature coverage and user impact.
3. **Reliability:** failure modes, recovery, idempotency, resource lifecycle, bounded retries and durability.
4. **Performance:** latency/throughput, memory/CPU/GPU, concurrency, tail latency and scalability where relevant.
5. **Economics:** measured or defensibly bounded compute/API/storage/network cost; include setup and operational burden.
6. **Maintainability:** complexity, coupling, observability, testability, dependency/vendor lock-in and migration risk.
7. **Compatibility:** current ShortForge floors, IR/contracts, provider boundaries, deployment, existing users and active PRs.
8. **Evidence quality:** target/revision identity, reproducibility, sample size, environment, coverage, uncertainty and provenance.

## How to challenge candidates

- Build a shared acceptance suite before looking at candidate results; include positive, boundary, negative, adversarial and recovery cases.
- Run candidates under equivalent conditions. Record commands/configuration, environment, exact revision, result artifacts and measured values.
- Inspect failure cases, not only happy paths. Try to falsify each candidate's strongest claim.
- Run every relevant pairwise comparison and report dimensions where the result is incomparable. Do not turn missing data into zero or PASS.
- Treat static-analysis findings as hypotheses until corroborated. Treat REA observations as scoped evidence, not universal proof.
- Do not hide trade-offs in a single arbitrary aggregate score. Apply hard vetoes first; use transparent metrics, sensitivity analysis or Pareto dominance for eligible candidates.
- A hybrid is a first-class candidate when its integration costs, complexity and failure modes can be assessed. It is not automatically better.
- A tie or insufficient evidence remains `NEEDS_EVIDENCE`; retain the incumbent provisionally rather than claiming the new approach wins.

## Decision record

Use `.okf/reverse-features/decision-record-template.md`. Record candidate IDs, pairwise matrix, hard-gate outcome, measured results and provenance; rejected and retained approaches; rationale and trade-offs; residual unknowns; rollout/rollback plan; and exact verification required after implementation. Do not implement until an authorized decision record selects the winner.
