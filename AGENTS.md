# ShortForge Agent Operating Contract

This file is the repository-wide entry point for coding agents. The current `.okf` corpus, executable implementation, canonical contracts, and tests govern engineering work. Conversation context or external research never substitutes for repository review.

## Mandatory preflight for every non-trivial change

1. Read `.okf/decision-protocol.md` and review the complete current `.okf/` corpus, including current rules, decisions, audits, source-of-truth records, security, hierarchy, workflows, and research mappings. Do not rely on a remembered summary or read only the obvious files.
2. Run the repository's machine sweep/inventory (`tools/okf/sweep.py`) against the relevant base and head where available. The sweep records corpus inventory and rule applicability; it does **not** prove that the corpus was read or that tests/runtime/security passed.
3. Open every relevant `.okf/research/repo-mappings/` file, inspect its adopted and rejected mechanisms and follow the implementation paths it names. Consult `.okf/research/repo-research-ledger.md` and source-provenance records. If no mapping exists, record that gap before relying on external research.
4. Inspect actual source, contracts, tests, current branch/main, and relevant open PRs/branches. Distinguish IMPLEMENTED, PARTIALLY_IMPLEMENTED, SCAFFOLDED, PLACEHOLDER, EXPERIMENTAL, and PLANNED.
5. Preserve authority, clean-room implementation, licensing, security, cost, and verification boundaries. Do not silently contradict a locked decision or duplicate an existing authority.
6. Record the decision and provenance in the appropriate canonical `.okf/` document. UNPROVEN, BLOCKED, and UNKNOWN must never be reported as PASS.

## Reverse Features is mandatory for concept upgrades

For any task that investigates, reverse-engineers, compares, or upgrades an existing ShortForge concept, use these skills as applicable:

- `reverse-features` — program entry point and mandatory preflight.
- `reverse-feature-investigation` — establish the incumbent and investigate evidence-backed alternatives.
- `reverse-feature-challenge` — compare the incumbent and all viable alternatives pairwise.
- `reverse-feature-implementation` — implement only the selected winner and verify it.

Read `.okf/reverse-features/README.md`, `domain-registry.md`, and `evaluation-protocol.md` plus every relevant repository mapping before proposing changes.

**Absolute rule:** reverse-engineer the existing concept; challenge the incumbent and every viable alternative against each other; determine the winner using comparable evidence; implement only that winner. The incumbent gets no automatic preference, and novelty/popularity/model confidence earns no preference. Include plausible hybrids. If evidence cannot establish a winner, record `UNKNOWN / NEEDS_EVIDENCE` and do not claim superiority or proceed with winner-dependent implementation.

REA is a reverse-engineering instrument, not an architecture decision-maker. Use REA for supported packaged-app/runtime/artifact targets; use normal repository tools for ordinary source-repository analysis. Do not install/update tools or mutate client configuration without following the selected tool's documented approval boundaries.

## Authority and implementation constraints

- Human Authority and Overseer remain the command/promotion boundary; model output is advisory.
- Guardian capability/policy authorization, Slayer enforcement, Healer remediation, Treasurer economic admission/settlement, worker execution, and F07 evidence-based release remain distinct.
- Preserve canonical contracts and floor topology unless an explicit evidence-backed decision authorizes a change.
- Use clean-room implementation and record external source/license/provenance decisions. Do not copy upstream source, tests, prompts, or proprietary assets by default.
- Isolate work on a branch/worktree, avoid overlapping active PRs, run the applicable tests and Team Change Gate, and do not merge without required review.

See `.agents/skills/AGENTS.md` for skill routing and `CLAUDE.md` for Claude Code-specific instructions.
