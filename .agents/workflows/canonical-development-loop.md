# Canonical Development Loop — Reverse Features-Compatible

Every non-trivial change follows the existing OKF decision protocol. Reverse Features tasks use the expanded sequence below; ordinary maintenance still follows the same OKF-first and evidence requirements.

```
REQUEST
  ↓
SCOPE (Identify the domain, expected outcome, and affected authority/contracts)
  ↓
OKF SWEEP (Read complete current .okf; run tools/okf/sweep.py inventory/applicability)
  ↓
MAPPING REVIEW (Open relevant .okf/research/repo-mappings entries and named code paths)
  ↓
INSPECT INCUMBENT (Read code, contracts, runtime evidence, tests, open PRs/branches)
  ↓
REVERSE-ENGINEER (Use REA for suitable app/runtime/artifact targets; source tools for source repos)
  ↓
CANDIDATES (Register incumbent + every viable alternative + plausible hybrids)
  ↓
CHALLENGE (Pairwise comparison under common criteria, test cases, and conditions)
  ↓
DECISION RECORD (Winner + evidence + trade-offs + unknowns + rejection conditions)
  ↓
IMPLEMENT WINNER (Only after comparison; isolated branch; clean-room; bounded changes)
  ↓
TEST (Unit + contract + integration + negative/recovery/regression as applicable)
  ↓
OBSERVE (Capture actual runtime effects, artifacts, costs, timings, and failures)
  ↓
VERIFY (Run authoritative gates; do not translate blocked/unproven to pass)
  ↓
OKF RECORD (Update mapping, decision, ledger, and status/provenance where needed)
  ↓
REVIEW / TEAM CHANGE GATE / AUTHORIZED DISPOSITION
  ↓
DONE ONLY WHEN EVIDENCE SUPPORTS THE CLAIM
```

## Mandatory Reverse Features invariant

**Reverse-engineer the existing concept, challenge the incumbent and every viable alternative against each other, determine the winner using evidence, and implement only the winner.** Do not award novelty points. Include viable hybrid candidates. If comparisons are not fair or evidence is insufficient, leave the decision open as `UNKNOWN / NEEDS_EVIDENCE`; do not start winner-dependent implementation or claim superiority.

For repository analysis, read the relevant source, tests, docs, license and active PRs; REA does not replace ordinary source-repository inspection. For REA investigations, record target identity/revision, operation/authority, full Evidence references, coverage, limitations and unresolved unknowns. Respect clean-room and third-party-license boundaries.

The machine OKF sweep is an inventory/rule-applicability attestation, not proof that a human has read the corpus or that runtime, security, tests, or physical verification passed. Preserve both the review record and the actual test evidence.
