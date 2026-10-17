# Reverse Features Decision Record

> Copy this template to `.okf/reverse-features/decisions/<RF-ID>-<slug>-<date>.md`. Do not mark a section complete without evidence.

## 1. Identity and status

- **Decision ID:**
- **Workstream:** RF-00 … RF-20
- **Title:**
- **Status:** MAPPED / INVESTIGATING / NEEDS_EVIDENCE / CHALLENGING / SELECTED / IMPLEMENTING / VERIFIED / BLOCKED / REJECTED / SUPERSEDED
- **Owner / reviewer:**
- **Created / updated:**
- **Base commit and branch:**
- **Related PRs / issues / worktrees:**
- **User outcome and measurable objective:**
- **Scope / non-goals:**

## 2. OKF preflight

- **OKF_SWEEP:** COMPLETE / PARTIAL (PARTIAL blocks normal promotion)
- **Corpus revision/hash or sweep artifact:**
- **Decision protocol reviewed:**
- **Relevant OKF resources reviewed:**
- **Relevant repo mappings opened:**
- **Named implementation paths verified against source:**
- **Repo research / source-provenance ledger updated:**
- **Authority/hierarchy nodes affected:**
- **Classification:** already exists / extends existing rule / contradicts existing rule / new capability / experiment only
- **Existing locked decisions and constraints:**
- **Contradictions and resolution status:**

## 3. Incumbent specification

- **Candidate ID:** INCUMBENT
- **Exact source revision and code paths:**
- **Contracts and dependencies:**
- **Observed behavior and current tests:**
- **Known failures/gaps:**
- **Performance/cost/quality baseline:**
- **Evidence refs:**
- **Implemented vs planned status:**

## 4. Alternative candidate register

| Candidate ID | Source / revision / design | Mechanism under investigation | License / provenance | Implementation state | Evidence scope / unknowns |
|---|---|---|---|---|---|
| INCUMBENT | | | | Implemented / partial | |
| ALT-01 | | | | Implemented / prototype / design only | |
| ALT-02 | | | | Implemented / prototype / design only | |
| HYBRID-01 (if plausible) | | | | Prototype / design only | |

Add/remove rows as justified. State why each candidate is viable or why it was excluded.

## 5. Shared evaluation contract

- **Requirements and hard constraints:**
- **Acceptance criteria:**
- **Shared workloads/datasets/fixtures:**
- **Environment and candidate configurations:**
- **Required test types:**
- **Metrics and measurement method:**
- **Sample/repeat plan and limitations:**
- **Security/license/authority gates:**
- **Rollback and rejection conditions:**

## 6. Pairwise candidate challenge

For N viable candidates, include all N×(N−1)/2 comparisons unless a pair is explicitly inapplicable with rationale.

| Pair | Same conditions? | Hard-gate evidence | Correctness/quality | Reliability/recovery | Performance/resources | Cost | Maintainability/compatibility | Evidence limitations | Result |
|---|---|---|---|---|---|---|---|---|---|
| INCUMBENT vs ALT-01 | | | | | | | | | |
| INCUMBENT vs ALT-02 | | | | | | | | | |
| ALT-01 vs ALT-02 | | | | | | | | | |

Attach raw test outputs/benchmark results and detailed notes; do not substitute assertions for measurements. Include viable hybrid comparisons.

## 7. Decision

- **Winner:** or NEEDS_EVIDENCE
- **Why it wins against each viable candidate:**
- **Rejected/retained candidates and reasons:**
- **Hard gates passed / blocked:**
- **Trade-offs accepted:**
- **Unresolved unknowns:**
- **Why this extends/does not contradict existing mappings or decisions:**
- **Decision authority / required approval:**

## 8. Implementation plan (only after SELECTED)

- **Canonical files/contracts to change:**
- **Migration/backward compatibility:**
- **Isolated branch/worktree:**
- **Bounded implementation steps:**
- **Tests/security/license checks:**
- **Production-helper / Team Change Gate requirements:**
- **Verification evidence required:**

## 9. Implementation and verification results

- **Implementation commit / PR:**
- **Checks actually run, with exact status:**
- **Physical/runtime evidence and artifact refs:**
- **Results versus incumbent baseline:**
- **Failed, blocked or unrun gates:**
- **Known residual risks:**
- **Rollback performed/tested:**
- **Final status:** VERIFIED / PARTIAL / BLOCKED / NEEDS_EVIDENCE
- **Follow-up mappings, ledger entries and domain register updates:**

## 10. Honest closeout

State exactly what has been proven, what has only been inferred, what remains unknown and whether the incumbent was actually outperformed. Do not call an implementation verified merely because code was produced or compiled.
