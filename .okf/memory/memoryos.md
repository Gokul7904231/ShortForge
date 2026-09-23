# Memory: MemoryOS Architecture & Dual-Tier Cognitive Store

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/memory/` & `apps/web/factoryos/core/agent/`

---

## 1. Architectural Philosophy: Tiered Memory for Autonomous Systems

Stateful agentic systems require structured memory that balances immediate operational context against long-term historical learning. Unbounded flat memory stores suffer from noise contamination, cross-domain bleed, and token budget exhaustion.

FactoryOS structures cognitive memory into a **Dual-Tier Memory Model**:
1. **Working Memory (Episodic & Transient)**:
   - Tracks active mission execution, sub-task inputs, intermediate skill results, and active session trajectories.
   - Strictly lifecycle-bounded: scoped to the mission duration and compacted or archived upon mission terminal state.
2. **Long-Term Memory (Semantic & Procedural)**:
   - Stores high-performing narrative templates, retention curves, channel style profiles, past compliance violations, and successful healer repair strategies.
   - Persisted across missions, indexed via vector embeddings and deterministic metadata tags for semantic retrieval during Floor 01 Strategy and Floor 02 Scripting.

```
┌────────────────────────────────────────────────────────┐
│                   Agent Execution Loop                 │
└───────────────────────────┬────────────────────────────┘
                            │ Read / Write
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Working Memory Tier                  │
│  ├── Active Task Context Buffer                        │
│  ├── Intermediate Skill Result Cache                   │
│  └── Checkpoint History (Rollback Anchor)              │
└───────────────────────────┬────────────────────────────┘
                            │ Graduation Gate (Promote)
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Long-Term Memory Tier                 │
│  ├── Semantic Store (Embeddings + Vector Index)        │
│  ├── Procedural Store (Repair Patterns, Blueprints)    │
│  └── Historical Performance Ledger (Retention Signals) │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Memory Isolation** | Session-isolated memory buffers in `AgentRuntime` | Distributed multi-tenant Redis/PostgreSQL vector stores with tenant sharding |
| **Episodic Retention** | In-memory session checkpoints with JSON serialization | Write-ahead transactional log with incremental snapshotting to S3/GCS |
| **Semantic Retrieval** | Vector similarity lookups via local embedding adapters | Hybrid dense-sparse retrieval (ColBERT / BM25) with reciprocal rank fusion |
| **Memory Graduation** | Explicit promotion through `KnowledgeOS` validation gate | Automated background memory consolidation and concept distillation agent |
| **Privacy & Hygiene** | Sensitive credential stripping prior to persistence | Automated PII redaction and differential privacy injection on training exports |

---

## 3. Memory Structure & Invariants

1. **Transient Isolation**: Working memory entries from Mission $A$ are never accessible to Mission $B$ without passing through an explicit promotion gate.
2. **Checkpointing**: Every floor state transition records an immutable snapshot of working memory. If a failure occurs, the Healer restores the agent's working memory to the last known good checkpoint.
3. **Procedural Feedback**: When Floor 07 detects an error and the Healer repairs it, the successful repair sequence is ingested into long-term procedural memory to prevent similar failures in future generations.
