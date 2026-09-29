# Research: Reach Engine & AgentReach Boundary

> **Status**: CANONICAL / IMPLEMENTATION-ALIGNED / CONTRACT-GATED  
> **Current implementation**: `apps/web/factoryos/core/research/ReachSubsystem.ts` and `apps/web/factoryos/core/integrations/AgentReachAdapter.ts`

## 1. Current boundary

Reach is an external-information acquisition subsystem.

Current supported paths are:

1. **Direct URL** → `LightpandaBrowserAdapter.navigateAndExtract()`
2. **Query** → configured `SEARCH_API_URL`
3. **No configured query provider** → empty evidence result
4. **Test** → injected `ReachTestProvider`

The query path is now **hard-bound to a Content Engine-specific research contract**.

Production Reach accepts no arbitrary query string. F00 must provide:
- selected `engineId`;
- engine-declared `queryKind`;
- engine-owned `queryTemplate` from the research contract;
- only parameters declared by that query rule.

Reach renders the provider-facing query itself. Direct URL retrieval is no longer part of the production research acquisition path.

The enforced architecture is:

```text
Content Engine Research Contract
        ↓
F00 Research Specification
        ↓
AgentReach query plan
        ↓
ReachSubsystem
        ↓
EvidenceSource[]
```

## 2. Honest failure semantics

The current implementation intentionally fails closed:

- empty AgentReach query → `NO_EVIDENCE`;
- failed query provider → no fabricated sources;
- direct URL retrieval failure → explicit unavailable source state;
- AgentReach only exposes online sources as usable findings;
- no synthetic placeholder URLs are created.

One important distinction is preserved:

**Reach may expose an unavailable retrieval record for diagnostics; ResearchRuntime removes unavailable/unreachable records before treating sources as evidence.**

## 3. Current data integrity

An `EvidenceSource` contains:

- source ID;
- URL;
- title;
- publisher when known;
- retrieval timestamp;
- extraction method;
- snippet;
- reliability score;
- optional content hash;
- source status and quality.

The current implementation does **not** independently verify the truth of an HTTP response merely because the transport succeeded.

## 4. Current vs target

| Dimension | Current | Target |
|---|---|---|
| URL browser | Lightpanda adapter | Expanded browser/provider fleet |
| Search | `SEARCH_API_URL` | Engine-specific research plans over multiple providers |
| Query authorization | Previously generic | **Required Content Engine query rule + engine profile binding** |
| Query construction | Caller supplied raw query | **Reach renders from engine-owned template** |
| Direct URLs | Supported by old Reach path | **Not accepted in production research acquisition** |
| Source truth | Transport + normalized metadata | Source-specific verification and corroboration |
| Social intelligence | Not a dedicated direct platform scraper | Engine-specific platform adapters |
| AgentReach contract | Generic query/domain/maxSources | Research-contract-driven bounded query plans |
| Failure semantics | Fail closed / no synthetic sources | Same invariant with richer diagnostics |

## 5. Governance invariant

AgentReach is an information-acquisition capability. It cannot:

- invent evidence;
- authorize content;
- bypass F00;
- bypass .okf policy;
- grant worker capabilities;
- override F07.


## 6. Contract-gate invariants

The production boundary now fails closed when:
- a Content Engine research contract is missing;
- the contract is not marked `required`;
- `agentReachProfile` does not exactly match `engine:<engineId>`;
- the query kind is not declared by the selected engine;
- the query template contains undeclared parameters;
- a required query parameter is missing;
- the caller is not `floor00_analyst`.

The legacy `AgentReachAdapter.searchExternalKnowledge(query)` surface remains only as a compatibility signature and returns `NO_EVIDENCE` with `REACH_ENGINE_CONTRACT_REQUIRED`; it no longer executes arbitrary research.

## 7. Current Content Engine query model

A Content Engine research contract declares query operations such as:

```text
engine:quiz
├── TOPIC_SCAN
├── FACT_CHECK
├── TREND_SCAN
└── COMPETITOR_SCAN
```

Each operation owns its provider-facing template. F00 selects the operation from its bounded methodology mapping; Reach performs the rendering and acquisition.

This preserves flexibility through multiple engine-defined operations while keeping the network boundary deterministic and auditable.