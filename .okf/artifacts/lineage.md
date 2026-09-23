# Artifacts: Media Lineage, Provenance Graph & Traceability

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/observability/TraceContext.ts` & `apps/web/factoryos/core/agent/`

---

## 1. Architectural Philosophy: The Full-Spectrum Provenance Graph

In modern generative media pipelines, accountability is non-negotiable. If a rendered video contains a copyright violation, a factual inaccuracy, or a visual artifact, operators must be able to trace that defect backward through the entire transformation DAG to the exact input, model prompt, seed, or tool execution that introduced it.

FactoryOS constructs an unbroken, content-addressed **Media Lineage Graph** that records every dependency from initial research ingestion to final MP4 publication.

```
                      ┌─────────────────────────────────┐
                      │ Schedule & Daily Requirements   │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │ F00: Research & Passport Slate  │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │ F01: Editorial Blueprint        │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │ F02: Script & Beat Sheet        │
                      └────────┬───────────────┬────────┘
                               │               │
             Parallel Branch A │               │ Parallel Branch B
                               ▼               ▼
               ┌──────────────────────┐ ┌──────────────────────┐
               │ F03: Asset Manifest  │ │ F04: Speech Package  │
               └───────────────┬──────┘ └──────┬───────────────┘
                               │               │
                               └───────┬───────┘
                                       │ Convergence Synchronization
                                       ▼
                      ┌─────────────────────────────────┐
                      │ F05: TimelineIR Composition     │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │ F06: Rendered MP4 Video         │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │ F07: Verification & Receipts    │
                      └─────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Lineage Tracking** | Parent artifact hashes and distributed `TraceContext` in all records | Native graph database (Cypher queryable) indexing all artifact transitions |
| **Defect Back-Tracing** | Automated rule mapping from Floor 07 `Finding` to offending floor | Automated counterfactual causal attribution isolating the exact prompt token |
| **Audit Export** | JSON export containing end-to-end receipt chain and digests | C2PA (Coalition for Content Provenance and Authenticity) manifest embedding into MP4 |
| **Reproducibility** | Full seed, model version, and temperature recording in job manifest | Bit-for-bit deterministic re-render guarantees for all synthetic stages |

---

## 3. Provenance Verification Rules

1. **No Orphan Artifacts**: An artifact cannot enter Floor 05 Timeline Composition without valid parent pointers to both Floor 03 (Visual Assets) and Floor 04 (Speech Audio).
2. **Digest Verification**: When Floor 06 renders an MP4, the render worker validates the SHA-256 hash of every asset listed in the `TimelineIR` against the CAS. Corrupted or altered assets cause immediate render failure.
3. **Trace Preservation**: The root `traceId` and `missionId` must persist identically across all lineage links.
