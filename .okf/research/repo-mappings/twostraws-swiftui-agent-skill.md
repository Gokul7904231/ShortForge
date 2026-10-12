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
- Partial check implemented: the THESIX mapping verifier checks required skill metadata/sections, an 1,800-word context ceiling, explicit BLOCKED/UNPROVEN semantics, and broken relative references. Duplicate-instruction analysis, missing capability declaration checks, and measured token/context-versus-quality benchmarking remain future work.

## Status and verification required

**PARTIALLY_ADOPTED (methodology + basic skill/mapping verifier).** tools/okf/verify-thesix-repo-mappings.mjs checks the six mapping files' required provenance/status/security headings and clean-room disposition, plus the assimilation skill's front matter, key sections, explicit BLOCKED/UNPROVEN terms, relative links, and 1,800-word context ceiling. It is not a semantic linter: duplicate-instruction/capability coverage, skill-content regression scenarios, and measured token/context-versus-quality evaluation remain pending. Current CI evidence must be read on the newest THESIX commit before claiming the gate is green.

Reject changes that merely inflate skill text, duplicate generic model knowledge, embed secrets, or suggest permissions that the worker's runtime does not grant.

## Security and licensing

A skill is advisory context, never an authorization mechanism. Tool execution must still be checked by AgentRuntime, Guardian/policy gates, session grants, and lease/fencing rules where applicable. MIT license; no upstream skill text was copied.

## Provenance

Reviewed upstream README and LICENSE at the immutable commit above. ShortForge skill validation is UNPROVEN.
