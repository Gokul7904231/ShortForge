---
name: reverse-features
description: Mandatory entry skill for investigating, comparing, and upgrading existing ShortForge concepts using REA and source research. Requires a complete OKF review, relevant repository mappings, incumbent-first analysis, pairwise candidate challenge, evidence-based selection, and implementation only after a winner is recorded.
---

# Reverse Features — Program Entry

## Absolute rule

**Reverse-engineer the existing concept, challenge the incumbent and every viable alternative against each other, determine the winner using evidence, and implement only that winner.**

Do not treat this as a feature-copying workflow. The objective is to recover mechanisms, reconstruct behavior, expose weaknesses, compare competing approaches, and improve ShortForge. The incumbent is a candidate—not the presumed winner. Newness, popularity, or agent confidence is not evidence of superiority.

## Mandatory order

1. **Scope one bounded domain.** Assign its `RF-00`–`RF-20` ID from `.okf/reverse-features/domain-registry.md`. Name the user outcome, scope, non-goals, owning contracts, affected authority boundaries and success criteria.
2. **Complete the OKF preflight.** Read `.okf/decision-protocol.md` and the complete current `.okf/` corpus. Run the repository's machine sweep/inventory. Then read each relevant `.okf/research/repo-mappings/` entry, follow its implementation paths, and consult the research/provenance ledger. A directory listing or summary alone is not a complete review.
3. **Establish the incumbent.** Inspect actual source, tests, contracts, relevant production-helper/test evidence, current main, and relevant open PRs/branches. Record exact revisions and distinguish implemented behavior from plans, assertions, and unknowns.
4. **Investigate alternatives.** Use `reverse-feature-investigation`. Use REA for supported packaged applications, websites, runtime behavior, or artifacts where it adds evidence; use normal source-repository tools for source code analysis. Add viable external mechanisms, independent designs and plausible hybrid candidates.
5. **Challenge all candidates.** Use `reverse-feature-challenge`. Include the incumbent and compare every viable candidate pairwise under equivalent constraints; do not compare each alternative only to a hand-picked weak baseline. Include hard-gate results, test/benchmark data, limitations, security/licensing, cost, and trade-offs.
6. **Record the decision before implementation.** Use `.okf/reverse-features/decision-record-template.md`. The status must be `NEEDS_EVIDENCE` if important comparisons are incomplete. Do not code the winner until the evidence-backed decision selects a candidate.
7. **Implement the selected winner.** Use `reverse-feature-implementation` on an isolated branch/worktree. Preserve existing contracts and authority boundaries; clean-room implement the selected mechanism.
8. **Verify and close.** Run applicable unit, contract, integration, negative, recovery, regression, security and performance tests. Update decision status, mapping, provenance, and verification evidence. Never turn BLOCKED/UNKNOWN/UNPROVEN into PASS.

## Required reading

- `.okf/decision-protocol.md` and complete current `.okf/`
- `.okf/reverse-features/README.md`
- `.okf/reverse-features/domain-registry.md`
- `.okf/reverse-features/evaluation-protocol.md`
- all relevant files under `.okf/research/repo-mappings/`
- `.okf/research/repo-research-ledger.md` and relevant source-provenance records
- relevant implementation, tests, active PRs and canonical contracts

## Required deliverables

Scope/dependency note; incumbent specification; evidence and unknown register; candidate register; full pairwise comparison; decision record; implementation plan; test/benchmark artifacts; final status and residual risks.

REA is not the winner-selector or a production authority. Do not add REA source code to ShortForge just because its concepts are useful.
