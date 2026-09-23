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
