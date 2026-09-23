# Intelligence: Execution Strategy & Adaptive Thinking Modes

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/cognitive/ThinkingController.ts` & `apps/web/factoryos/core/overseer/TaskDAGPlanner.ts`

---

## 1. Architectural Philosophy: Calibrated Cognitive Effort

Not every operation in an autonomous video factory requires deep generative reasoning. Calling an expensive, high-latency LLM to verify an artifact hash or query worker status wastes latency and tokens. Conversely, attempting to synthesize an entire viral narrative hook using a rigid reflex rule engine yields generic, low-retention content.

FactoryOS employs an **Adaptive Cognitive Strategy Controller** that dynamically shifts between four execution regimes based on mission criticality, operational health, and task domain:
1. **REFLEX**: Zero-reasoning, deterministic, ultra-low latency (< 100ms).
2. **DELIBERATE**: Standard multi-floor workflow orchestration (100ms – 1s).
3. **DEEP**: Multi-step generative planning, debate, and heuristic analysis (1s – 5s).
4. **AUTONOMOUS**: Continuous supervisory monitoring, anomaly triage, and bounded self-healing.

```
┌────────────────────────────────────────────────────────┐
│                   Incoming Work Request                │
└───────────────────────────┬────────────────────────────┘
                            │ Cognitive Router
                            ▼
┌───────────────────┬───────────────────┬────────────────┐
│   REFLEX MODE     │  DELIBERATE MODE  │   DEEP MODE    │
│  Deterministic    │  8-Floor DAG Plan │  Novel Topics  │
│  State, Hashes,   │  F00->F01->F02    │  Market Trend  │
│  Heartbeat Sweeps │  F03||F04->F05..  │  Debate & QA   │
│  (< 100ms)        │  (100ms - 1s)     │  (1s - 5s)     │
└───────────────────┴───────────────────┴────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                     AUTONOMOUS                         │
│     Continuous Watchdog, Health Checks, Healer Loop    │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Pipeline DAG Model** | Canonical 8-floor production DAG (`F00` to `F07` with `F03 || F04`) | Dynamic runtime sub-DAG branching based on content genre and platform |
| **Cognitive Calibration** | Deterministic mode switching based on task classification in `ThinkingController.ts` | Reinforcement-learned budget allocator optimizing cost-per-minute vs viewer retention |
| **Deliberate Planning** | Strongly typed DAG generation in `TaskDAGPlanner.ts` | Monte Carlo tree search over alternative script structures |
| **Autonomous Supervisory**| Periodic status polling and watchdog checks in Overseer | Event-driven reactive actor supervision with Erlang-style supervision trees |

---

## 3. Cognitive Modes Breakdown

### 1. REFLEX Mode (< 100ms)
- **Scope**: Status queries, health checks, hash validation, CAS lookups, heartbeat recording.
- **Engine**: Direct deterministic code execution, SQLite / memory lookups. No LLM invocation.

### 2. DELIBERATE Mode (100ms – 1s)
- **Scope**: Canonical production pipeline execution.
- **Workflow**:
  - Instantiates the canonical 8-floor production DAG:
    $$\text{F00} \rightarrow \text{F01} \rightarrow \text{F02} \rightarrow (\text{F03} \parallel \text{F04}) \rightarrow \text{F05} \rightarrow \text{F06} \rightarrow \text{F07}$$
  - Coordinates task dispatch across worker pools.
  - Enforces schema and capability gates between floor boundaries.

### 3. DEEP Mode (1s – 5s)
- **Scope**: High-uncertainty synthesis tasks:
  - Floor 00 trend anomaly analysis and saturation prediction.
  - Floor 01 narrative hook exploration and persona matching.
  - Floor 07 contradiction and factual support verification.
- **Engine**: Multi-model reasoning chains, structured JSON extraction, and validation oracles.

### 4. AUTONOMOUS Mode (Continuous Loop)
- **Scope**: Continuous supervisory health management.
- **Responsibilities**:
  - Background schedule triggering (`AutonomousScheduler`).
  - Worker lease expiration sweeps and zombie task reclamation.
  - Floor 07 Finding ingestion and dispatching to `BoundedRepairEngine` (Healer).
  - Slayer emergency killswitch monitoring.
