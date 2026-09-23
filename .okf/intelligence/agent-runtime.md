# Agent Runtime Layer Specification

> **Document Class**: Agent Execution & Supervision Infrastructure  
> **Status**: AUTHORITATIVE & IMPLEMENTATION-GROUNDED  
> **Source of Truth**: `apps/web/factoryos/core/agent/AgentRuntime.ts` & `apps/web/factoryos/core/agent/AgentRuntimeContracts.ts`  

---

## 1. Overview & Clean-Room Pattern Assimilation

The **Agent Runtime Layer** provides the execution harness, session lifecycle, budget enforcement, and capability gating for all autonomous agents operating across FactoryOS. It incorporates clean-room patterns from:
- **TencentCloud/Octop**: Unified agent workspace harness and persistent state reconstruction.
- **Tencent/WeKnora**: Sandboxed tool invocation and scoped capability access.
- **stablyai/orca**: Agent session lifecycle, periodic state checkpointing, and execution supervision.

```
                      OVERSEER SUPREME CONTROL PLANE
                                     │
                                     ▼
                        AGENT RUNTIME HARNESS
                                     │
     ┌───────────────────────────────┼───────────────────────────────┐
     ▼                               ▼                               ▼
AgentSession Lifecycle     ExecutionBudget Bounds         Capability Gate
(INIT -> ACTIVE -> TERM)   (Timeout, Tokens, Leases)      (Guardian Pre-Authorization)
     │                               │                               │
     └───────────────────────────────┼───────────────────────────────┘
                                     │
                                     ▼
                       ISOLATED TASK EXECUTION
                                     │
                                     ▼
                       DETERMINISTIC CHECKPOINT
                     (chk_sess_step_timestamp)
```

---

## 2. Decoupled Hierarchy: Control vs. Runtime vs. Floor Agents

The architecture enforces strict separation between control authorities, the execution harness, and floor worker agents:

| Tier | Role / Entity | Type | Responsibility |
| :--- | :--- | :---: | :--- |
| **Level 0** | Human Operator | Sovereign Authority | Root approvals, manual policy overrides, kill-switch. |
| **Level 1** | Overseer Control Plane | Sovereign Authority | Factory-wide goal decomposition, mission lifecycle dispatch. |
| **Level 2** | Guardian / Slayer / Healer | Sovereign Regulator | Policy gates, lease revocation, circuit breaking. |
| **Runtime** | Agent Runtime Harness | Infrastructure | Session budgets, timeouts, checkpoints, trace propagation. |
| **Level 3** | Floor Workers (F00–F07) | Execution Agents | Task execution within assigned floor capabilities under lease. |

---

## 3. Session Checkpointing & Resumability

To prevent restarting long multi-floor missions from scratch after transient network dropouts, the `AgentRuntime` implements deterministic checkpointing:
- **Checkpoints**: At each major reasoning beat, the runtime records an immutable `AgentSessionCheckpoint` containing step index, state snapshot, and timestamp.
- **Resumability**: An interrupted agent session can be re-instantiated from its latest valid checkpoint without re-running completed sub-tasks.

---

## 4. Current Implementation vs. Target Architecture

| Capability | Current Status | Code Location | Target Architecture |
| :--- | :---: | :--- | :--- |
| **Agent Runtime Harness** | **IMPLEMENTED** | `apps/web/factoryos/core/agent/AgentRuntime.ts` | Session management, budget timeout racing, capability checks. |
| **Agent Contracts** | **IMPLEMENTED** | `apps/web/factoryos/core/agent/AgentRuntimeContracts.ts` | Typed identities, authority levels, execution budgets. |
| **Session Checkpointing** | **IMPLEMENTED** | `apps/web/factoryos/core/agent/AgentRuntime.ts` | Snapshot preservation supporting state reconstruction. |
| **TraceContext Binding** | **IMPLEMENTED** | `apps/web/factoryos/core/observability/TraceContext.ts` | End-to-end trace correlation across all agent tasks. |
| **Multi-Agent Intercom** | **PLANNED** | — | Direct peer-to-peer agent negotiation protocol. |
