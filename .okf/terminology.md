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
| **Daily Content Slate** | The structured research output produced by Floor 00 containing deduplicated, validated topic candidates and explicit unmet capacity. | `apps/web/factoryos/core/research/DailySlateGenerator.ts` |
| **Research Passport** | A cryptographically signed record containing verified external sources, extracted claims, verification statuses, and integrity digests. | `apps/web/factoryos/core/contracts/ResearchPassportContracts.ts` |

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
