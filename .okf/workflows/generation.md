# Workflows: End-to-End Generation Workflow & Production Pipeline

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/overseer/TaskDAGPlanner.ts` & `apps/web/factoryos/core/hierarchy/FloorRegistry.ts`

---

## 1. Architectural Philosophy: The Canonical 8-Floor Production DAG

FactoryOS executes automated video generation via the **Canonical 8-Floor Production Directed Acyclic Graph (DAG)**. This pipeline enforces deterministic sequence dependencies, strict validation gates, and maximum parallel concurrency where safe.

Crucially:
- **Floor 00** (Market Analyst & Research) initiates the pipeline, deriving research requirements dynamically from the daily schedule.
- **Floor 03** (Asset Realization) and **Floor 04** (Media Synthesis & Speech Engine) execute in parallel following **Floor 02** (Scripting).
- **Floor 05** (Timeline Composition) acts as the convergence synchronization barrier, requiring successful completion of both F03 and F04 before assembling the multi-track timeline.
- **Floor 06** (Rendering) compiles the timeline into a binary MP4 via provider-neutral distributed compute workers.
- **Floor 07** (QA & Compliance Verification) inspects the final render and all upstream artifacts before release.

```
                  ┌───────────────────────────────────────────────┐
                  │ Floor 00: Market Analyst & Trend Intelligence │
                  └───────────────────────┬───────────────────────┘
                                          │ Daily Content Slate
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │ Floor 01: Narrative Strategy & Ideation       │
                  └───────────────────────┬───────────────────────┘
                                          │ Editorial Blueprint
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │ Floor 02: Scripting & Beat Sheet Engine       │
                  └───────────────┬───────────────────────┬───────┘
                                  │                       │
                Parallel Branch A │                       │ Parallel Branch B
                                  ▼                       ▼
┌───────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
│ Floor 03: Asset Realization & Sourcing    │   │ Floor 04: Media Synthesis & Speech Engine │
│ (Visual Prompts, B-Roll, Graphic Layouts) │   │ (Voice Routing, TTS Generation, Syllables)│
└─────────────────────┬─────────────────────┘   └─────────────────────┬─────────────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              │ Convergence Synchronization Barrier
                                              ▼
                  ┌───────────────────────────────────────────────┐
                  │ Floor 05: Timeline Composition & Staging      │
                  └───────────────────────┬───────────────────────┘
                                          │ TimelineIR (Multi-track EDL)
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │ Floor 06: Rendering & Media Encoding          │
                  └───────────────────────┬───────────────────────┘
                                          │ Rendered MP4 Artifact
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │ Floor 07: QA & Compliance Verification        │
                  └───────────────────────┬───────────────────────┘
                                          │ Verification Pass / Structured Findings
                                          ▼
                            [ Release to Publication ]
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Pipeline DAG Model** | Canonical 8-floor DAG with parallel `F03 \|\| F04` in `TaskDAGPlanner.ts` | Dynamic genre-adaptive sub-DAG compilation with runtime node insertion |
| **Branch Parallelism** | Promise-based asynchronous floor dispatch converging on F05 barrier | Distributed message-driven worker orchestration across separate physical compute nodes |
| **Compute Execution** | Provider-neutral Compute Fabric with lease tokens and callback fencing | Hybrid cloud-edge rendering across distributed GPU clusters (NVIDIA / Apple Silicon) |
| **Quality Verification**| Floor 07 automated finding evaluation with severity thresholds | Real-time human-in-the-loop review for flagged borderline compliance scores |
| **Quota & Billing** | Pre-flight quota reservation and post-render credit settlement | Token-level continuous micro-billing with automated budget cutoffs |

---

## 3. End-to-End Sequence Diagram

```
Scheduler / UI        AutonomousScheduler       Overseer Control Plane      Floor 00-02 Workers       Floor 03 & 04 (Parallel)     Floor 05 Timeline      Compute Worker (F06)     Floor 07 Verification
      │                        │                         │                           │                           │                            │                          │                           │
      ├── Trigger Schedule ───►│                         │                           │                           │                            │                          │                           │
      │                        ├── Create ScheduleInst ─►│                           │                           │                            │                          │                           │
      │                        │   & Mission             ├── Init 8-Floor DAG        │                           │                            │                          │                           │
      │                        │                         ├─ Dispatch F00 Analyst ───►│                           │                            │                          │                           │
      │                        │                         │                           ├── Research Slate ────────►│                            │                          │                           │
      │                        │                         ├─ Dispatch F01 Strategy ──►│                           │                            │                          │                           │
      │                        │                         │                           ├── Narrative Blueprint ───►│                            │                          │                           │
      │                        │                         ├─ Dispatch F02 Script ────►│                           │                            │                          │                           │
      │                        │                         │                           ├── Beat Sheet & Narration ─┼───────────────────────────►│                          │                           │
      │                        │                         ├─ Dispatch F03 & F04 ──────┼───────────────────────────┼──────────┬─────────────────┤                          │                           │
      │                        │                         │  (Concurrently)           │                           │          │                 │                          │                           │
      │                        │                         │                           │                           ▼ F03      ▼ F04             │                          │                           │
      │                        │                         │                           │                         Assets     Speech Audio        │                          │                           │
      │                        │                         │                           │                           │          │                 │                          │                           │
      │                        │                         ├─ Barrier Check (F03+F04) ◄┼───────────────────────────┴──────────┴─────────────────┤                          │                           │
      │                        │                         ├─ Dispatch F05 Timeline ───────────────────────────────────────────────────────────►│                          │                           │
      │                        │                         │                                                                                    ├── Assemble TimelineIR ──►│                           │
      │                        │                         ├─ Dispatch F06 Render ────────────────────────────────────────────────────────────────────────────────────────►│                           │
      │                        │                         │                                                                                                               ├── Execute Render Job ────►│
      │                        │                         │◄── Signed Callback (Fencing Token + MP4 Hash) ────────────────────────────────────────────────────────────────┤                           │
      │                        │                         ├─ Dispatch F07 QA ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────►│
      │                        │                         │                                                                                                                                           ├── Validate Findings ─────►│
      │                        │                         │◄── Verification Receipt (0 Errors) ───────────────────────────────────────────────────────────────────────────────────────────────────────┤
      │                        │                         ├── Mark Mission COMPLETED  │                           │                            │                          │                           │
      │◄── Emit Completion ────┴─────────────────────────┴───────────────────────────┴───────────────────────────┴────────────────────────────┴──────────────────────────┴───────────────────────────┴───────────────────────────┘
```
