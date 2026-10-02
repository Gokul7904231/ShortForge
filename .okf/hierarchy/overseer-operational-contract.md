# Overseer — Operational Contract

**Status:** AUTHORITATIVE / CURRENT IMPLEMENTATION MAPPING + TARGET OPERATING CONTRACT  
**Date:** 2026-10-02  
**Canonical implementation:** apps/web/factoryos/core/overseer/OverseerControlPlane.ts  
**Related:** .okf/hierarchy/overseer.md, .okf/hierarchy-map.md, .okf/security/worker-permissions.md

---

## 1. What is the Overseer?

**Simple answer:** Overseer is the factory-wide commander.

It receives a mission or operational command, understands the current factory state, creates or updates the work plan, sends work to the right execution boundaries, watches the system, reacts to failures, and drives the mission toward a verified end state.

The Overseer is **Level 1** in the control hierarchy:

    LEVEL 0 — HUMAN AUTHORITY
            |
            v
    LEVEL 1 — OVERSEER
            |
            +---- Guardian
            +---- Slayer
            +---- Healer
            +---- Worker Fleet / Floors
            +---- Mission / DAG / Runtime coordination

Human Authority remains above Overseer. Guardian remains the capability/policy gate. Slayer remains enforcement. Healer remains bounded recovery. F07 remains independent verification.

---

## 2. Why does Overseer exist?

Without Overseer, ShortForge has individual floors, workers, tools and safety systems but no single factory-wide coordinator.

Overseer exists to:

- turn a goal into executable work;
- keep the eight-floor pipeline coordinated;
- maintain mission lifecycle;
- decide how much reasoning is needed;
- dispatch work across floors;
- observe factory health;
- react to incidents and open cases;
- coordinate recovery through Healer;
- coordinate emergency enforcement through Slayer;
- keep an auditable decision history;
- return completed artifacts/results into independent verification;
- collect verified execution outcomes for future learning.

---

## 3. Who commands Overseer?

### Human Authority

Human is the highest authority.

Human can:
- start or stop the factory;
- issue operational commands;
- cancel or stop missions;
- impose exceptional policy or administrative actions;
- approve actions that require human approval;
- use explicitly privileged administrative paths.

### System-level command sources

The current implementation can also receive work from:
- AutonomousFactoryController;
- MissionManager;
- schedule/autonomous flows;
- authenticated Overseer API/operator surfaces;
- internal event-driven supervision.

The application middleware protects the internal FactoryOS operator surface. Current route rules require authenticated administrator/owner access for internal operator routes.

### What does not command Overseer?

No floor worker, ordinary model output, MCP server, renderer, Slayer, Healer, or external provider becomes the sovereign commander merely because it can send data or a recommendation.

---

## 4. Who can authorize Overseer to work?

This needs a precise distinction.

### Mission authority

Human or an authorized system workflow can create/start a mission.

MissionManager owns mission lifecycle state and controlled transitions.

### Capability authority

Overseer does **not** mint its own safety capabilities.

Protected execution is governed by capability policy and Guardian boundaries.

    Overseer:
        "Do this task."

    Guardian:
        "This capability is / is not allowed."

    Lease / runtime:
        "This worker may / may not execute now."

    Worker:
        Executes.

    F07:
        Verifies the resulting artifact.

### Practical rule

**Overseer commands work. Guardian authorizes protected capability use. Lease/fencing authorizes the current execution holder.**

These are different permissions and must remain different.

---

## 5. Where can Overseer work?

Overseer is factory-wide.

Current production topology:

    F00 Research
       |
    F01 Strategy
       |
    F02 Scripting
       |
    +--+----------------+
    |                   |
    F03                 F04
    Asset               Media
    Realization         Synthesis
    |                   |
    +---------+---------+
              |
             F05
          Timeline
              |
             F06
          Rendering
              |
             F07
          Verification

It also operates over:
- missions;
- task DAGs;
- cases;
- world state;
- decision ledger;
- cognitive runtime;
- memory/context;
- presence/telemetry;
- worker orchestration;
- rendering orchestration;
- recovery coordination;
- production trajectory collection.

### Where it must NOT become sovereign

Overseer must not replace:
- Guardian policy authority;
- Slayer emergency enforcement;
- Healer bounded repair authority;
- F07 verification authority;
- human-only approval;
- worker-local execution responsibility.

---

## 6. When does Overseer activate?

### Factory startup

AutonomousFactoryController.start() starts:
- Guardian;
- Slayer;
- Overseer supervisor;
- Watchdog;
- Overseer presence;
- the continuous autonomous control loop.

### Command activation

OverseerControlPlane.submitCommand() accepts an operational command, creates a run and, when MissionManager is available, a mission.

### Mission activation

dispatchMission() starts execution for an existing mission.

### Event activation

The current Overseer reacts to:
- ANOMALY_DETECTED;
- CASE_CREATED;
- MISSION_STARTED;
- RUN_COMPLETED.

### Boot recovery

After restart, the controller restores active missions and can resume execution for RUNNING missions.

---

## 7. When should Overseer stop?

### Stop supervising

stopSupervisor() stops the periodic supervisor loop. FactoryOS stop/shutdown calls it.

### Stop a mission

A mission should stop or leave active execution when:
- the objective is verified complete;
- the mission is cancelled;
- the mission is terminated;
- the mission becomes blocked;
- budget/failure policy requires pause, failure, or replanning;
- safety escalation prevents continuation.

### Stop a run

A run should terminate when:
- its DAG completes;
- its DAG fails;
- an execution boundary rejects work;
- a required dependency cannot proceed;
- the factory enters a state where safe continuation is impossible.

### Current persistent-operation behavior

For an "operate the factory" command, current code intentionally treats the operation as persistent/autonomous until an external lifecycle action stops it.

---

## 8. How does Overseer do its job today?

Current command path:

    1. Receive command
    2. Create / start mission
    3. Read WorldState
    4. Assess thinking depth
    5. Run typed DecisionEngine
    6. Record decision
    7. Generate TaskNodes
    8. Build Task DAG
    9. Attach DAG to mission
    10. Dispatch floor executors
    11. Run work
    12. Collect results
    13. Publish completion/checkpoint events
    14. Complete / replan / fail mission
    15. Evaluate trajectory after RUN_COMPLETED

---

## 9. How does Overseer decide reasoning depth?

Current OverseerThinkingController selects:

| Mode | Current purpose |
|---|---|
| REFLEX | simple low-risk / healthy-state work |
| DELIBERATE | structured multi-step work |
| DEEP | autonomy, low confidence, failures, repairs, resource problems, or complex cases |

Signals include:
- factory halted / attention required;
- floor errors/offline;
- multiple failed/degraded workers;
- active repairs;
- network/drive failure;
- low system confidence;
- command complexity;
- case severity;
- cascading cases.

Current budgets are bounded by the selected mode.

---

## 10. How does Overseer plan work?

### Canonical topology

TaskDAGPlanner.createEightFloorProductionDAG() derives the eight-floor structure from FloorRegistry:

    F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07

### Current command planning

generateTaskNodesForGoal() is partly keyword-driven. It looks for command signals such as:
- factory;
- video;
- shorts;
- floor;
- research;
- analyze;
- trend;
- competitor;
- deep.

It then creates TaskNodes and dependencies.

**CURRENT LIMITATION:** this is not yet a complete semantic mission planner for arbitrary intent. It is a transitional planner using command classification plus the canonical floor DAG.

---

## 11. What does Overseer hand off?

### MissionManager

Overseer hands off / updates:
- mission lifecycle;
- DAG linkage;
- mission progress;
- completion/replanning state.

### Guardian

For protected capabilities, Overseer must use the Guardian/capability boundary.

Guardian controls:
- allow / deny;
- capability scope;
- policy boundaries;
- safety constraints.

### Slayer

For:
- worker anomalies;
- stale execution;
- lease/fencing failures;
- emergency containment.

Slayer owns the enforcement action.

### Healer

For:
- diagnosed failures;
- bounded recovery;
- repair;
- retry;
- reconciliation.

### Floor workers

Overseer hands off:
- TaskNode;
- dependencies;
- mission context;
- required floor role;
- bounded execution scope.

### F07

After rendering, the physical artifact goes to independent verification.

F07 decides whether the media result is verified.

### Learning

After RUN_COMPLETED, ProductionTrajectoryCollector finalizes the production trajectory and emits TRAJECTORY_EVALUATED.

Only independently verified outcomes should become learning material.

---

## 12. What does Overseer own?

### Owns
- factory-wide orchestration;
- mission coordination;
- task planning;
- DAG construction;
- cross-floor sequencing;
- dispatch;
- global supervision;
- cognitive routing/assessment;
- decision history;
- mission progress;
- escalation coordination;
- factory operational context;
- production trajectory collection.

### Does not own
- policy authorization;
- capability issuance;
- worker emergency killing;
- unrestricted repair;
- final artifact verification;
- human approval;
- secret authority;
- independent publication authority.

---

## 13. Current Overseer capability matrix

| Capability | Current state |
|---|---|
| Natural-language operational command intake | IMPLEMENTED |
| Mission creation/start | IMPLEMENTED |
| Existing mission dispatch | IMPLEMENTED |
| Mission resume after recovery | IMPLEMENTED |
| 8-floor DAG generation | IMPLEMENTED |
| F03/F04 parallel branch | IMPLEMENTED |
| Floor-specific task handlers | IMPLEMENTED |
| WorldState monitoring | IMPLEMENTED |
| Periodic supervision | IMPLEMENTED |
| Event-driven anomaly/case reaction | IMPLEMENTED |
| Cognitive incident triage | IMPLEMENTED |
| Adaptive reasoning depth | IMPLEMENTED |
| Decision ledger | IMPLEMENTED |
| Healer dispatch coordination | IMPLEMENTED |
| Independent verification handoff | IMPLEMENTED |
| RenderFabric physical render dispatch | IMPLEMENTED |
| Production trajectory collection | IMPLEMENTED |
| Mission budget state management | IMPLEMENTED in MissionManager |
| CapabilityRouter presence | IMPLEMENTED / PRESENT |
| Guardian gate before every DAG task | PARTIAL / HARDENING REQUIRED |
| Lease/fencing on Overseer-created DAG executor | PARTIAL / HARDENING REQUIRED |
| Fully semantic dynamic mission planning | NOT YET |
| Pure worker-owned floor execution | NOT YET |
| Model-only authority | MUST NOT EXIST |
| Autonomous unrestricted self-modification | MUST NOT EXIST |

---

## 14. Most important current architecture issue

The current Overseer contains substantial floor execution logic in getTaskExecutorsForFloors().

That means today's Overseer is both:
- commander/orchestrator;
- execution adapter for many floor operations.

Target architecture:

    OVERSEER
       |
       | Typed WorkerTaskContract
       v
    Agent Runtime / Dispatcher
       |
       +--> F00 Worker
       +--> F01 Worker
       +--> F02 Worker
       +--> F03 Worker
       +--> F04 Worker
       +--> F05 Worker
       +--> F06 Worker
       +--> F07 Worker

The Overseer should decide:

**what must happen, why it must happen, where it belongs, who should do it, what authority is required, and when the mission should continue/stop.**

The worker should decide:

**how to perform its bounded specialist task.**

---

## 15. Most important current security issue

TaskDAGExecutor supports LeaseManager-based leasing and fencing, but the current Overseer constructor creates:

    new TaskDAGExecutor(taskDAGRepo, eventBus)

without injecting the canonical LeaseManager.

Therefore:

**CURRENT:** direct lease/fencing enforcement at the Overseer DAG executor boundary is incomplete.

**REQUIRED:** every worker task dispatched by Overseer must carry and enforce:
- worker identity;
- floor;
- capability;
- Guardian grant;
- lease;
- fencing token;
- budget;
- execution scope;
- input/output schema;
- required evidence;
- downstream verification requirement.

This is a hardening item and must not be treated as already complete.

---

## 16. What a correct Overseer should do

The ideal control cycle is:

    OBSERVE
       ↓
    UNDERSTAND
       ↓
    PLAN
       ↓
    CHECK POLICY
       ↓
    RECEIVE AUTHORIZATION
       ↓
    DISPATCH
       ↓
    MONITOR
       ↓
    VERIFY
       ↓
    HAND OFF
       ↓
    LEARN

### Observe

Read:
- WorldState;
- active missions;
- cases;
- worker state;
- resource state;
- verified evidence;
- budgets.

### Understand

Determine:
- objective;
- current state;
- blockers;
- uncertainty;
- blast radius;
- required reasoning depth.

### Plan

Produce:
- mission plan;
- DAG;
- dependencies;
- worker selection;
- parallelism;
- budgets;
- expected postconditions.

### Check policy

Before protected execution:
- verify capability exists;
- obtain Guardian authorization;
- verify worker scope;
- verify lease/fencing requirements.

### Dispatch

Send typed contracts to execution workers.

### Monitor

Watch:
- heartbeats;
- progress;
- failures;
- budgets;
- cases;
- resource health;
- verification results.

### Recover / escalate

Use:
- Slayer for enforcement;
- Healer for bounded recovery;
- Guardian for authorization;
- Human for required approvals or unresolved high-risk situations.

### Verify

Never treat:
- model confidence;
- worker success;
- returned file path;
- task completion flag

as final truth.

Physical results require the appropriate verification boundary, with F07 remaining the final production truth boundary for media release.

### Learn

Only verified outcomes enter the learning pipeline.

---

## 17. What Overseer must NOT do

Overseer must never:
- grant itself a capability;
- bypass Guardian;
- modify a fencing token;
- kill workers as a replacement for Slayer;
- perform unlimited repair loops;
- approve its own F07 result;
- rewrite production policy silently;
- promote a new model silently;
- treat LLM output as authority;
- treat unverified artifacts as truth;
- let an external MCP become a command authority;
- change .okf rules implicitly.

---

## 18. Simple example

User:

"Create a 30-second science short about black holes."

Correct control path:

    User
      ↓
    Overseer
      ↓
    Mission
      ↓
    Read state
      ↓
    Choose reasoning depth
      ↓
    Build DAG
      ↓
    F00 → F01 → F02
                  ↓
             F03 + F04
                  ↓
                 F05
                  ↓
                 F06
                  ↓
                 F07
                  ↓
          Verified result

If F06 fails:

    F06 failure
       ↓
    Case / Slayer signal
       ↓
    Overseer diagnosis
       ↓
    Healer bounded recovery
       ↓
    F06 retry / repaired artifact
       ↓
    F07 re-verification

Overseer coordinates the chain. It does not become the renderer, healer, slayer, or verifier.

---

## 19. Command / authorization / execution formula

    COMMAND != AUTHORIZATION != EXECUTION != VERIFICATION

### Command
"Render this mission."

Owner: **Overseer**

### Authorization
"Is this render capability allowed for this worker and scope?"

Owner: **Guardian + capability policy**

### Execution
"Perform the render."

Owner: **bounded worker / RenderFabric / Compute Fabric**

### Verification
"Is the produced artifact actually correct?"

Owner: **F07 / independent verifier**

This separation is non-negotiable.

---

## 20. Overseer lifecycle

    INACTIVE
       ↓
    BOOT
       ↓
    READY
       ↓
    OBSERVE
       ↓
    ASSESS
       ↓
    PLAN
       ↓
    AUTHORIZE
       ↓
    DISPATCH
       ↓
    MONITOR
       ├── SUCCESS → VERIFY → COMPLETE / NEXT
       ├── FAILURE → CASE → HEAL / RETRY / REPLAN
       ├── POLICY DENIAL → ESCALATE
       └── HUMAN REQUIRED → WAIT / ESCALATE
       ↓
    LEARN
       ↓
    READY / STOP

---

## 21. Final definition

**Overseer is the factory commander.**

- **Why work?** To advance a mission toward its verified objective.
- **What work?** The next authorized tasks required by the mission.
- **When work?** When a mission, event, recovery need, or autonomous cycle requires action.
- **Where work?** Across the FactoryOS control plane and eight production floors.
- **Who works?** Specialized workers and regulated agents.
- **How much reasoning?** REFLEX, DELIBERATE, or DEEP based on state, risk, and complexity.
- **Who authorizes protected execution?** Guardian/capability layer.
- **Who enforces emergency stops?** Slayer.
- **Who repairs?** Healer / bounded repair mechanisms.
- **Who verifies the physical result?** Auditor/F07.
- **Who outranks Overseer?** Human Authority.

> **Overseer should be the best commander, not the biggest worker.**


---

## 22. Current ShortForge system capability map

| System part | What it can do now | What it must not own |
|---|---|---|
| **Human Authority** | Ultimate approval, shutdown, exceptional override, production governance | Routine automated execution |
| **Overseer** | Mission orchestration, DAG planning, dispatch, supervision, cognitive routing, recovery coordination | Capability minting, emergency kill authority, final verification |
| **Guardian** | Capability/policy authorization, allow/deny gates, execution constraints | Factory strategy, ordinary content generation |
| **Slayer** | Detect operational anomalies, revoke leases, evict/terminate failing workers, containment | Mission strategy, policy redefinition |
| **Healer** | Bounded repair, retry, reconciliation, recovery, Last-Known-Good restoration | Unlimited retries, final success declaration |
| **F00** | Research/evidence acquisition | Final strategy or production rendering |
| **F01** | Strategy and audience/narrative direction | Capability issuance, physical rendering |
| **F02** | Script and narrative structure | Physical media rendering |
| **F03** | Visual asset planning/realization | F05 timeline authority, F07 release authority |
| **F04** | Media synthesis, narration, provider execution | F03 planning truth, F05 composition authority |
| **F05** | TimelineIR / composition / render manifest assembly | Final physical rendering authority |
| **F06** | Render orchestration through RenderFabric/Compute Fabric | Final verification/release truth |
| **F07** | Physical/media/compliance verification and findings | Self-approval of unverified results |
| **Agent Runtime** | Sessions, budgets, timeouts, capability checks, checkpointing, tracing | Factory strategy or sovereign authority |
| **Capability Registry** | Capability inventory, policy boundaries, execution admission | Mission planning |
| **MissionManager** | Mission lifecycle, budgets, progress, completion evaluation | Capability authorization |
| **Memory / Knowledge** | Context, durable memory, learning records, evidence-backed retrieval | Authority decisions by itself |
| **Ascalon / SCL** | Deep cognition, proposals, diagnosis, planning, synthesis, learning support | Direct authority, capability grants, final verification |
| **RenderFabric / Compute Fabric** | Physical media execution and compute routing | Mission policy or release verification |
| **MCP integrations** | External tool/context access through bounded adapters | Becoming an authority layer |
| **CAS / lineage / receipts** | Artifact identity, integrity, provenance, replay/evidence support | Deciding business or policy intent |

### One-line system rule

**Think with cognition. Command with Overseer. Authorize with Guardian. Enforce with Slayer. Recover with Healer. Execute with workers. Verify with F07. Keep Human above the whole system.**

---

## 23. Current priority order for completing Overseer

The current Overseer should be hardened in this order:

1. Inject the canonical LeaseManager into Overseer TaskDAGExecutor.
2. Make every dispatched WorkerTaskContract carry explicit capability, grant, lease, fencing, budget, scope, schemas, and evidence requirements.
3. Move floor-specific execution logic out of OverseerControlPlane into dedicated floor workers/runtime adapters.
4. Replace keyword-driven command-to-DAG planning with semantic typed mission planning.
5. Make Guardian authorization a mandatory runtime gate for every protected floor action.
6. Make stop/pause/replan behavior explicit and uniform across mission, run, DAG and worker levels.
7. Keep F07 physically independent from creator/executor logic.
8. Feed only verified outcomes into Ascalon training.

The goal is not to make Overseer larger.

The goal is to make Overseer **clearer, more authoritative, more bounded, and more replaceable**.
