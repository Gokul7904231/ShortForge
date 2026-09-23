# Hierarchy: The Overseer (`OverseerControlPlane.ts`)

> **Tier**: Supreme Operational Authority (Level 0)  
> **Instance Count**: Exactly ONE per Factory Cluster  
> **Source Location**: `apps/web/factoryos/core/overseer/OverseerControlPlane.ts` & `apps/web/factoryos/core/overseer/TaskDAGPlanner.ts`

---

## 1. Architectural Philosophy: The Sovereign Orchestration Authority

The **Overseer** is the supreme operational control plane of FactoryOS. It is the sole authority responsible for accepting mission dispatches from the `AutonomousScheduler`, synthesizing the execution plan, coordinating floor specialists, managing cluster state, and guaranteeing end-to-end execution integrity.

Crucially, the Overseer delegates specialized regulatory powers to peer sovereign authorities while retaining overall pipeline command:
- **Overseer** $\longrightarrow$ Floor orchestration, task DAG scheduling, state lifecycle.
- **Guardian** $\longrightarrow$ Sovereign policy, capability gating, and boundary enforcement.
- **Slayer** $\longrightarrow$ Circuit breaking, watchdog timeouts, and emergency killswitches.
- **Healer** $\longrightarrow$ Bounded self-healing, state reconciliation, and LKG rollback.

```
┌────────────────────────────────────────────────────────┐
│                        Overseer                        │
│                (Supreme Control Plane)                 │
├───────────────────────────┬────────────────────────────┤
│  AutonomousScheduler      │ Canonical 8-Floor DAG      │
│  (Intake & Quotas)        │ (F00->F01->F02->F03||F04..)│
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼ Sovereign Delegation      ▼ Production Workers
┌───────────────────────────┐   ┌────────────────────────┐
│  Guardian (Policy Gate)   │   │  F00 Market Analyst    │
│  Slayer (Killswitch)      │   │  F01 Strategy          │
│  Healer (Bounded Repair)  │   │  F02 Scripting         │
│  Auditor (Compliance)     │   │  F03-F06 Realization   │
│  Remaker (Evolution)      │   │  F07 QA Verification   │
└───────────────────────────┘   └────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Pipeline DAG Model** | Canonical 8-floor DAG (`createEightFloorProductionDAG` with parallel F03/F04) | Dynamic sub-DAG generation supporting multi-format and interactive branching |
| **Scheduler Intake** | Single intake path: `AutonomousScheduler` -> `ScheduleInstance` -> `Mission` | Distributed priority queue with speculative multi-mission pre-planning |
| **State Persistence** | SQLite / in-memory store in `FactoryStateService.ts` | Multi-region distributed state store with Paxos/Raft consistency |
| **Telemetry Streaming** | Server-Sent Events (SSE) via `OverseerPresenceEngine` | Real-time bi-directional WebSockets with interactive human steering |
| **Authority Separation**| Clean separation of Overseer, Guardian, Slayer, Healer | Formally verified actor supervision trees with immutable boundary contracts |

---

## 3. Core Operational Responsibilities

1. **Mission Intake**: Ingests `ScheduleInstance` records from the `AutonomousScheduler` and initializes mission context.
2. **DAG Compilation**: Compiles the canonical 8-floor production DAG from `FloorRegistry.ts`:
   $$\text{F00} \rightarrow \text{F01} \rightarrow \text{F02} \rightarrow (\text{F03} \parallel \text{F04}) \rightarrow \text{F05} \rightarrow \text{F06} \rightarrow \text{F07}$$
3. **Execution Gating**: Submits task execution requests through the **Guardian** pre-execution gates before dispatching to worker pools.
4. **Presence Telemetry**: Streams live thought traces, floor transitions, and resource consumption to the frontend via `OverseerPresenceEngine`.
5. **Decision Ledger Audit**: Maintains an append-only cryptographic ledger of all orchestrator decisions.
