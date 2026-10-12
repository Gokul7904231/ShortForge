---
name: factoryos-repo-assimilation
description: Skill for assimilating external open-source repositories into FactoryOS according to strict clean-room governance.
---

# FactoryOS Repository Assimilation Skill

## The Governance Rule
No third-party repository code, test suites, prompts, or proprietary assets may be copied into FactoryOS.
All capabilities must be independently reimplemented from first principles using clean-room interfaces and strongly typed contracts.

## The Assimilation Pipeline
1. `EXTERNAL REPOSITORY`: Identify problem solved and architectural mechanism.
2. `VERIFY LICENSE`: Check upstream license (MIT, Apache-2.0, BSD-3-Clause).
3. `CHOOSE ADOPTION MODE`:
   - `PATTERN_EXTRACTION`: Adopt architectural pattern/concept.
   - `CLEAN_ROOM_REIMPLEMENTATION`: Clean-room TypeScript implementation.
   - `ISOLATED_PROVIDER`: Network/process boundary adapter.
   - `RESEARCH_ONLY`: Document for future reference without runtime code.
4. `CREATE MAPPING`: Add `.okf/research/repo-mappings/<repo>.md`.
5. `UPDATE LEDGER`: Add entry to `.okf/research/repo-research-ledger.md`.

## Evidence-First, Bounded Review Protocol

6. **RECONSTRUCT BEFORE PROPOSING**: inspect the applicable `.okf` decision protocol, canonical architecture, relevant existing repository mappings, implementation, and tests before proposing a new abstraction. Record what is already implemented, partially implemented, scaffolded, planned, or explicitly rejected.
7. **LOAD REFERENCES SELECTIVELY**: open only the references needed for the current question; expand the scope when evidence reveals a dependency. Do not dump unrelated skill/reference content into the active context.
8. **GROUND EVERY FINDING**: each finding must identify a repository path and, where possible, symbol or line range; include the observed evidence, expected invariant, impact, and a reproducible verification step. Never invent files, tests, benchmark results, provider support, or runtime success.
9. **KEEP SCOPE BOUNDED**: do not mix unrelated refactors into a repository-assimilation task. Prefer the smallest compatible change that closes the demonstrated gap.
10. **USE A BASELINE AND BOUNDED REPAIR**: preserve the last-known-good behavior, compare the candidate against targeted checks, and reject or roll back changes that fail to improve the result or regress existing behavior. Stop after the configured repair budget; do not loop indefinitely.
11. **CLASSIFY THE OUTCOME**: `ADOPTED`, `PARTIALLY_ADOPTED`, `EXPERIMENT_ONLY`, `DEFERRED`, or `REJECTED`. Keep documentation, code, tests, and runtime evidence status separate.
12. **REPORT NEGATIVE EVIDENCE**: state what was searched and not found, which checks could not run, and what remains unproven. A blocked check is not a pass.

## Required Review Output

For each meaningful assimilation, report:
- Problem and user-visible value.
- Existing ShortForge implementation and canonical authority.
- Upstream license/model-weight license and isolation requirements.
- Adopted patterns and explicitly rejected mechanisms.
- Files/contracts/tests affected.
- Security, privacy, latency, token/cost, and maintenance trade-offs.
- Verification commands and actual results.
- Rollback/rejection condition and current status.

Never claim a clean-room implementation is tested merely because the interface compiles in theory. Never promote an experimental provider into a production path without qualification evidence.
