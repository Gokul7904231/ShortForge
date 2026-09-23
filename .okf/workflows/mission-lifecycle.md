# Workflows: Mission Lifecycle & Workspace Architecture

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/overseer/` & `apps/web/factoryos/core/agent/`

---

## 1. Architectural Philosophy: The Autonomous Mission Unit

In FactoryOS, all end-to-end production runs are encapsulated within a discrete, state-tracked **Mission**. A Mission represents a complete, sovereign objective (such as producing a verified daily short from a scheduled topic).

Incorporating clean-room workspace and session patterns inspired by modern agentic architectures, FactoryOS missions guarantee:
1. **Workspace Sandboxing**: Every mission operates within an isolated working directory with dedicated scratch buffers and artifact registries.
2. **Explicit Lifecycle States**: Missions transition through deterministic states governed by the Overseer control plane.
3. **Resumability from Checkpoints**: If an agent crashes or a network connection drops, the mission resumes from the last validated floor checkpoint without re-running completed floors.
4. **Hierarchical Subagent Delegation**: Floor specialists can spawn bounded child sessions to execute subtasks (e.g., parallel image prompt generation) under explicit parent capability bounds.

```
┌────────────────────────────────────────────────────────┐
│                        PENDING                         │
└───────────────────────────┬────────────────────────────┘
                            │ Overseer Dispatches
                            ▼
┌────────────────────────────────────────────────────────┐
│                        RUNNING                         │
│   ├── F00 Analyst ──────> F01 Strategy ─────> F02 Script│
│   │                                                    │
│   │                  ┌──> F03 Asset Realization ─┐     │
│   │                  │                           │     │
│   │                  └──> F04 Media Synthesis ───┴──>  │
│   │                                                    │
│   └── F05 Timeline ─────> F06 Rendering ───> F07 QA    │
└───────────────┬───────────────────────────┬────────────┘
                │ Failure / Anomaly          │ Verification Pass
                ▼                           ▼
┌───────────────────────────┐   ┌────────────────────────┐
│          REPAIR           │   │       COMPLETED        │
│   (Bounded Healer Loop)   │   └────────────────────────┘
└───────────────┬───────────┘
                │ Exhausted Budget / Slayer Kill
                ▼
┌───────────────────────────┐
│      FAILED / ABORTED     │
└───────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Mission State Machine** | Explicit state transitions managed by `Overseer` control plane | Distributed persistent saga orchestrator with event-sourced event store |
| **Workspace Sandboxing** | Isolated workspace directory per mission in scratch storage | Containerized ephemeral filesystem / isolated volume mount per mission |
| **Checkpoint & Resume** | `AgentCheckpoint` capturing floor state and artifact manifests | Block-level snapshotting with instant point-in-time state hydration |
| **Subagent Hierarchy** | Parent-child session linkage via `TraceContext` and `AgentRuntime` | Dynamic multi-agent swarm orchestration with automated peer consensus |
| **Killswitch Handling** | Slayer immediate abort signal listener halting all active tasks | Distributed hardware watchdog with automated graceful drain & resource cleanup |

---

## 3. Mission States & Transition Invariants

| State | Allowed Transitions | Invariants & Triggers |
|:------|:--------------------|:----------------------|
| **PENDING** | `RUNNING`, `ABORTED` | Created by `AutonomousScheduler` or manual operator request; awaiting worker resources. |
| **RUNNING** | `REPAIR`, `COMPLETED`, `FAILED`, `ABORTED` | Actively executing tasks across the canonical 8-floor DAG. |
| **REPAIR** | `RUNNING`, `FAILED`, `ABORTED` | Floor 07 emitted findings; Healer is executing bounded repairs against last-known-good state. |
| **COMPLETED** | Terminal | All 8 floors executed successfully; Floor 07 verification passed with 0 critical/high findings. |
| **FAILED** | Terminal | Unrecoverable error encountered or Healer repair budget exhausted. |
| **ABORTED** | Terminal | Explicitly terminated by operator or Slayer emergency killswitch. |

---

## 4. Workspace Isolation Invariant

- Every mission is assigned a unique `missionId` (UUID v4).
- All intermediate temporary files (raw audio chunks, frame buffers, intermediate EDL JSONs) are written exclusively inside the mission's scratch directory:
  $$\text{scratch/missions/}\{\text{missionId}\}/$$
- Long-term artifacts are persisted only when promoted to the central content-addressed store (CAS) accompanied by cryptographic sha256 digests.
