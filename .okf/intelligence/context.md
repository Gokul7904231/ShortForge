# Intelligence: Context Management & Dynamic Window Packing

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/agent/` & `apps/web/factoryos/core/memory/`

---

## 1. Architectural Philosophy: Context as a Scarce Working Set

In FactoryOS, model context windows are treated as high-value, bounded working memory rather than passive dumping grounds for unbounded logs. Cramming entire chat histories, unranked search results, or raw media descriptions into an LLM prompt degrades reasoning quality, inflates inference latency and financial cost, and introduces "needle in a haystack" retrieval failures.

FactoryOS employs an active **Working Set Context Manager** that synthesizes the execution context dynamically for each floor agent step:
1. **System Persona & Floor Protocol**: Sovereign role constraints, input schemas, and output validation requirements.
2. **Task State & Preceding Floor Artifacts**: Exact cryptographic references to upstream floor outputs (e.g., Floor 02 Script receiving Floor 01 Narrative Blueprint).
3. **Selective Episodic Memory Injection**: High-relevance past findings, platform policy guidelines, and channel performance heuristics retrieved via `KnowledgeOS` and `MemoryOS`.
4. **Active Workspace Buffer**: The compact history of recent tool executions and observations within the current agent session.

```
┌────────────────────────────────────────────────────────┐
│                   Context Window Budget                │
│                     (e.g., 8,192 Tokens)               │
├──────────────────────────┬─────────────────────────────┤
│ System Protocol (20%)    │ Role, Floor Invariants,     │
│                          │ Output Schema Verification  │
├──────────────────────────┼─────────────────────────────┤
│ Upstream Artifacts (40%) │ Exact Input JSON, Beats,    │
│                          │ Narrative Strategy Artifact │
├──────────────────────────┼─────────────────────────────┤
│ Domain Memory (20%)      │ Verified Claims, Channel    │
│                          │ Rules, Style Guides         │
├──────────────────────────┼─────────────────────────────┤
│ Dynamic Working Set (20%)│ Recent Actions, Tool        │
│                          │ Outputs, Active Errors      │
└──────────────────────────┴─────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Window Budgeting** | Explicit token allocation limits enforced in `AgentRuntimeContracts.ts` | Dynamic token budget reallocation based on real-time task complexity |
| **Episodic Compression** | Deterministic summarization of tool call histories | Semantic compaction using specialized summarizer models |
| **Memory Injection** | Domain-isolated typed stores (`KnowledgeOS`) queried via capability gates | Vector similarity + BM25 hybrid reranking with graph-walk filtering |
| **Context Eviction** | LRU eviction of old tool outputs when token budget threshold reached | Importance-weighted attention eviction preserving critical constraints |
| **Prompt Caching** | Static prefix alignment to maximize provider prompt cache hits | Automatic KV-cache optimization across multi-turn session interactions |

---

## 3. Working Set Assembly Lifecycle

When an agent is scheduled to execute a step within a floor task:

1. **Quota Reservation**: The runtime determines the maximum allowed prompt tokens for the model target (e.g., 4,096 tokens for fast formatting, 32,768 tokens for deep analysis).
2. **Static Anchor Packing**: The immutable system prompt, schema validators, and floor contracts are packed first. Because these prefixes remain identical across tasks, providers can leverage prefix caching to reduce latency by up to 80%.
3. **Artifact Projection**: Upstream artifacts are projected into concise, canonical JSON representations. Redundant fields are stripped before serialization.
4. **Episodic Memory Query**: The agent's query is resolved against `KnowledgeOS` (channel preferences, negative topics, platform constraints) and injected as structured context cards.
5. **Session Truncation / Rolling Window**: If the session trajectory exceeds the allocated dynamic buffer, earlier observation records are replaced with concise digest summaries.
