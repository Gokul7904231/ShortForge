# ShortForge / FactoryOS — Architectural Knowledge System (.okf)

> **Document Class**: Root Index & Architecture Handbook  
> **Status**: AUTHORITATIVE & IMPLEMENTATION-GROUNDED  
> **Repository**: [ShortForge](https://github.com/Gokul7904231/ShortForge)  
> **Canonical Pipeline**: F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07  

---

## 1. Executive Mission & System Identity

**ShortForge / FactoryOS** is an autonomous media manufacturing operating system engineered to transform raw schedule directives into verified, broadcast-grade short-form video assets. It replaces ad-hoc generative scripting with an industrial production plant governed by formal state machines, cryptographic provenance, capability-fenced worker leases, and forensic output verification.

```
                            USER / SCHEDULE DIRECTIVE
                                       │
                                       ▼
                              SCHEDULE INSTANCE
                                       │
                                       ▼
                                    MISSION
                                       │
                                       ▼
                       OVERSEER SUPREME CONTROL PLANE (L1)
                                       │
               ┌───────────────────────┼───────────────────────┐
               ▼                       ▼                       ▼
      GUARDIAN (L2 Gate)       SLAYER (Lease Reclaim)   HEALER (Circuit Doctor)
               │
               ▼
      AGENT RUNTIME HARNESS (Sessions, Budgets, Checkpointing, Tracing)
               │
               ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │               CANONICAL EIGHT-FLOOR PRODUCTION PIPELINE                   │
 │                                                                           │
 │  F00: Analyst & Research Ingestion (Schedule-driven candidate slate)      │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F01: Strategic Direction & Narrative Blueprint Formulation               │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F02: Cognitive Scripting & Retention Architecture                        │
 │   │                                                                       │
 │   ├───────────────────────────────────┐                                   │
 │   ▼                                   ▼                                   │
 │  F03: Visual Asset Realization       F04: Media Synthesis (Voice & Audio) │
 │   │                                   │                                   │
 │   └───────────────────┬───────────────┘                                   │
 │                       ▼                                                   │
 │  F05: Timeline Composition & Motion (TimelineIR / EDL compilation)        │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F06: Distributed Render Orchestration (Utility compute router)           │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F07: QA Gate & Social Compliance (Forensic verification & structured finding)│
 └───────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                          FORENSIC VERIFICATION RECEIPT
                                       │
                                       ▼
                               GATEWAY / OUTBOX
```

---

## 2. Source-of-Truth Priority Matrix

To prevent documentation drift and eliminate false claims, all architectural assertions in this system adhere to a strict source-of-truth precedence hierarchy:

```
[1. Executable Implementation] 
         ▼
[2. Canonical Ontologies & Contracts] (hierarchy.json, floors.json, FloorRegistry.ts)
         ▼
[3. Automated Verification Tests] (vitest suites)
         ▼
[4. Provider Registries & Runtime Configurations]
         ▼
[5. Inline Code Architecture Comments]
         ▼
[6. Authoritative .okf Documentation]
         ▼
[7. Historical Audits & Legacy Records]
         ▼
[8. External Reference Patterns]
         ▼
[9. Architectural Inference]
```

> **Invariant**: Never silently convert an architectural inference or target design into an implementation fact. Components not backed by executable code and passing tests must carry an explicit status tag: `IMPLEMENTED`, `PARTIALLY_IMPLEMENTED`, `SCAFFOLDED`, `PLACEHOLDER`, `EXPERIMENTAL`, or `PLANNED`.

---

## 3. Directory Navigation & Reading Taxonomy

| Section | Directory Path | Core Topics & Mandates |
| :--- | :--- | :--- |
| **System Foundations** | [`./architecture.md`](./architecture.md)<br>[`./principles.md`](./principles.md)<br>[`./terminology.md`](./terminology.md) | Decoupled hierarchy, 8-floor topology, core design principles, and unified terminology. |
| **Production Floors** | [`./floors/`](./floors/) | Deep specifications for Floors 00 through 07, inputs, outputs, contracts, and failure modes. |
| **Control Hierarchy** | [`./hierarchy/`](./hierarchy/) | Overseer, Guardian, Slayer, Healer, ReMaker, Auditor, and Worker execution contracts. |
| **Intelligence & Models** | [`./intelligence/`](./intelligence/) | AgentRuntime, Skills, Capability-First Model Routing, Evaluation suite, and Ascalon training. |
| **Cognitive Layer** | [`./cognitive/`](./cognitive/) | ShortForge Cognitive Layer, worker cognition contract, Devourer self-improvement program, and cross-layer improvement roadmap. |
| **Memory & Knowledge** | [`./memory/`](./memory/) | MemoryOS, KnowledgeOS, domain-typed stores, and long-term memory promotion. |
| **Workflows & Schedule** | [`./workflows/`](./workflows/) | Schedule lifecycle, mission execution, bounded healing, and gate-verified publishing. |
| **Artifacts & Lineage** | [`./artifacts/`](./artifacts/) | Content-addressed storage, TimelineIR (EDL), Structured Findings, and cryptographic receipts. |
| **Security & Trust** | [`./security/`](./security/) | Untrusted web content boundaries, capability grants, secret scanning, and lease fencing. |
| **Research & External** | [`./research/`](./research/) | Clean-room mappings for `video-use`, `WeKnora`, `Octop`, `orca`, `VoiceStudio`, and Reach. |
| **Historical Audits** | [`./audits/`](./audits/) | Archived forensic baselines, bypass analyses, and red-team findings (Historical Reference). |
