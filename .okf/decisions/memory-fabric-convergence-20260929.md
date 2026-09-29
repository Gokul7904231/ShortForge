# Memory Fabric Convergence — 2026-09-29

Status: IMPLEMENTED ON FEATURE BRANCH / VALIDATION IN PROGRESS

## Decision

ShortForge treats Memory Fabric as the canonical learned-memory substrate.

The canonical cognitive path is:

```text
runtime evidence
    -> MemoryFabricBridge
    -> retain / consolidate
    -> durable KnowledgeStore observations
    -> derived retrieval indexes
    -> recall
    -> provenance + scope guard
    -> reflect / mental-model refresh
    -> AER epistemic assessment
    -> bounded Ascalon proposal
```

Operational state, learned memory, proof, and authority remain separate:

```text
MongoDB / runtime state = operational truth
KnowledgeStore / Memory Fabric = derived cognitive memory
.okf = governance truth
F07 / VerificationReceipt = authoritative physical verification
AER = epistemic / economic advisory layer
Ascalon = bounded deep cognition
Guardian / Overseer = execution authority
```

## Convergence changes

1. `MemoryLifecycleService.retain()` now persists through the canonical observation consolidator instead of only marking a scope dirty.
2. `MemoryFabricBridge` uses the shared `MemoryLifecycleService` instance created by `IntelligenceGateway` when the controller boots Memory Fabric.
3. Runtime cognition can consume Memory Fabric recall through `CognitiveRuntime`; legacy `ExperienceMemory` remains only as a compatibility fallback when the canonical lifecycle is not injected.
4. `IntelligenceGateway.compileContextForQuery()` can consume Memory Fabric recall when an explicit `MemoryAccessContext` is supplied.
5. Trusted agent and Ascalon projections fail closed without an explicit access context.
6. Automatic Ascalon projection generation is disabled unless an explicit Ascalon principal/scope configuration is provided; there is no implicit cross-bank global projection.
7. All retained facts are processed; the bridge no longer keeps only `retainedFacts[0]`.
8. OKF serialization now persists Memory Fabric scope, entity, relation, observation, mental-model, verification, and refresh metadata so a reload does not silently erase authorization-relevant state.
9. Retrieval excludes stale candidates strictly when `includeStale=false`; unknown freshness is not equivalent to stale.
10. Temporal retrieval is intent-aware and weighted RRF is configurable rather than assuming every retrieval channel has equal relevance.
11. Derived lexical/entity/graph indexes are cached from the canonical KnowledgeStore and relations. They are indexes, not a second memory authority.
12. Evidence-aware consolidation deduplicates evidence identities, preserves typed contradiction state, and avoids textual contradiction concatenation.
13. Memory-backed epistemic evidence is bridged into AER without granting runtime authority.

## Research-derived constraints

Hindsight's current public implementation separates retain, recall and reflect and uses semantic, keyword, graph and temporal retrieval with rank fusion/reranking. ShortForge adopts the semantics while keeping the existing KnowledgeStore as the persistence boundary.

Recent state-tracking research argues that memory should model current vs superseded state rather than only retrieve matching text. ShortForge therefore preserves contradiction/supersession state and keeps stale fallback disabled for trusted recall.

Current hybrid-search guidance recommends tuning weighted RRF against a labeled evaluation set rather than treating equal channel weights as universally optimal. ShortForge exposes RRF channel weights for evaluation-driven calibration.

Unlazy's current method distinguishes definition binding, explicit approval and re-verification, while noting that an unkeyed digest is not authentication against ledger tampering. ShortForge therefore treats the native completion ledger as proof discipline, not as a replacement for trusted F07 verification receipts or .okf governance.

## Release law

This convergence is not a production-release claim.

Promotion requires:

- clean TypeScript and contract validation;
- green Memory Fabric integration tests;
- fresh FGC / AEF validation on the same commit;
- no unauthorized cross-scope retrieval in negative-control tests;
- current-vs-superseded memory evaluation;
- measured retrieval quality and latency/cost;
- AER shadow/replay evidence showing memory can improve or worsen decisions quantitatively;
- proof/authenticity review for high-value completion gates.

## Non-goals

This wave does not:

- create a second authoritative memory database;
- allow Ascalon to authorize execution;
- make learned memory equivalent to F07 truth;
- claim a production vector/ANN service where none is configured;
- claim autonomous mental-model scheduling until an actual scheduler/AER admission path exists.
