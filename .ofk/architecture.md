# FactoryOS — Complete System Architecture & Topology

> **Status**: AUTHORITATIVE SPECIFICATION  
> **Source Module**: `apps/web/factoryos/core/`  

---

## 1. High-Level Subsystem Topology

FactoryOS employs an event-driven, actor-based architecture structured into distinct planes of execution:

```
                      ┌────────────────────────────────────────┐
                      │          OPERATOR / DASHBOARD          │
                      │  (Next.js App / Presence UI / API)     │
                      └───────────────────┬────────────────────┘
                                          │ HTTP / SSE / WS
                                          ▼
                      ┌────────────────────────────────────────┐
                      │     AUTONOMOUS FACTORY CONTROLLER      │
                      │  (`AutonomousFactoryController.ts`)    │
                      └───────┬────────────────────────┬───────┘
                              │                        │
               ┌──────────────┴──────────┐   ┌─────────┴──────────────┐
               │  OVERSEER CONTROL PLANE │   │   DURABLE EVENT BUS    │
               │ (`OverseerControlPlane`)│◄─►│  (`DurableEventBus`)   │
               └──────────────┬──────────┘   └─────────┬──────────────┘
                              │                        │
               ┌──────────────┴──────────┐   ┌─────────┴──────────────┐
               │    TASK DAG PLANNER     │   │  WORLD STATE ENGINE    │
               │   (`TaskDAGPlanner.ts`) │   │  (`WorldStateEngine`)  │
               └──────────────┬──────────┘   └─────────┬──────────────┘
                              │                        │
         ┌────────────────────┴────────────────────────┴────────────────────┐
         ▼                                                                  ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  SLAYER ENGINE   │  │  HEALER ENGINE   │  │  REMAKER ENGINE  │  │ GUARDIAN MANAGER │
│ (Investigation)  │  │   (Remediation)  │  │  (Reconstruction)│  │ (Floor Authority)│
└──────────────────┘  └──────────────────┘  └──────────────────┘  └─────────┬────────┘
                                                                            │
      ┌─────────────────────────────────────────────────────────────────────┴──────────┐
      ▼                                                                                ▼
┌────────────────────────────────────────┐                       ┌────────────────────────────────────────┐
│ FLOOR 01: Strategy & Topic Planning    │                       │ FLOOR 05: Timeline Composition         │
├────────────────────────────────────────┤                       ├────────────────────────────────────────┤
│ FLOOR 02: Script & Narrative Synthesis │                       │ FLOOR 06: Render Orchestration         │
├────────────────────────────────────────┤                       ├────────────────────────────────────────┤
│ FLOOR 03: Asset Realization & Prompts  │                       │ FLOOR 07: Media & Artifact Verify      │
├────────────────────────────────────────┤                       └────────────────────────────────────────┘
│ FLOOR 04: Media Synthesis & TTS        │
└────────────────────────────────────────┘
```

---

## 2. Core Subsystems

### 2.1 Autonomous Factory Controller (`AutonomousFactoryController.ts`)
The central kernel bootstrapper. Initializes:
- Storage repositories (`Disk`, `MongoDB`, or `InMemory`)
- Durable Event Bus (`DurableEventBus`)
- World State Engine with snapshot persistence (`WorldStateEngine`)
- Task Lease Management (`LeaseManager`) and Case Management (`CaseManager`)
- Mission lifecycle engine (`MissionManager`)
- Autonomous patrol loops and watchdog sweeps

### 2.2 Overseer Control Plane (`OverseerControlPlane.ts`)
The supreme operational intelligence:
- Receives user generation requests, system alerts, or scheduled maintenance missions.
- Evaluates goal context via `ThinkingController` (modes: `reflex`, `deliberate`, `deep`, `autonomous`).
- Generates a multi-floor Directed Acyclic Graph (`TaskDAG`) ensuring strict dependencies across stages.
- Dispatches execution across specialized floor workers while enforcing concurrency limits.
- Integrates with `OverseerPresenceEngine` for bidirectional live streaming of factory state to the frontend.

### 2.3 World State Engine (`WorldStateEngine.ts`)
The canonical in-memory state of the entire factory:
- Tracks status of all 7 floors (`floor01_strategy` through `floor07_compliance`).
- Maintains registry of active workers, health metrics, and heartbeats.
- Records active missions, DAG execution timelines, and unassigned work.
- Automatically persists snapshots to disk/database periodically and upon shutdown.

### 2.4 Durable Event Bus (`DurableEventBus.ts`)
The asynchronous nervous system:
- High-throughput pub/sub mechanism decoupling control decisions from physical execution.
- Retains bounded in-memory event audit logs with correlation IDs for forensic tracing.
- Dispatches system-wide alerts: `MISSION_CREATED`, `TASK_STARTED`, `TASK_COMPLETED`, `GUARDIAN_REPORT`, `SLAYER_ALERT`, `RUN_COMPLETED`.

---

## 3. Storage & Persistence Topologies

FactoryOS supports 3 distinct storage configurations selected via `storageType`:
1. **`disk`**: Zero-dependency filesystem JSON storage located at `apps/web/data/factoryos/`. Ideal for single-node deployments and offline development.
2. **`mongo`**: Enterprise distributed persistence utilizing MongoDB collections (`missions`, `cases`, `task_dags`, `leases`, `memories`, `world_state`). Ideal for multi-replica production clusters.
3. **`memory`**: Ephemeral, ultra-fast test harness storage used during Vitest CI/CD verification runs.
