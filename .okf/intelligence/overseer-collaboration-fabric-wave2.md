# Overseer Collaboration & Work Fabric — Wave 2

**Status:** IMPLEMENTED ON FEATURE BRANCH
**Scope:** Durable mission work management inside the existing Overseer Dashboard.

## Product outcome

Wave 2 turns the Wave 1 Mission Room work view into an operator-grade durable Kanban surface.

The board now models:
- TODO / READY / RUNNING / BLOCKED / REVIEW / DONE / FAILED / ARCHIVED;
- explicit task dependencies and automatic READY promotion;
- named worker ownership and worker lanes;
- bounded retries and a consecutive-failure circuit breaker;
- worker leases and heartbeats;
- review / request-changes / rework loops;
- durable task attempts and lifecycle events;
- expired-lease reclamation through the existing FactoryWatchdog;
- idempotent task creation;
- distributed worker claim / heartbeat / completion ingress.

## Authority model

The work board is a durable coordination layer, not an execution authority.

```
Human
  ↓
Overseer Dashboard / Mission Room
  ↓
MissionTask work state
  ↓
Overseer / FGC
  ↓
AEF / TaskDAG / Compute / MCP
  ↓
F00 … F07
  ↓
F07 truth
```

Changing a board card does not directly invoke a provider, MCP server, render worker, or floor mutation.

## Canonical state separation

- Mission = end-to-end mission lifecycle and budget.
- MissionTask.workState = human/agent work lifecycle.
- TaskDAG/TaskNode = execution graph state.
- TaskLease = worker ownership and fencing.
- MissionTask.workEvents / attempts = durable handoff and task history.
- F07 remains independent production truth.

DAG execution events are projected into matching MissionTasks by mission/task identity, so the board can reflect real execution without making the board the executor.

## Distributed worker contract

Workers use the authenticated internal endpoint:

`POST /api/overseer/missions/:missionId/work/agent`

Headers:
- `x-factoryos-agent-token`
- `x-factoryos-agent-id`

Supported actions:
- `claim`
- `heartbeat`
- `request_review`
- `complete`
- `fail`

The browser/operator endpoint is separately permissioned for room members with EDITOR/ADMIN/OWNER mutation access.

## Failure semantics

1. A task can be claimed only when dependencies are satisfied and the circuit is closed.
2. Claim failure never executes the worker.
3. Long-running DAG workers heartbeat their leases every 20 seconds against a 60 second lease.
4. An expired lease causes durable task reclamation; retry remains bounded.
5. Three consecutive failures open the circuit breaker.
6. Review-gated work cannot become DONE without a review transition.
7. Requesting changes returns the task to READY without pretending the prior attempt completed.
8. DONE and FAILED tasks can be ARCHIVED.
9. Repeated task creation with the same idempotency key returns the existing task.

## Wave 2 acceptance checklist

- [x] Durable MissionTask work-state contract
- [x] Dependency-aware READY promotion
- [x] Worker lease acquisition enforced by TaskDAG executor
- [x] Worker lease heartbeat for long-running DAG tasks
- [x] Review and rework lifecycle
- [x] Bounded retries and circuit breaker
- [x] Durable attempts and task event history
- [x] Watchdog-driven expired work reclamation
- [x] Event projection from TaskDAG into MissionTask
- [x] Operator-grade Kanban UI in Mission Room
- [x] Authenticated distributed worker ingress
- [x] Existing emotional Overseer presence remains the primary Dashboard identity