# FactoryOS System Architecture Specification

> **Document Class**: Core System Architecture Specification  
> **Status**: AUTHORITATIVE & IMPLEMENTATION-GROUNDED  
> **Source of Truth**: `apps/web/factoryos/core/hierarchy/FloorRegistry.ts`  

---

## 1. Architectural Foundations

FactoryOS rejects naive procedural scripting in favor of an **industrial distributed manufacturing plant**. Autonomous short-form video generation requires strict adherence to four architectural boundaries:

1. **Decoupled Plane Separation**: The sovereign control hierarchy (authority and supervision) is strictly decoupled from the physical production pipeline (sequential media transformation).
2. **Single Canonical Topology**: All components, planners, state machines, and validators derive their floor definitions from a single authoritative source: `apps/web/factoryos/core/hierarchy/FloorRegistry.ts`.
3. **Schedule-First Production**: Autonomous production quantities, cadences, and niches are strictly derived from active schedule directives; no business quantity is hardcoded into the pipeline.
4. **Claim <= Evidence Verification**: Physical outcomes must be verified with cryptographic receipts and forensic checks before delivery.

---

## 2. Decoupled System Architecture

```
                    SOVEREIGN CONTROL PLANE
                    ┌────────────────────────────────────────────────────────┐
                    │ Level 0: Human Authority (Executive Operator)          │
                    │   │                                                    │
                    │   ▼                                                    │
                    │ Level 1: Overseer Supreme Control Plane (Mission Lead) │
                    │   │                                                    │
                    │   ▼                                                    │
                    │ Level 2: Regulators & Safety Governors                │
                    │   ├── Guardian Gate (Capability & Policy Lease)        │
                    │   ├── Slayer Engine (Monotonic Lease Revocation)       │
                    │   └── Healer Engine (Circuit Doctor & Bounded Repair)  │
                    └────────────────────────┬───────────────────────────────┘
                                             │
                                             ▼
                    AGENT RUNTIME HARNESS
                    ┌────────────────────────────────────────────────────────┐
                    │ Session Lifecycle, Execution Budgets, Checkpointing,   │
                    │ Distributed TraceContext, and Capability Grants        │
                    └────────────────────────┬───────────────────────────────┘
                                             │
                                             ▼
                    CANONICAL EIGHT-FLOOR PRODUCTION PIPELINE
                    ┌────────────────────────────────────────────────────────┐
                    │ Floor 00: Analyst & Research Ingestion                 │
                    │   │                                                    │
                    │   ▼                                                    │
                    │ Floor 01: Strategic Direction & Narrative Blueprint    │
                    │   │                                                    │
                    │   ▼                                                    │
                    │ Floor 02: Cognitive Scripting & Retention Architecture │
                    │   │                                                    │
                    │   ├───────────────────────────────┐                    │
                    │   ▼                               ▼                    │
                    │ Floor 03: Visual Assets      Floor 04: Voice Synthesis │
                    │   │                               │                    │
                    │   └───────────────┬───────────────┘                    │
                    │                   ▼                                    │
                    │ Floor 05: Timeline Composition (TimelineIR / EDL)      │
                    │   │                                                    │
                    │   ▼                                                    │
                    │ Floor 06: Video GPU Rendering Engine (ComputeRouter)   │
                    │   │                                                    │
                    │   ▼                                                    │
                    │ Floor 07: QA Gate & Social Compliance Verification     │
                    └────────────────────────────────────────────────────────┘
```

---

## 3. Floor Topology & Dependency Invariants

The pipeline DAG is strictly defined in `apps/web/factoryos/core/hierarchy/FloorRegistry.ts` and enacted by `apps/web/factoryos/core/overseer/TaskDAGPlanner.ts`:

| Floor ID | Number | Canonical Name | Category | Predecessors | Parallel Branching |
| :--- | :---: | :--- | :--- | :--- | :--- |
| `floor00_analyst` | 0 | Analyst & Research Ingestion | `RESEARCH` | *None* | Root task |
| `floor01_strategy` | 1 | Strategic Direction & Research | `PLANNING` | `floor00_analyst` | Sequential |
| `floor02_scripting` | 2 | Cognitive Scripting & Structure | `CREATIVE` | `floor01_strategy` | Forks F03 & F04 |
| `floor03_asset_realization` | 3 | Visual Asset Realization & Blueprints | `MEDIA` | `floor02_scripting` | **Parallel** with F04 |
| `floor04_media_synthesis` | 4 | Voice & Audio Synthesis | `VOICE` | `floor02_scripting` | **Parallel** with F03 |
| `floor05_timeline_composition` | 5 | Timeline Composition & Motion | `COMPOSITION` | `floor03_asset_realization`, `floor04_media_synthesis` | **Convergence point** |
| `floor06_rendering` | 6 | Video GPU Rendering Engine | `RENDER` | `floor05_timeline_composition` | Sequential |
| `floor07_compliance` | 7 | QA Gate & Social Compliance | `VERIFICATION` | `floor06_rendering` | Final Gate |

### Key Topology Invariants:
1. **F00 is Mandatory in Autonomous Mode**: Floor 00 provides schedule-derived candidate slates to Floor 01. It is never bypassed during scheduled operations.
2. **Floor 03 vs. Floor 04 Parallelism**: F03 (visual assets) and F04 (speech/audio) run concurrently after F02 completes.
3. **Floor 05 Convergence**: Floor 05 cannot begin until **both** F03 and F04 have successfully produced verified artifacts.
4. **Guardian is Not Floor 07**: The Guardian is a sovereign Level 2 control agent exercising authority across all floors. Floor 07 is the physical QA/compliance verification floor.

---

## 4. Current Implementation vs. Target Architecture Matrix

| Subsystem | Component | Current Implementation State | Verified File Location | Target Architectural State |
| :--- | :--- | :---: | :--- | :--- |
| **Floor Registry** | Canonical Topology | **IMPLEMENTED** | `apps/web/factoryos/core/hierarchy/FloorRegistry.ts` | Single source of truth across runtime, DAG, and state service. |
| **Production DAG** | 8-Floor DAG Planner | **IMPLEMENTED** | `apps/web/factoryos/core/overseer/TaskDAGPlanner.ts` | Dynamic parallel fork/join execution with lease management. |
| **Scheduling** | Autonomous Scheduler | **IMPLEMENTED** | `apps/web/factoryos/core/production/AutonomousScheduler.ts` | ScheduleInstance $\rightarrow$ Mission $\rightarrow$ Overseer single scheduler path. |
| **Daily Slate** | Dynamic Research Slate Utility | **IMPLEMENTED / PARTIALLY_WIRED** | `apps/web/factoryos/core/research/DailySlateGenerator.ts` | Schedule-driven candidate filtering, passport lineage requirement, and explicit unmet capacity; direct F00 executor currently returns ResearchPassport + AnalystReport rather than emitting the slate itself. |
| **Research Boundary** | AgentReach & Reach | **IMPLEMENTED / BOUNDED** | `apps/web/factoryos/core/integrations/AgentReachAdapter.ts`, `ReachSubsystem.ts` | Real provider boundary with no synthetic sources; query path is still generic and Content-Engine research contracts are now passed into F00. |
| **Agent Runtime** | Execution Harness | **IMPLEMENTED** | `apps/web/factoryos/core/agent/AgentRuntime.ts` | Session checkpointing, budget bounds, capability gates, and TraceContext. |
| **Observability** | Distributed Tracing | **IMPLEMENTED** | `apps/web/factoryos/core/observability/TraceContext.ts` | Mission $\rightarrow$ Run $\rightarrow$ Agent $\rightarrow$ Skill $\rightarrow$ Tool $\rightarrow$ Artifact trace tree. |
| **KnowledgeOS** | Typed Memory Stores | **IMPLEMENTED** | `apps/web/factoryos/core/knowledge/KnowledgeOS.ts` | Domain-isolated typed stores (Source, Claim, Evidence, Topic, Channel). |
| **Model Routing** | Capability Router | **IMPLEMENTED** | `apps/web/factoryos/core/routing/CapabilityFirstRouter.ts` | Capability matching, circuit breakers, cost governance, and local preference. |
| **Media Pipeline** | TimelineIR (EDL) | **IMPLEMENTED** | `apps/web/factoryos/core/timeline/TimelineIR.ts` | Word-level timestamp synchronization and canvas validation (1080x1920). |
| **Voice Synthesis** | Voice Fabric | **IMPLEMENTED** | `apps/web/factoryos/core/voice/VoiceFabric.ts` | Multi-engine synthesis (Gemini, ElevenLabs, Edge), forensic WAV verification. |
| **Compute Fabric** | Compute Router & CAS | **IMPLEMENTED** | `apps/web/factoryos/core/compute/router/ComputeRouter.ts` | Utility-based provider scoring, ephemeral compute management, worker fencing. |
| **F06 Render Fabric** | Canonical `RenderFabric` + ComputeRouter execution facade | **IMPLEMENTED / CONSOLIDATING** | `apps/web/factoryos/core/fabric/RenderFabric.ts` | Single Floor 06 rendering entry point; compiler planning stays here, physical execution is routed through `ComputeGateway → ComputeRouter`; legacy `core/rendering/RenderFabric.ts` is compatibility-only. |
| **Verification Gate** | Structured Findings | **IMPLEMENTED** | `apps/web/factoryos/core/verification/StructuredFindings.ts` | Archify-promoted canonical Finding model with actionable repair actions. |
| **Healing** | Bounded Repair Engine | **IMPLEMENTED** | `apps/web/factoryos/core/healers/BoundedRepairEngine.ts` | Iterative repair limited by budget; reverts to Last-Known-Good baseline. |
| **External Integrations** | Remote Worker Fleet | **PARTIALLY_IMPLEMENTED** | `apps/web/factoryos/core/fabric/adapters/` | Local and AMD adapters implemented; cloud spot worker daemon scaffolded. |
| **Trend Intelligence** | Live Social Scanner | **SCAFFOLDED** | `apps/web/factoryos/core/research/TrendResearchService.ts` | Browser DOM extraction implemented; live social platform APIs scaffolded. |


---

## 5. Content Engine Configuration Architecture

Content Engines are versioned production contracts. They own the legal creator-facing configuration surface for their content type; the dashboard renders that contract rather than hardcoding every engine's fields.

```text
Engine Manifest
      ↓
Configuration Schema
      ↓
Creator Intent
      ↓
ProductionSpecCompiler
      ↓
Immutable ProductionSpec + SHA-256 hash
      ↓
FactoryOS Mission Scope
      ↓
F00–F07 projections
```

The configuration surface is partitioned into content, creative, media, delivery, runtime, and lifecycle. System routing policy, provider secrets, worker permissions, leases, fencing, governance, and F07 authority remain outside creator configuration.

### Engine-to-research boundary

A Content Engine declares its information requirements. F00 converts those requirements into a research specification and AgentReach acquisition plan. AgentReach is an evidence-acquisition boundary, not a generic content-policy oracle.

### Current rollout

- IMPLEMENTED: declarative configuration schema, server-side compiler, hash-bound ProductionSpec, schema-driven engine UI, engine registry propagation, job/mission snapshot propagation.
- PARTIAL: Quiz Engine currently declares a first-class configuration/contract profile; engines without declarations receive compatibility schemas.
- MIGRATION: downstream floors/workers still need progressive migration from legacy flat configuration fields to typed ProductionSpec projections.

The ProductionSpec is a configuration-plane artifact and does not replace the canonical eight-floor topology or the floor-specific input/output contracts.


## Floor 00 Final Audit Boundary

The authoritative final F00 audit is maintained at:
` .okf/audits/floor00-final-audit.md`

That audit supersedes older baseline claims about F00 runtime ownership, optionality, Reach status codes, Daily Slate wiring, and ResearchPassport provenance semantics.
