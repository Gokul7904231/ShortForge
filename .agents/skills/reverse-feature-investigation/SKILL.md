---
name: reverse-feature-investigation
description: Establish the real incumbent implementation and investigate external concepts for a Reverse Features workstream. Use REA when supported target behavior, packaged apps, or runtime evidence matters; use source repository tools for ordinary code analysis. Always review relevant OKF resources and mappings.
---

# Reverse Feature Investigation

## 1. Start from ShortForge, not from the newest external idea

- Read the complete current `.okf/` as required by `.okf/decision-protocol.md` and run the machine sweep/inventory.
- Read relevant mappings under `.okf/research/repo-mappings/`, relevant decisions/audits/security/authority rules, the repository research ledger, and source-provenance records. Follow each mapping's named implementation path and inspect whether it is still accurate.
- Inspect the actual incumbent code, canonical contracts, tests, production-helper evidence where required, current base revision, and open PRs/branches that may already implement alternatives.
- Record exact revision/path evidence. Mark statements as OBSERVED, VERIFIED, ASSERTED, INFERRED, or UNKNOWN using the project's evidence conventions.

## 2. Choose the proper investigation method

- **Source repository:** inspect source, tests, build configuration, docs, history and license with ordinary repository tools. Do not run REA merely because a repository is involved; REA's own workflow says ordinary source-repository architecture analysis should use normal repository tools.
- **Packaged application / website / runtime / binary / artifact:** use REA only if its connected CLI/MCP and target/provider support the requested observation. Capture the exact target identity/revision, operation, authority/effects, evidence ID or exported bundle, coverage, limitations and unknowns.
- **Unavailable REA or unsupported target:** continue supported source/document research, record the missing authority, and leave runtime-dependent claims UNKNOWN. Do not repeat setup blindly or claim the runtime behavior was observed.
- For the initial ShortForge integration experiment, pin a reviewed REA release rather than implicitly depending on `@latest`. Current main and the latest published release can differ; record which was studied.

## 3. Reconstruct the concept

For each external concept, record:
- problem it solves and user-visible behavior;
- mechanism/algorithm, major modules, inputs/outputs, data/control flow and lifecycle;
- dependencies, contracts, failure handling, resource limits and security boundaries;
- available positive, negative, failure/recovery and performance evidence;
- what was directly observed versus inferred from code/docs;
- unsupported assumptions, gaps, limitations and what evidence would close each gap;
- license and provenance disposition before any implementation decision.

Do not use a persuasive README or one successful demonstration as proof of general reliability. Do not infer absence from incomplete search/analysis coverage.

## 4. Produce investigation outputs

Update the workstream's candidate register and evidence ledger, then create or update the appropriate mapping under `.okf/research/repo-mappings/`. When an external repository is researched, update `.okf/research/repo-research-ledger.md` according to `.agents/skills/factoryos-repo-assimilation/SKILL.md`.

Investigation does not select the winner. Hand the incumbent and every plausible alternative—including hybrid candidates—to `reverse-feature-challenge`. No winner-dependent implementation begins until the decision is recorded.
