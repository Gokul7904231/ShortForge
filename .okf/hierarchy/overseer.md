# Hierarchy: Overseer

**Status:** AUTHORITATIVE ARCHITECTURAL SUMMARY / IMPLEMENTATION-GROUNDED  
**Level:** 1 — Factory Supreme Control Plane, beneath Human Authority  
**Canonical implementation:** `apps/web/factoryos/core/overseer/OverseerControlPlane.ts`  
**Planning implementation:** `apps/web/factoryos/core/overseer/TaskDAGPlanner.ts`  
**Detailed operating contract:** [`./overseer-operational-contract.md`](./overseer-operational-contract.md)

---

## 1. Simple definition

**Overseer is the factory commander.**

It receives missions and commands, reads factory state, decides what work is needed, builds the work plan, dispatches work, monitors execution, coordinates recovery, and drives the system toward independently verified completion.

Human Authority remains above Overseer.

---

## 2. Authority position

    HUMAN AUTHORITY
          |
          v
       OVERSEER
          |
    +-----+------+----------------+
    |            |                |
 Guardian      Slayer           Healer
 policy        enforcement      recovery
    |            |                |
    +------------+----------------+
                 |
           Worker / Floor Fleet
                 |
                F07
             verification

Rules:

- Overseer owns factory-wide orchestration.
- Guardian owns capability/policy authorization.
- Slayer owns enforcement and lease revocation.
- Healer owns bounded recovery.
- Workers own bounded task execution.
- F07 owns independent media verification/release truth.
- Ascalon/SCL supplies cognition; it does not become authority.

---

## 3. What Overseer does today

| Capability | Current status |
|---|---|
| Natural-language command intake | IMPLEMENTED |
| Mission creation/start/dispatch | IMPLEMENTED |
| Mission resume after recovery | IMPLEMENTED |
| 8-floor DAG generation | IMPLEMENTED |
| F03/F04 parallelization | IMPLEMENTED |
| Floor task execution adapters | IMPLEMENTED |
| WorldState monitoring | IMPLEMENTED |
| Periodic supervision | IMPLEMENTED |
| Event-driven anomaly/case response | IMPLEMENTED |
| Cognitive incident evaluation | IMPLEMENTED |
| REFLEX / DELIBERATE / DEEP reasoning selection | IMPLEMENTED |
| DecisionLedger recording | IMPLEMENTED |
| Healer dispatch coordination | IMPLEMENTED |
| Validator/F07 handoff | IMPLEMENTED |
| RenderFabric physical rendering dispatch | IMPLEMENTED |
| Production trajectory collection | IMPLEMENTED |
| Mission budget/lifecycle control | IMPLEMENTED in MissionManager |
| CapabilityRouter | PRESENT / IMPLEMENTED COMPONENT |
| Direct per-task Guardian capability gate | PARTIAL |
| Lease/fencing on Overseer-created TaskDAGExecutor | PARTIAL |
| Semantic intent → dynamic sub-DAG planning | NOT YET |
| Pure worker-owned floor execution | NOT YET |

---

## 4. When Overseer activates

Overseer activates when the FactoryOS runtime starts its autonomous swarm, when a mission is dispatched, or when its active supervision loop receives relevant events.

Current activation sources include:

- FactoryOS startup;
- operational command submission;
- mission dispatch;
- `ANOMALY_DETECTED`;
- `CASE_CREATED`;
- `MISSION_STARTED`;
- active-mission boot recovery.

---

## 5. How Overseer works

    OBSERVE
       ↓
    ASSESS
       ↓
    PLAN
       ↓
    AUTHORIZE THROUGH GOVERNANCE BOUNDARIES
       ↓
    DISPATCH
       ↓
    MONITOR
       ↓
    VERIFY
       ↓
    COMPLETE / REPLAN / RECOVER / ESCALATE
       ↓
    LEARN

Current implementation details:

1. Read WorldState.
2. Assess reasoning mode with OverseerThinkingController.
3. Run typed DecisionEngine evaluation.
4. Record the decision.
5. Generate TaskNodes.
6. Build the DAG.
7. Attach it to the mission.
8. Dispatch floor executors.
9. Monitor task/case state.
10. Use Healer/Slayer/Validator boundaries as required.
11. Publish run and trajectory evidence.
12. Complete the mission only through MissionManager completion evaluation.

---

## 6. Current command boundary

A command is **not** the same thing as authorization.

    COMMAND
       |
    Overseer
       |
    CAPABILITY / POLICY CHECK
       |
    Guardian
       |
    LEASE / RUNTIME
       |
    Worker
       |
    PHYSICAL RESULT
       |
    F07 VERIFICATION

The application operator surface is protected by the application authentication/middleware boundary. Internal FactoryOS operator routes require authenticated administrator/owner access.

---

## 7. What Overseer hands off

| Destination | Overseer handoff |
|---|---|
| MissionManager | mission lifecycle, task linkage, progress, completion |
| Guardian | protected capability authorization / policy gate |
| Slayer | anomaly enforcement, worker/lease containment |
| Healer | bounded recovery and repair |
| Floor workers | typed task work and dependencies |
| F07 | produced media for independent verification |
| Learning pipeline | verified production trajectory evidence |

---

## 8. What Overseer must never own

- self-issued capabilities;
- policy bypass;
- fencing-token mutation;
- unrestricted worker killing;
- unlimited repair;
- self-verification;
- silent model promotion;
- unrestricted production-policy changes;
- external MCP sovereignty;
- unverified artifact truth.

---

## 9. Current gaps to close

### Gap 1 — Workerization

`OverseerControlPlane.ts` currently contains substantial floor execution logic in `getTaskExecutorsForFloors()`.

Target:

    Overseer
       |
    WorkerTaskContract
       |
    Agent Runtime
       |
    Specialized Worker

Overseer should decide **what / why / where / who / authority / stop condition**.

Workers should implement **how**.

### Gap 2 — Lease/fencing

`TaskDAGExecutor` supports `LeaseManager`, but the current Overseer constructor does not inject the canonical LeaseManager.

Target: every protected task must be lease/fencing enforced at runtime.

### Gap 3 — Semantic planning

Current `generateTaskNodesForGoal()` is partly keyword-driven.

Target: typed semantic mission planning should select the smallest valid sub-DAG from mission intent, constraints, capabilities, resources, and current state.

### Gap 4 — Per-task authorization

Current architecture documents Guardian as the authorization boundary, but direct per-task runtime enforcement from Overseer into every floor executor remains incomplete.

Target: no protected worker action executes without an explicit capability/grant/scope/lease contract.

---

## 10. Final rule

> **Overseer is the commander, not the worker.**

It coordinates the factory.

Guardian authorizes.

Slayer enforces.

Healer repairs.

Workers execute.

F07 verifies.

Human Authority remains above the system.
