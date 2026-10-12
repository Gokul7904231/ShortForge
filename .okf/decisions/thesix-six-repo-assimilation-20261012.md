# THESIX — Six-Repository Assimilation Gate

- Date: 2026-10-12
- Branch: THESIX
- Decision type: scoped reference / research classification
- Status: PROVISIONAL RESEARCH RECORD; NOT A PRODUCTION PROMOTION
- Provenance: public upstream repository metadata, READMEs, and license disclosures reviewed at pinned commits recorded in the mappings.

## Decision

Create durable mapping records for the six research inspirations and apply the existing clean-room process. Do not add dependencies or promote any repository to a production execution path merely because a mapping exists. Keep existing ShortForge contracts and authority boundaries canonical.

This is a scoped assimilation record, not evidence that the mandatory full .okf sweep is complete. The six mappings and referenced existing contracts should be re-reviewed during the implementation-specific full sweep before a non-trivial integration is authorized.

## Six classifications

| Source | Mapping | Classification | Current ShortForge status |
|---|---|---|---|
| HelixDB/helix-foundry | research/repo-mappings/helixdb-helix-foundry.md | RESEARCH_ONLY / PATTERN_EXTRACTION | No integration; audit KnowledgeOS/Memory Fabric first; do not add parallel store |
| devdotfast/whiteboard | research/repo-mappings/devdotfast-whiteboard.md | PARTIALLY IMPLEMENTED PATTERN | LiveMissionCanvas UI slice exists on THESIX; untypechecked and unbrowser-tested |
| twostraws/SwiftUI-Agent-Skill | research/repo-mappings/twostraws-swiftui-agent-skill.md | PARTIALLY ADOPTED METHODOLOGY | Assimilation skill docs updated; skill lint/regression unrun |
| CopilotKit/OpenIntelligentUI | research/repo-mappings/copilotkit-openintelligentui.md | RESEARCH_ONLY | No general generative UI runtime; arbitrary generated code is not approved |
| datalab-to/lift | research/repo-mappings/datalab-to-lift.md | EXPERIMENT_ONLY | No adapter/model/service integrated; model-weight license/resource qualification pending |
| zvec-ai/zvec-grep | research/repo-mappings/zvec-ai-zvec-grep.md | EXPERIMENT_ONLY / BENCHMARK_FIRST | No integration; no comparative retrieval benchmark run |

## Existing .okf constraints considered

- .okf/decision-protocol.md requires the full current .okf tree to be reviewed before non-trivial implementation/architecture decisions, with source-of-truth distinctions and explicit outcome classification.
- .okf/hierarchy-map.md preserves Human Authority → Overseer, with Treasurer owning economic admission, Guardian capability/policy authorization, Slayer enforcement/revocation, Healer bounded remediation, workers execution only, and F07 independent verification.
- .okf/security/worker-permissions.md prohibits ambient worker authority and requires identity, task schema, capability grant, policy authorization, lease/fencing where relevant, and downstream verification.
- .okf/production-helper.md requires applicable tests/security/runtime evidence and says BLOCKED/UNPROVEN is not PASS.
- .okf/research/repo-mappings/tt-a1i-archify.md makes graph IR, evidence provenance, structured findings, bounded repair, and last-known-good protection prior patterns; do not create competing IRs.
- .okf/research/repo-mappings/microsoft-markitdown.md requires document conversion isolation and deferred broad document integration unless justified.
- .okf/research/repo-research-ledger.md is the research-provenance register.

## Authority and contracts affected

- Overseer: owns mission-level goals and system lifecycle; a presentation cannot alter authority.
- Treasurer: any future provider or model admission that consumes money/scarce compute must use existing economic admission and reconciliation.
- Guardian / worker runtime / lease and fencing: every future capability or side effect stays authorization-bound.
- F00 research, KnowledgeOS/Memory Fabric: imported claims remain unverified until existing promotion requirements are met.
- DocumentNormalizer: remains the only current document-normalization seam unless a separate architecture decision establishes otherwise.
- MissionGraphIR, EvidenceGraphIR, InteractionIR, and TimelineIR: reuse existing canonical contracts; no parallel IR created by these mappings.
- F07: final output/provenance verification remains independent of UI, retrieval rank, model schema validity, or internal quality scores.

## Cross-cutting promotion gates

1. Identify the exact missing requirement and prove it is not already covered by code, tests, or a prior mapping.
2. Record upstream license/version and keep code, model weights, hosted API terms, prompts, assets, and tests distinct in legal review.
3. Implement a narrow adapter or clean-room pattern only when a measured requirement justifies it.
4. Define baseline and acceptance metrics before evaluation.
5. Run targeted unit/contract tests, typecheck/build, permission/security checks, production-helper checks, and real-runtime evidence where applicable.
6. Preserve source provenance, data minimization, authorization, resource limits, rollback/rejection triggers, and negative evidence.
7. Keep the feature DISABLED / EXPERIMENTAL until required qualification evidence and human promotion review exist.

## Current evidence limits

- Mapping source review is recorded at immutable upstream commits in each mapping.
- THESIX branch commits for the existing LiveMissionCanvas and skill-methodology slice are recorded in the checkpoint report.
- Local typecheck/build/tests, browser run, six-workstream integration, Lift evaluation, zvec retrieval benchmark, full .okf sweep, and live mission/F07 proof remain NOT RUN or UNPROVEN as described in .okf/audits/THESIX-imp-completion.md.
- No repository in this wave is claimed as fully integrated or production-ready.

## Rollback / rejection conditions

Reject or revert any candidate that duplicates a canonical store/IR, bypasses authorization/economic admission, permits ambient tool/code execution, degrades retrieval or extraction quality relative to baseline, loses provenance, leaks secrets, violates license terms, or lacks the applicable verification evidence.
