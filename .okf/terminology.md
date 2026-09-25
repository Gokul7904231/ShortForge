# FactoryOS Architectural Terminology & Entity Taxonomy

> **Document Class**: Canonical Dictionary & Concept Taxonomy  
> **Status**: AUTHORITATIVE & UNIFIED  

---

## 1. Production & Planning Entities

| Term | Canonical Definition | Source File / Contract |
| :--- | :--- | :--- |
| **Schedule** | The persistent specification defining production cadence, timezone, target niche, requested output count, format, and safety policy. | `apps/web/factoryos/core/schedule/ScheduleContracts.ts` |
| **ScheduleInstance** | A concrete, time-stamped execution instance of a Schedule for a specific calendar window, bearing an idempotency key. | `apps/web/factoryos/core/schedule/ScheduleContracts.ts` |
| **Mission** | An end-to-end autonomous objective managed by the Overseer Supreme Control Plane, coordinating the 8-floor production pipeline. | `apps/web/factoryos/core/missions/MissionManager.ts` |
| **Run** | A single execution attempt of a mission or sub-task within a leased compute window. | `apps/web/factoryos/core/overseer/OverseerControlPlane.ts` |
| **Daily Content Slate** | A schedule-driven F00 slate utility containing deduplicated, source-backed candidate references and explicit unmet capacity; it is not currently the direct F00 task output. | `apps/web/factoryos/core/research/DailySlateGenerator.ts` |
| **Research Passport** | A cryptographically signed evidence record containing external sources, claim classifications, unresolved issues, verification statuses, provenance, and integrity metadata. | `apps/web/factoryos/core/contracts/ResearchPassportContracts.ts` |

---

## 2. Structural & Topological Entities

| Term | Canonical Definition | Source File / Contract |
| :--- | :--- | :--- |
| **Floor** | A discrete physical transformation stage in the 8-stage production pipeline (Floors 00 through 07). | `apps/web/factoryos/core/hierarchy/FloorRegistry.ts` |
| **FloorRegistry** | The single authoritative singleton defining all 8 canonical floors, numbers, categories, and parallel branch relationships. | `apps/web/factoryos/core/hierarchy/FloorRegistry.ts` |
| **TimelineIR** | The compiler-agnostic intermediate representation (EDL) defining visual tracks, audio stems, word-level subtitle cues, and motion keyframes. | `apps/web/factoryos/core/timeline/TimelineIR.ts` |
| **RenderIntent** | The hardware-agnostic specification compiled from TimelineIR dispatched to the ComputeRouter for physical rendering. | `apps/web/factoryos/core/contracts/RenderIntentContracts.ts` |

---

## 3. Control, Authority & Safety Entities

| Term | Canonical Definition | Source File / Contract |
| :--- | :--- | :--- |
| **Overseer** | The Level 1 Supreme Control Plane authority responsible for factory goal decomposition, mission state monitoring, and lifecycle dispatch. | `apps/web/factoryos/core/overseer/OverseerControlPlane.ts` |
| **Guardian** | The Level 2 sovereign regulator governing pre-execution capability grants, safety policies, and lease authorizations. Never a floor. | `apps/web/factoryos/core/guardian/GuardianStateMachine.ts` |
| **Slayer** | The Level 2 enforcement engine responsible for monotonic lease revocation, zombie worker eviction, and GPU lock reclamation. | `apps/web/factoryos/core/slayers/SlayerEngine.ts` |
| **Healer** | The Level 2 recovery doctor managing circuit breakers, fallback providers, and bounded surgical repairs. | `apps/web/factoryos/core/healers/BoundedRepairEngine.ts` |
| **ReMaker** | The Level 1 asset reconstruction engine that surgically re-renders desynced audio/subtitles without re-running the entire 8-floor pipeline. | `apps/web/factoryos/core/remaker/` |
| **Fencing Token** | A strictly monotonically increasing integer assigned to a capability lease to guarantee out-of-order writes and split-brain executions are rejected. | `apps/web/factoryos/core/compute/contracts/ComputeContracts.ts` |

---

## 4. Verification & Diagnostic Entities

| Term | Canonical Definition | Source File / Contract |
| :--- | :--- | :--- |
| **Finding** | A structured, evidence-grounded defect record emitted by Floor 07 QA describing a rule violation, expected vs observed state, and supported repairs. | `apps/web/factoryos/core/verification/StructuredFindings.ts` |
| **Verification Receipt** | A cryptographically signed token certifying that an output artifact has satisfied all Floor 07 compliance gates and is eligible for publishing. | `apps/web/factoryos/core/verification/youtube/VerificationReceipt.ts` |
| **Case** | A formal anomaly or failure investigation record managed by the CaseManager, containing incident telemetry and forensic replays. | `apps/web/factoryos/core/cases/CaseManager.ts` |
| **Last-Known-Good** | The verified baseline state of an artifact or pipeline step preserved during repair operations to prevent corruption. | `apps/web/factoryos/core/healers/BoundedRepairEngine.ts` |
| **TraceContext** | The distributed context propagating correlation identifiers (`missionId`, `runId`, `agentId`, `skillId`, `toolId`, `traceId`) across all subsystem boundaries. | `apps/web/factoryos/core/observability/TraceContext.ts` |

## 5. Cognitive & Evolution Entities

| Term | Canonical Definition | Source File / Contract |
| :--- | :--- | :--- |
| **ShortForge Cognitive Layer (SCL)** | The cognitive substrate beneath the Overseer responsible for worker cognition, bounded decisions, context synthesis, template design, research interpretation, and learning candidates. It is not a sovereign authority. | `.okf/cognitive/README.md` |
| **ShortForge Cognitive Model** | The project-owned fine-tuned LLM used as the primary cognitive model for SCL. | `.okf/cognitive/README.md`, `.okf/intelligence/training.md` |
| **Worker Task Contract** | The compact typed cognitive package describing a worker's specialization, objective, inputs, constraints, allowed capabilities, success criteria, and verification criteria. | `.okf/cognitive/layer-contract.md` |
| **Research IR** | Structured intermediate representation connecting external evidence, claims, factory mappings, risks, decisions, and validation plans before architectural promotion. | `.okf/cognitive/devourer.md`, `.okf/research/` |
| **ArchitectureProposal** | Evidence-backed proposal for changing a factory capability, contract, workflow, worker behavior, or architecture. | `.okf/cognitive/devourer.md` |
| **Devourer** | Controlled self-improvement program that discovers external patterns, validates them, prepares training/evaluation candidates, and stages model or architecture improvements through gated promotion. | `.okf/cognitive/devourer.md` |


## 6. Governance & Engineering Stack Terms

| Term | Canonical Definition | Source |
| :--- | :--- | :--- |
| **Decision Sweep** | Mandatory end-to-end review of the current `.okf` corpus before non-trivial ShortForge decisions. | `.okf/decision-protocol.md` |
| **Worker Permission Profile** | Least-privilege capability, resource, data, network, filesystem, lease, and fencing constraints for a worker. | `.okf/security/worker-permissions.md` |
| **Production Helper** | Routine engineering evidence workspace for static scans, staging proofs, runtime traces, and forensic checks. | `.okf/production-helper.md`, `production-helper/` |
| **Core Engineering Stack** | TimelineIR + Remotion + AgentTube-derived scene lifecycle + RenderFabric/FFmpeg + F07 verification. | `.okf/engineering-stack.md` |
| **Scene Manifest** | Durable scene-level control/provenance record containing identity, timing, assets, provider evidence, rights, revision, and dependencies. | `.okf/engineering-stack.md`, AgentTube mapping |
| **Devourer** | Controlled self-improvement program that researches, prototypes, evaluates, canaries, and promotes improvements only through explicit gates. | `.okf/devourer.md` |


## 7. Engineering Workforce Terms

### Forger
A specialized development-time engineering agent optimized for a specific engineering concern. Forgers maintain FactoryOS through bounded branches, evidence, tests, reviews, and PRs. They are not F00-F07 production workers.

### Forger Assembly
The coordinated set of specialized Forgers. It routes engineering tasks to the smallest qualified specialist set and gathers their evidence before merge or architecture promotion.

### Forge Sentinel
The Security Forger responsible for Semgrep, Strix, ZAP, adversarial testing, and security evidence. It is not a security authority that can grant capabilities or waive FactoryOS controls.

### Engineering Evidence Pack
The structured development record attached to a non-trivial Forger task: .okf sweep status, repo mappings, changed files, tests, security evidence, benchmark evidence, blockers, implementation status, and rollback/rejection conditions.

### Forger Capability
A reserved development-time capability such as CAP_FORGE_CODE or CAP_FORGE_SECURITY. These do not automatically grant production-floor authority and are not implemented until registered and tested through the canonical permission process.


## Content Engine Configuration Terms

| Term | Canonical Definition | Source File / Contract |
| :--- | :--- | :--- |
| Engine Manifest | Versioned contract declaring what a Content Engine is, its configuration surface, production requirements, and verification boundaries. | .okf/content-engine-architecture.md; apps/web/content-engines/_loader/index.ts |
| ConfigurationSchema | Declarative engine-owned description of legal creator-facing controls, defaults, constraints, visibility, and bindings. | apps/web/lib/core/EngineConfigurationContracts.ts |
| ProductionSpec | Immutable mission-level configuration compiled from an engine manifest and creator intent; hash-bound for reproducibility. | apps/web/factoryos/core/contracts/ProductionSpecContracts.ts; apps/web/factoryos/core/engines/ProductionSpecCompiler.ts |
| Engine Contract Profile | Structured research, cognitive, creative, asset, voice, timeline, render, and verification requirements declared by an engine. | apps/web/lib/core/EngineConfigurationContracts.ts |
