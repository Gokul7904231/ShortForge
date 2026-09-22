# FACTORYOS HIERARCHY & BOUNDARY SPECIFICATION

## 1. System Hierarchy

```text
Level 0: USER / API GATEWAY
Level 1: FACTORYOS KERNEL & CONTROL PLANE
         • AutonomousFactoryController
         • OverseerControlPlane
         • MissionStateMachine
         • MissionManager / CaseManager / LeaseManager
Level 2: GOVERNANCE & SAFETY
         • Kernel Guardian (Authoritative Policy & Risk Gate)
         • CapabilityRegistry (Slayers, Healers, Instructor)
Level 3: ORCHESTRATION DAG & FLOORS
         • TaskDAGPlanner / TaskDAGExecutor
         • PythonFloorBridge
         • Floor 01 → Floor 02 → Floor 03 → Floor 04 → Floor 05 → Floor 06
Level 4: EXECUTION WORKERS
         • Azure VM Plane (FastAPI render worker, FFmpeg, edge-tts)
         • Local / Python Microservice workers
Level 5: OBSERVABILITY & PROJECTIONS
         • DurableEventBus (State-change event stream)
         • FactoryProjectionService (Read models for UI / SSE)
```

---

## 2. Component Boundaries & Anti-Patterns

### Anti-Patterns to Prevent:
1. **Floor-to-Agent Tight Coupling**: A Floor must not directly invoke Slayers or Healers. All anomalies bubble to the Overseer, which queries `CapabilityRegistry`.
2. **Direct DB Mutation by Floors**: Python floor workers update their execution return payloads; they never mutate global user quotas, provider keys, or mission states directly.
3. **UI Reading EventBus Internals**: UI subscribes only to `FactoryProjectionService` projections via `/api/factory-state` and SSE.
