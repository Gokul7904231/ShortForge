# Research: Reach Engine & AgentReach Boundary

> **Status**: CANONICAL / IMPLEMENTATION-ALIGNED  
> **Current implementation**: `apps/web/factoryos/core/research/ReachSubsystem.ts` and `apps/web/factoryos/core/integrations/AgentReachAdapter.ts`

## 1. Current boundary

Reach is an external-information acquisition subsystem.

Current supported paths are:

1. **Direct URL** → `LightpandaBrowserAdapter.navigateAndExtract()`
2. **Query** → configured `SEARCH_API_URL`
3. **No configured query provider** → empty evidence result
4. **Test** → injected `ReachTestProvider`

The current query path is generic. It is **not yet hard-bound to a Content Engine-specific query schema**.

The intended next architecture is:

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

