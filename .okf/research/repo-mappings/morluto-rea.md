# Repository Mapping: morluto/rea — Reverse Engineer Anything

> Reviewed: 2026-10-17  
> Upstream: https://github.com/morluto/rea  
> Inspected main commit: `c0b3cd14b1fd2367c8f8c115a070c4759e67b7ad`  
> Latest inspected published package release: `rea-agents-6.5.0` (published 2026-10-14)  
> Upstream license declared by package: MIT  
> Adoption mode: RESEARCH TOOL / VERSION-PINNED CLI-MCP BOUNDARY; no source assimilation  
> Status: MAPPED; production integration and provider qualification NOT CLAIMED

## 1. Why REA matters to Reverse Features

REA connects a coding/research agent to evidence-producing workflows for supported native binaries, managed artifacts, JavaScript/Electron apps, websites, runtime observations, saved network captures and related formats. It can return structured Evidence through CLI/MCP, support targeted artifact comparisons, retain unknowns/limitations, and build reconstruction-obligation/readiness records.

That makes REA useful when the question is how a feature behaves in a target that is packaged, running, or not fully explained by accessible source. It is not a replacement for normal GitHub/source repository inspection. The upstream `reverse-engineer-anything` skill explicitly recommends normal repository tools for ordinary source-repository architecture analysis.

Source refs:
- README and workflow: https://github.com/morluto/rea
- MCP/Evidence contracts: https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md
- Tool design: https://github.com/morluto/rea/blob/main/docs/tool-design.md
- Reconstruction readiness: https://github.com/morluto/rea/blob/main/docs/reconstruction-readiness.md
- Reconstruction obligation ledger: https://github.com/morluto/rea/blob/main/docs/reconstruction-obligation-ledgers.md
- Upstream skill: https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md

## 2. Useful mechanisms to evaluate

1. **Evidence-first results:** read canonical normalized results, evidence identity, raw provider result where present, and analysis profile/limitations.
2. **Coverage is explicit:** missing facets, truncation, unavailable authority and unresolved edges remain unknown rather than being interpreted as absence.
3. **Comparison requires compatible coverage:** partial or incompatible inventories must not be declared equal; static differences are candidates, not causal proof.
4. **Reconstruction obligations:** observations become explicit claims with owners, dependencies, fixtures, and comparable verifiers. A report cannot close merely because an explanation sounds complete.
5. **Target-appropriate workflow:** choose tools based on actual target type and available providers; do not run provider/setup diagnostics unnecessarily.
6. **CLI/MCP parity and conformance:** upstream tests workflow contracts, cancellation/cleanup, source revision, tamper/stale-input rejection and exact tool behavior.
7. **Provider and release honesty:** distinguish upstream main from published package release and claim support only where corresponding verification evidence exists.

## 3. Mapping to ShortForge

| REA mechanism | ShortForge-related incumbent / boundary | Reverse Features disposition |
|---|---|---|
| External evidence acquisition | `core/research/ReachSubsystem.ts`, `ResearchRuntime.ts`, `ResearchPassportContracts.ts` | Complementary: Reach acquires research sources; REA inspects suitable targets. One must not replace the other's authority. |
| Typed evidence and contradiction handling | `core/contracts/EvidenceContracts.ts`, `core/cognitive/graph/EvidenceGraphEngine.ts`, evidence/lineage contracts | Reuse canonical ShortForge contracts where semantically compatible; do not blindly translate or duplicate evidence authorities. |
| Bounded context / provenance | `core/cognitive/context/ContextFabric.ts`, `core/intelligence/context/` | Preserve target identity, evidence scope, references and unknowns in any future bridge. Verify durable persistence rather than assuming it. |
| Execution safety | `core/agent/execution/AgentExecutionRouter.ts`, Guardian and worker-permission rules | REA calls must remain bounded and scoped. Installing a skill is not proof an MCP server is connected, and MCP availability is not authorization to modify files. |
| Regression and acceptance | `testing/`, `apps/web/factoryos/tests/`, `.agents/skills/factoryos-test/`, `factoryos-verify/` | Use ShortForge's authoritative tests and release gates. REA readiness evidence does not certify ShortForge implementation. |
| Clean-room assimilation | `.agents/skills/factoryos-repo-assimilation/SKILL.md`, `.okf/research/repo-research-ledger.md` | Treat REA as a research tool/pattern source through its CLI/MCP boundary; do not copy its source/tests/prompts into ShortForge by default. |

**Gap identified from the inspected main tree:** a dedicated Reverse Features program and its phase skills/canonical records were not present under the inspected paths. This is an inventory observation, not a claim about uninspected branches or unpublished local work.

## 4. What not to adopt blindly

- Do not copy REA's implementation or tests into ShortForge as a shortcut.
- Do not use REA for ordinary source-repository architecture analysis where normal source tools are sufficient.
- Do not assume every REA main-branch capability exists in the latest published package or a connected agent session.
- Do not infer equivalence from hashes/metadata when behavior coverage is missing.
- Do not allow an REA report, reconstruction ledger, or model interpretation to select or promote a production design without ShortForge's explicit candidate challenge and authority gates.
- Do not install or reconfigure REA/native analysis providers without checking supported client, environment, effects and required approvals.

## 5. Integration decision and admission criteria

Initial decision: **use REA as a version-pinned investigation tool behind its CLI/MCP boundary when its target support adds material evidence; do not add REA as a production runtime provider and do not copy source code.**

Before integrating an automated adapter, prove:
- version-pinned package/tool identity and CLI/MCP conformance;
- supported target/provider coverage on the target OS/runtime;
- structured Evidence fidelity, cancellation, bounded resource lifetime and cleanup;
- source/target identity binding, provenance retention and safe handling of untrusted analysis output;
- no automatic setup/configuration mutations outside approved scope;
- tests for missing REA, unsupported targets, partial coverage, contradictory evidence, cancellation and stale/tampered evidence;
- cost/latency comparison versus ordinary source analysis and alternatives;
- clean-room/license review of REA and relevant bundled/transitive dependencies.

## 6. Links and provenance

- Repository: https://github.com/morluto/rea
- Package manifest: https://github.com/morluto/rea/blob/main/package.json
- Release 6.5.0: https://github.com/morluto/rea/releases/tag/rea-agents-6.5.0
- Main commit inspected: https://github.com/morluto/rea/commit/c0b3cd14b1fd2367c8f8c115a070c4759e67b7ad

This mapping records external research, not a production qualification result. Update the version, evidence, implementation disposition and ledger whenever the upstream is re-evaluated.
