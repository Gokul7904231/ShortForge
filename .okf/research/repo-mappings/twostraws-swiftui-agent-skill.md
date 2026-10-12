# Repository Mapping: twostraws / SwiftUI-Agent-Skill

- Repository: https://github.com/twostraws/SwiftUI-Agent-Skill
- Reviewed ref: main
- Reviewed commit: f9800713b24580bc444931949aad4519128605e8
- Review date: 2026-10-12
- License reported by GitHub and upstream LICENSE: MIT
- Assimilation mode: PATTERN_EXTRACTION
- ShortForge status: PARTIALLY ADOPTED AS METHODOLOGY; no SwiftUI-specific skill content is imported.

## Problem and useful mechanism

The upstream skill is an intentionally modular set of guidance for AI coding assistants. Its README calls out token-cost discipline: keep skill text concise, avoid repeating generic knowledge, and emphasize edge cases and guidance that reliably improves outcomes. This is a useful process pattern for a growing multi-agent skill catalog.

## Existing ShortForge implementation and authority

- .agents/skills/ already holds ShortForge worker and engineering skills.
- .agents/skills/factoryos-repo-assimilation/SKILL.md now includes an evidence-first, bounded review protocol: reconstruct the existing implementation, selectively load references, ground findings, bound repair, classify outcomes, and report negative evidence.
- .okf/decision-protocol.md remains the decision gate; skill instructions do not supersede .okf, capability contracts, executable code, or tests.
- .okf/security/worker-permissions.md remains authoritative for permission enforcement.

## Patterns considered

- Adopted in part: modular skill files, high-signal instructions, selective reference loading, clear applicability, and concise domain-specific edge cases.
- Not adopted: SwiftUI-specific API advice, Apple-platform assumptions, copied skill bodies/prompts/assets, or automatic authority to install/change a worker capability.
- Future candidate: define a lightweight skill quality check for duplicate instructions, missing capability declarations, broken reference paths, and excessive context size. No such check is claimed by this mapping.

## Status and verification required

**PARTIALLY_ADOPTED (skill methodology plus mapping-quality gate).** The assimilation skill methodology is documented and `tools/okf/verify-thesix-repo-mappings.mjs` now checks the six new mapping files for required provenance/status/security headings and a clean-room disposition. This verifier is not a full skill linter: skill duplicate/context-budget checks and skill-content regression coverage still remain. CI is configured to run the mapping verifier and the focused new contract tests; actual run conclusions must be recorded from GitHub Actions. Evaluate token/context cost and retrieval success against a baseline before expanding the catalog.

Reject changes that merely inflate skill text, duplicate generic model knowledge, embed secrets, or suggest permissions that the worker's runtime does not grant.

## Security and provenance

A skill is advisory context, never an authorization mechanism. Tool execution must still be checked by AgentRuntime, Guardian/policy gates, session grants, and lease/fencing rules where applicable. MIT license; no upstream skill text was copied.

Reviewed upstream README and LICENSE at the immutable commit above. ShortForge skill validation is UNPROVEN.
