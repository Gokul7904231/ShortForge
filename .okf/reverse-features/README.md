# Reverse Features — Program Operating Contract

> Status: PROPOSED CANONICAL PROGRAM CONTRACT  
> Authority: subordinate to the locked `.okf/decision-protocol.md`, hierarchy, authority registry, canonical implementation/contracts, and tests  
> Scope: continuous evidence-driven improvement of existing ShortForge concepts

## 1. Absolute rule

**Reverse-engineer the existing concept, challenge the incumbent and every viable alternative against each other, determine the winner using evidence, and implement only that winner.**

Reverse Features is not a code-copying program or a novelty-driven redesign program. Its purpose is to understand existing mechanisms deeply, expose limitations, reconstruct behavior, compare alternative concepts, and improve ShortForge when the evidence supports an improvement.

The current ShortForge implementation is always a candidate. It is neither protected from challenge nor presumed inferior. Newness, popularity, impressive documentation, a model's confidence, or an unverified benchmark is not evidence of superiority.

## 2. Mandatory operating loop

1. Select one bounded workstream from `domain-registry.md` and define the outcome and non-goals.
2. Read the complete current `.okf/` corpus under `.okf/decision-protocol.md`; run the current machine sweep/inventory. Record the revision and sweep evidence. A machine inventory is not proof that the corpus was read.
3. Review every relevant `.okf/research/repo-mappings/` entry, follow the implementation locations it names, and consult the repo research/provenance ledger. Capture adopted, rejected and already-implemented mechanisms before discovering new ones.
4. Inspect the incumbent in executable code and tests, the current base revision, and relevant active PRs/branches. Record what exists, what is only planned, known failures, and current verification evidence.
5. Investigate alternatives using ordinary source-repository analysis and REA where its supported target/runtime/artifact tools add evidence. Preserve exact target identity, evidence IDs/bundles, source references, coverage, limitations, license and provenance.
6. Register the incumbent, all viable external/independent alternatives, and plausible hybrids. Keep facts, inferences and unknowns distinct.
7. Challenge every viable candidate pairwise under equivalent acceptance criteria, workloads, environments and constraints. Apply hard safety/security/authority/license/contract gates before comparing optimization metrics.
8. Record the decision in the decision-record template. Select an evidence-supported winner or explicitly remain `NEEDS_EVIDENCE`; never manufacture a winner.
9. Implement only the selected design in an isolated branch/worktree using clean-room implementation where required.
10. Run applicable unit, contract, integration, negative, failure/recovery, regression, security, performance, and physical/runtime gates. Update the record and relevant mapping/provenance ledger. Promote only through the existing review/Team Change Gate.

## 3. Candidate and decision rules

- Minimum candidate: current ShortForge incumbent.
- Add each viable external approach and each materially different independent design found by research.
- Include a hybrid candidate whenever combining mechanisms is plausible enough to test.
- Every viable candidate pair receives an explicit comparison or a documented reason that comparison is inapplicable.
- A constraint violation is a hard rejection/block, not a weakness that can be compensated for by a high score elsewhere.
- Do not collapse incompatible evidence into a single opaque score. Report raw measurements, constraints, uncertainties and trade-offs.
- When evidence is insufficient, retain the incumbent provisionally and record the missing proof. This is not a claim that the incumbent is universally optimal.
- Do not silently replace canonical authorities, floor topology, contracts, or a locked decision. Record contradictions and follow the architecture decision protocol.
- No upstream code, tests, prompt templates, or proprietary assets are copied by default. Record license analysis and implementation provenance.

## 4. Status vocabulary

- `MAPPED`: domain/paths/dependencies inventoried.
- `INVESTIGATING`: incumbent and alternatives are being established.
- `NEEDS_EVIDENCE`: a material unknown prevents a fair winner decision.
- `CHALLENGING`: candidate comparisons are underway.
- `SELECTED`: an evidence-supported winner is recorded; implementation may begin subject to authorization.
- `IMPLEMENTING`: selected design is being implemented in an isolated branch.
- `VERIFIED`: applicable independent tests and gates support the claim.
- `BLOCKED`: required tool, authority, provider, evidence or gate is unavailable/failing.
- `REJECTED`: candidate failed a hard gate or lost the recorded comparison.
- `SUPERSEDED`: replaced by a later evidence-backed decision.

Do not equate `IMPLEMENTING` with `VERIFIED`, or a passing targeted test with complete production readiness.

## 5. Existing governance and architecture boundaries

The existing OKF corpus remains authoritative. In particular:
- `.okf/decision-protocol.md` requires full-corpus review and decision filing.
- `.okf/hierarchy-map.md` and canonical authority/contract sources govern command and capability boundaries.
- Treasurer owns economic admission and settlement; Guardian owns capability/policy authorization; workers execute; F07 independently governs release.
- Existing floor/IR topology and engine-stack decisions must be explicitly reconciled, not bypassed.
- Production-helper, CI, physical artifact and release evidence must be consulted when applicable.

Reverse Features supplies a method for studying and challenging architecture. It does not create a new sovereign agent, scheduler, release authority, or policy engine.

## 6. Coding-agent skill routing

The repository uses these focused skills:
- `reverse-features`: entry/preflight/coordination.
- `reverse-feature-investigation`: incumbent, REA/source research, evidence and mapping.
- `reverse-feature-challenge`: pairwise adversarial comparison and winner decision.
- `reverse-feature-implementation`: implement the recorded winner and verify.
- `factoryos-repo-assimilation`: mandatory companion for external repository clean-room governance.
- `factoryos-verify` / `factoryos-test`: applicable verification and real-mission testing.

Coding-agent entrypoints (`AGENTS.md`, `CLAUDE.md`, and `.agents/skills/AGENTS.md`) must route relevant tasks through these skills and require review of current `.okf` resources and relevant repo mappings.

## 7. Canonical artifacts

- Domain boundaries: [domain-registry.md](domain-registry.md)
- Candidate testing and comparison: [evaluation-protocol.md](evaluation-protocol.md)
- Decision record format: [decision-record-template.md](decision-record-template.md)
- REA mapping: [../research/repo-mappings/morluto-rea.md](../research/repo-mappings/morluto-rea.md)
- External repository provenance: [../research/repo-research-ledger.md](../research/repo-research-ledger.md)

The actual branch/commit, OKF sweep result, test evidence and promotion status must be recorded for each workstream. This document does not claim that the program is already fully enforced by CI.
