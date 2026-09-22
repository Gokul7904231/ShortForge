# SHORTFORGE / FACTORYOS — CURRENT RUNTIME ARCHITECTURE INVENTORY

> **Status**: Historical / Superseded  
> **Canonical Replacement**: [`docs/architecture/current.md`](../../architecture/current.md)  
> **Note**: This document preserves the early inventory of discrepancies identified during the initial transition audit.

---

## 1. Executive Summary
This document captures the inventory of the existing runtime paths, dual architectures, and structural discrepancies identified during the architecture audit.

---

## 2. Identified Discrepancies & Flaws

### Flaw 1: Disconnected Production Path
- **Live Path**: `POST /api/generate-video` → quota reservation → `scriptAgent` → Azure FastAPI (`BASIC_RENDER_API_URL`) → Cloudinary → callback.
- **FactoryOS Path**: `AutonomousFactoryController` → `OverseerControlPlane` → mock task nodes (`FLOOR_SCRIPTING`, `FLOOR_AUDIO`, `FLOOR_RENDERING`).
- **Impact**: FactoryOS was not the actual production execution engine; the 6-floor DAG was executed in simulation/tests rather than on the production video generation path.

### Flaw 2: Under-Wired PythonFloorBridge
- `apps/web/factoryos/core/bridge/PythonFloorBridge.ts` only logged floor status and created unhandled cases upon failure.
- It lacked transport authentication, cryptographic execution tokens, replay prevention, and atomic state transition enforcement.

### Flaw 3: Dual Guardian Ambiguity
- Two distinct Guardian implementations existed:
  - TypeScript Kernel: `apps/web/factoryos/core/guardian`
  - Python Floor: `services/pipeline/guardian`
- Clear hierarchy was missing: the Python side should act as an `ExecutionInvariantValidator` / `FloorComplianceValidator` reporting certificates to the authoritative TypeScript `GuardianKernel`.

### Flaw 4: Mocked Telemetry in Lobby & Observability
- `/api/factory-state` and `/api/factory-state/sse` blended mock OS stats and mock events instead of projecting live state from `WorldStateEngine`, `DurableEventBus`, and `MissionManager`.

### Flaw 5: Conceptual Instructor Subsystem
- Architecture diagrams referenced "Instructor", but no concrete bounded subsystem existed in the TypeScript kernel.

---

## 3. Transition Strategy: Shadow Mode to Full Authority

1. **Phase 1 (Inventory & Contracts)**: Define typed contracts and state machines.
2. **Phase 2 (Shadow Mode)**: FactoryOS observes production jobs, validates DAG feasibility, and checks Guardian rules without duplicate rendering.
3. **Phase 3 (Unified Execution Authority)**: FactoryOS becomes the single authoritative orchestrator, dispatching Floor 06 to the Azure VM rendering plane.
