# ShortForge Native Learned-Memory + Proof System

> Status: IMPLEMENTED FOUNDATION / INTEGRATION VALIDATION PENDING
>
> Purpose: absorb the reusable engineering semantics from vectorize-io/hindsight
> and Leonxlnx/unlazy into the existing ShortForge Memory Fabric, AER, AEF,
> Verification, and .okf authority model without adding a competing runtime.

## 1. Source-to-system mapping

| Source pattern | Native ShortForge implementation | Authority boundary |
|---|---|---|
| Hindsight retain | `MemoryRetentionNormalizer` + Memory Fabric ingestion | retain records experience; verification remains downstream |
| Hindsight consolidate | `MemoryObservationConsolidator` + `KnowledgeStoreObservationAdapter` | derived observation is not truth |
| Hindsight recall | `MemoryRetrievalEngine` | bounded retrieval only |
| Hindsight reflect | `MemoryReflectionEngine` | synthesis is advisory |
| Hindsight mental models / knowledge pages | `MemoryMentalModelManager` + OKF/Markdown | model remains advisory and evidence-linked |
| Hindsight banks | `MemoryScope` + scope filtering | no cross-scope recall |
| Hindsight semantic/keyword/graph/temporal retrieval | semantic adapter + BM25-style lexical + graph + temporal channels | no fake semantic score |
| Hindsight RRF + rerank | native RRF + optional reranker | deterministic safety priors retained |
| Hindsight freshness | dirty-scope and stale checks | stale means verify, not discard |
| Hindsight refresh throttling | minimum interval + refresh mode contract | AER owns expensive scheduling |
| unlazy acceptance ledger | `MemoryCompletionLedger` | proof state separate from learning |
| unlazy definition-bound evidence | gate definition digest | drift requires reverify |
| unlazy abandonment | `HANDOFF` state | never promoted as success |
| unlazy leaf/branch/root verification | `LEAF` / `BRANCH` / `ROOT` gate layers | integration proof stays distinct |
| unlazy ownership/leases | existing Memory Fabric writer leases + .okf ownership policy | coordination is not isolation |

## 2. Four-layer learning model

```text
RAW EXPERIENCE / EVIDENCE
          |
          v
CONSOLIDATED OBSERVATION
          |
          v
MENTAL MODEL / KNOWLEDGE PAGE
          |
          v
AER EPISTEMIC STATE
```

`LEARNING != PROOF` is a permanent invariant.

The proof path is:

```text
intent -> authorized execution -> measured evidence -> verification -> proof -> promotion
```

## 3. Retain

`MemoryRetentionNormalizer` converts a runtime envelope into typed memory facts.
It preserves source identity, capture time, source hash, entity references and
deterministically generated evidence ids.

The default extractor is deliberately non-LLM. It can be replaced by an
LLM-backed extractor later, but extracted statements remain unverified until
the existing MemoryWriter / verification path accepts them.

## 4. Consolidate

`MemoryObservationConsolidator`:

- groups by scope and facet;
- creates and refines observations;
- preserves version history;
- tracks supporting evidence;
- records contradiction rather than deleting the prior state;
- reconciles near-duplicates deterministically;
- exposes dirty scopes for targeted maintenance.

`MemoryConsolidationStrategyRouter` adds tag-scoped missions and budgets. The
first matching strategy wins as a whole; later strategies do not fill fields
left blank by the first match.

## 5. Recall

`MemoryRetrievalEngine` has four independent channels:

```text
semantic  -> optional real embedding/vector adapter
lexical   -> deterministic BM25-style sparse ranking
graph     -> bounded entity/relation traversal
temporal  -> explicit time window + time-distance ranking
```

The ranked lists are fused with reciprocal-rank fusion. An optional reranker
can replace final ordering. Quality and freshness remain deterministic safety
priors rather than fake relevance signals.

Without a real semantic adapter, semantic ranking is absent rather than
simulated. All recall is bounded by items, characters and tokens.

## 6. Reflect

`MemoryReflectionEngine` separates retrieval from deeper synthesis planning:

```text
fresh mental model -> observation -> raw evidence
`````text

Stale derived memory triggers grounding against lower layers when policy allows.
Reflection does not create authority.

## 7. Mental models

`MemoryMentalModelManager` provides:

- FULL and DELTA refresh;
- refreshAfterConsolidation XOR refreshCron;
- minimum refresh intervals;
- dirty state and refresh eligibility;
- source fact-type filters;
- sibling-model exclusion by default;
- bounded refresh token budgets.

This is intentionally a data/control contract. AER remains responsible for
choosing when expensive reflection is economically justified.

## 8. Provenance lock

`MemoryProvenanceGuard` protects projections, especially the Ascalon path.
It detects:

`SCOPE_LEAK`, `MISSING_EVIDENCE`, `EXPIRED`, `DISPUTED`,
`MODEL_INFERENCE_AS_AUTHORITY`, `QUARANTINED`, and `INVALID_PROVENANCE`.

A learned statement can summarize evidence, but it cannot outrank or erase the
evidence that produced it.

## 9. Completion / proof semantics

`MemoryCompletionLedger` absorbs the key unlazy ideas without running shell
commands itself:

- explicit observable gate outcome;
- automatic, manual and integration proof kinds;
- definition digest bound to gate semantics;
- stale proof becomes `REVERIFY_REQUIRED`;
- explicit `HANDOFF` instead of silent failure;
- distinct leaf, branch and root release checks.

The actual unlazy checker remains the appropriate tool for executable gate
approval, environment binding and process handling. ShortForge records the
resulting evidence/proof state; it does not pretend to sandbox arbitrary code.

## 10. Persistence

ShortForge keeps one authoritative persistence plane:

```text
MongoDB operational state
        +
Memory Fabric ledger
        +
KnowledgeStore / OKF / Obsidian-derived memory
```

Hindsight is not installed as a second database or service. The native
observation adapter persists derived observations through KnowledgeStore while
keeping their lifecycle/verification state explicit.

## 11. Ascalon boundary

```text
Memory recall / reflect
        -> provenance guard
        -> AER epistemic state
        -> counterfactual cost-aware admission
        -> canonical Ascalon admission
        -> Guardian / Council
        -> AEF
        -> worker execution
        -> F00-F07 verification
        -> evidence + proof
        -> memory learning update
```

AER stays non-executing and Ascalon stays advisory. FactoryOS action authority
remains outside the memory layer.

## 12. Verification matrix

| Capability | Native component | Promotion evidence |
|---|---|---|
| Retain normalization | `MemoryRetentionNormalizer` | unit + provenance tests |
| Observation evolution | `MemoryObservationConsolidator` | support/contradiction/history tests |
| Scope strategy | `MemoryConsolidationStrategyRouter` | precedence + exact-scope tests |
| Four-way recall | `MemoryRetrievalEngine` | channel/RRF/budget tests |
| Semantic retrieval | injected adapter | measured benchmark with real embeddings |
| Graph retrieval | relation adapter | multi-hop benchmark |
| Temporal retrieval | temporal channel | time-window benchmark |
| Mental models | `MemoryMentalModelManager` | freshness/throttle/reuse tests |
| Provenance lock | `MemoryProvenanceGuard` | negative controls + scope tests |
| Completion proof | `MemoryCompletionLedger` | definition drift/reverify/handoff tests |
| Ascalon projection | `MemoryFabricProjection` | fresh CI + shadow replay + security |
| End-to-end learning | `MemoryLifecycleService` | replay with immutable artifacts |

## 13. What is intentionally not copied

Hindsight deployment options, provider catalog, hosted service and MCP/client
surface are not runtime dependencies of ShortForge. Unlazy's shell executor and
host isolation remain external tooling concerns.

The repositories are used as architectural evidence. ShortForge owns the
contracts, persistence, security boundary, verification and production policy.

## 14. Production status

This integration is an executable foundation, not a production-readiness claim.
Fresh CI, security validation, workload-specific replay, retrieval evaluation
and shadow-policy evidence remain release gates.

## 15. Permanent law

```text
LEARNING can change the next decision.
PROOF decides whether the change is trusted.
```