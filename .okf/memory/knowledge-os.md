# Memory: KnowledgeOS Architecture & Domain-Isolated Stores

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/knowledge/KnowledgeOSContracts.ts` & `apps/web/factoryos/core/knowledge/KnowledgeOS.ts`

---

## 1. Architectural Philosophy: Domain-Isolated Knowledge Stores

A critical vulnerability in general-purpose LLM memory systems is "semantic bleeding": when factual claims, creative narrative scripts, channel performance metrics, and compliance policies are dumped into a single unsegregated vector database, agents frequently retrieve narrative brainstorming fragments and treat them as verified factual truths.

To eliminate cross-contamination, FactoryOS implements **KnowledgeOS**—a clean-room, domain-isolated enterprise knowledge architecture. Knowledge is partitioned into six orthogonal, strongly-typed **Knowledge Domains**:
1. **Source**: Ingested raw media documents, research URLs, and author publications.
2. **Claim**: Discrete factual assertions extracted from sources.
3. **Evidence**: Cryptographically verified receipts, quotes, and research passports supporting claims.
4. **Topic**: Evergreen topic clusters, audience saturation metrics, and competitive white spaces.
5. **Channel**: Platform guidelines, voice personas, forbidden words, and cadence preferences.
6. **Performance**: Real viewer retention stats, CTR metrics, and benchmark evaluation scores.

```
┌────────────────────────────────────────────────────────┐
│                      KnowledgeOS                       │
└───────────────────────────┬────────────────────────────┘
                            │ Domain Partitioning
                            ▼
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│   Source    │    Claim    │  Evidence   │    Topic    │   Channel   │ Performance │
│ Raw URLs,   │ Assertions, │ Passports,  │ Clusters,   │ Guidelines, │ Retention,  │
│ Documents,  │ Facts,      │ Receipts,   │ Saturation, │ Personas,   │ CTR,        │
│ Transcripts │ Hypotheses  │ Citations   │ Trends      │ Rules       │ Watch Time  │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
                            ▲
                            │ Verified Promotion Gate
┌───────────────────────────┴────────────────────────────┐
│                    Candidate Intake                    │
│   (Unverified Claims, Hypotheses, Working Memory)      │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Domain Partitioning** | 6 strongly typed domains declared in `KnowledgeOSContracts.ts` | Multi-tenant isolated storage engines per domain with tenant encryption keys |
| **Promotion Gate** | Explicit validation function rejecting unverified claims | Automated multi-source cross-verification engine with citation triangulation |
| **Typed Retrieval** | Domain-targeted query routing (`queryByDomain()`) | Hybrid sparse-dense vector search with reciprocal rank fusion per domain |
| **Memory Eviction** | TTL and importance scoring per stored knowledge card | Automatic decay of transient trends while preserving evergreen historical facts |
| **Audit Logging** | In-memory append-only log with author and timestamp metadata | Blockchain or tamper-evident Merkle tree receipt verification for compliance |

---

## 3. Core Knowledge Contracts

Defined in `KnowledgeOSContracts.ts`:

```typescript
export type KnowledgeDomain = 
  | 'SOURCE'
  | 'CLAIM'
  | 'EVIDENCE'
  | 'TOPIC'
  | 'CHANNEL'
  | 'PERFORMANCE';

export interface KnowledgeItem<TData = unknown> {
  readonly id: string;
  readonly domain: KnowledgeDomain;
  readonly title: string;
  readonly data: TData;
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly verified: boolean;
  readonly sourceReferenceId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface KnowledgeOSStore {
  addItem<T>(domain: KnowledgeDomain, item: Omit<KnowledgeItem<T>, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeItem<T>>;
  getItem<T>(id: string): Promise<KnowledgeItem<T> | null>;
  queryByDomain<T>(domain: KnowledgeDomain, filter?: (item: KnowledgeItem<T>) => boolean): Promise<readonly KnowledgeItem<T>[]>;
  promoteToVerified(id: string, evidenceReceiptId: string): Promise<boolean>;
}
```

---

## 4. The Promotion Gate Invariant

To preserve the absolute purity of the long-term knowledge base:
1. **Unverified by Default**: Any item ingested from external web scraping, social media analysis, or LLM generation is stored with `verified: false`.
2. **Promotion Gate**: An item can only transition to `verified: true` if an authoritative verification agent or human auditor attaches a valid, cryptographic `evidenceReceiptId`.
3. **Downstream Invariant**: Floor 02 Scripting agents query the `CLAIM` domain with `verified: true` exclusively when writing educational and documentary scripts. Unverified claims cannot be used without explicit disclaimer tagging.


## Live Memory Fabric Integration — 2026-09-26

The previously documented target of automatic runtime-to-knowledge synchronization is now implemented as a bounded integration layer.

FactoryOS runtime events and MongoDB operational changes enter MemoryFabricBridge, which uses an idempotent MongoDB ledger and filesystem-backed knowledge vault materialization. The bridge does not replace KnowledgeOS or the operational memory repository.

The promotion boundary remains explicit:

    observation -> candidate -> verified -> promoted -> active

Unverified events remain outside the active agent/Ascalon projection. Temporal fields, provenance hashes, deterministic quality states, conflict groups and supersession provide the minimum controls for long-lived cognitive memory.

The Ascalon projection is generated automatically but remains an admission projection only. training_eligible is never inferred from a successful runtime event.
