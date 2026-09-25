# Team Change Gate — Mandatory ShortForge Engineering Workflow

**Status: LOCKED WORKFLOW**

## Trigger

The gate applies whenever ShortForge changes code, configuration, schemas, workers, permissions, prompts, models, providers, workflows, tests, CI, security tooling, rendering behavior, or .okf-governed architecture.

## Required sequence

1. **Detect change** — capture branch, base/head, changed paths, requested outcome and change identity.
2. **Complete current .okf sweep** — follow .okf/decision-protocol.md; reconstruct canonical rules, implementation state, target state, contradictions, constraints, mappings, helper evidence and tests.
3. **Compile TeamChangeIR** — create a compact semantic state after the full sweep; retain source references and sweep attestation.
4. **Classify** — already exists / extends existing rule / contradicts existing rule / new capability / experiment only.
5. **Route Forgers** — choose the smallest qualified specialist set.
6. **Run security** — perform applicable production-helper checks. Semgrep is the routine static lane; Strix is conditional; ZAP is the governed DAST lane. UNPROVEN never becomes PASS.
7. **Resolve or escalate conflicts** — a contradiction is recorded before acceptance. Forgers must propose a bounded resolution, evidence, trade-offs, required authority and canonical updates. Forgers cannot unilaterally rewrite an absolute .okf law.
8. **Implement and verify** — run code tests and relevant browser/media/runtime/benchmark/security checks.
9. **Generate Team report** — preserve every detected conflict, including resolved conflicts.
10. **Merge disposition** — PASS only when required gates are proven and no unresolved contradiction remains; otherwise BLOCKED, REJECTED or ESCALATED.

## Absolute workflow laws

- Complete .okf review precedes non-trivial decisions.
- .okf and repository source-of-truth precedence remain intact.
- No Forger mints production capabilities or bypasses Guardian, F07, leases/fencing, CAS or ReleaseAuthorization.
- No scanner can self-certify architecture.
- A contradiction cannot be silently reclassified as an extension.
- A detected conflict cannot be deleted from the final report.

## Conflict record

Every conflict must contain:

- conflicting rule/contract reference
- exact proposed change
- original conflict statement
- evidence
- risk/trade-offs
- proposed resolution
- accepted resolution, when authoritative approval exists
- decision authority
- canonical documents/implementation that must change
- final conflict status

An escalated conflict may remain unaccepted, but it must have a concrete resolution proposal and an explicit disposition.

## Machine gate

For pull requests, the required report is:

Team/reports/pr-<number>.json

Missing, malformed, contradictory or incomplete reports fail the Team gate.
