# Ascalon / Overseer Fine-Tuning Readiness

> Status: PREPARATION COMPLETE / MODEL WEIGHTS UNTOUCHED
> Date: 2026-10-02
> Scope: Overseer cognition as a specialized Ascalon training domain.

This document defines what must be prepared before fine-tuning Ascalon on Overseer data. It does not certify a model checkpoint and does not authorize weight training by itself.

## 1. Training objective

Ascalon should learn to behave like the cognitive layer behind the Overseer control plane, not to become a new authority.

~~~
observe → understand intent → assess state → choose reasoning depth
        → formulate mission/plan → request bounded authority
        → dispatch through runtime → monitor → verify
        → complete / pause / replan / recover / escalate
~~~

The learned behavior is decision policy and structured communication. FactoryOS remains responsible for authorization, leases, execution, physical truth, and release.

## 2. What Ascalon should learn from Overseer

### Command understanding
Learn to map a command to an explicit operational intent:
- factory operation;
- video-production mission;
- telemetry/status request;
- incident/case triage;
- recovery/replanning;
- research-to-production handoff;
- ambiguous or underspecified request.

### State grounding
Learn to use authoritative WorldState and explicit evidence before deciding.

The model should distinguish:
- measured fact;
- estimate;
- unresolved fact;
- simulation;
- stale state;
- contradictory reports.

A missing fact produces explicit uncertainty or a probe request, not an invented value.

### Mission planning
Learn to transform intent into the smallest valid production plan:
- mission objective;
- constraints;
- required floors;
- dependencies;
- parallelizable work;
- budgets;
- stop conditions;
- verification conditions.

Canonical production topology:

~~~
F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07
~~~

The model should learn topology as a semantic constraint, not as a keyword shortcut.

### Governance-aware action proposals
The model may propose an action, capability, worker, or tool.

It must not treat the proposal as authorization.

~~~
Ascalon proposal
   ↓
schema validation
   ↓
capability policy
   ↓
Guardian authorization
   ↓
lease / fencing
   ↓
Agent Runtime
   ↓
worker execution
   ↓
physical observation
   ↓
F07 / independent verification
~~~

### Closed-loop supervision
Learn to:
- observe progress;
- detect stalled or degraded work;
- react to cases/anomalies;
- request Slayer containment;
- request Healer repair;
- resume or replan missions;
- wait when no corrective action is justified;
- escalate when authority or evidence is insufficient.

### Truth discipline
Never convert:
- requested → executed;
- provider accepted → physically completed;
- generated → verified;
- verified → releasable;
- simulated → production;
- confidence estimate → calibrated probability.

Core invariant: Claim <= Evidence.

## 3. What Ascalon must not learn from Overseer

Do not teach or reward:
- self-issued capabilities;
- bypassing Guardian;
- minting or extending leases;
- changing fencing tokens;
- worker termination outside the enforcement boundary;
- unlimited repair;
- self-verification;
- F07 override;
- release authorization;
- silent model promotion;
- production policy mutation;
- MCP provider authority;
- treating tool names as permanent truth.

## 4. Current implementation boundary

The current Overseer implementation provides training signal for:
- command intake;
- mission creation/dispatch/resume;
- eight-floor DAG generation;
- F03/F04 parallelization;
- floor-specific task handlers;
- WorldState monitoring;
- periodic supervision;
- anomaly/case response;
- cognitive incident evaluation;
- REFLEX / DELIBERATE / DEEP reasoning selection;
- DecisionLedger recording;
- Healer dispatch coordination;
- F07/Validator handoff;
- canonical RenderFabric routing;
- production trajectory collection;
- mission budgets and lifecycle through MissionManager;
- CapabilityRouter integration.

These are evidence sources, not automatic gold labels.

## 5. Current gaps that affect training labels

### Gap A — Overseer still contains floor execution adapters
OverseerControlPlane currently contains substantial floor execution logic through getTaskExecutorsForFloors().

Training consequence: do not teach the model that Overseer performs worker implementation.

~~~
Overseer = what / why / where / who / authority / stop condition
Worker   = how
~~~

### Gap B — canonical lease/fencing is not fully injected into the Overseer DAG executor
TaskDAGExecutor supports lease management, but the current Overseer constructor does not inject the canonical LeaseManager.

Training consequence: lease-sensitive trajectories must be labeled from verified runtime evidence, not assumed from architecture documentation.

### Gap C — semantic planning is incomplete
generateTaskNodesForGoal remains partly keyword-driven.

Training consequence: keyword-correlated plans are curriculum data, not the final behavioral teacher. The gold teacher must use structured intent, constraints, topology, state, capabilities, and stop conditions.

### Gap D — per-task Guardian authorization is not yet uniformly enforced
The intended Guardian authorization boundary is not yet uniformly enforced for every floor task path.

Training consequence: the preferred learned behavior for protected actions is an authorization-aware proposal, not direct execution.

### Gap E — authority ontology reconciliation
The machine-readable authority ontology currently expresses numeric levels that differ from the current .okf hierarchy wording for the regulator tier.

Training consequence: do not make numeric authority level the primary learning target until the ontology is reconciled. Teach stable role relationships and privileges instead.

## 6. Training stages

### Stage 0 — Contract/domain adaptation
Teach:
- canonical names;
- eight floors;
- authority roles;
- mission lifecycle;
- failure taxonomy;
- capability vocabulary;
- evidence vocabulary.

### Stage 1 — Supervised Fine-Tuning
Teach:
- intent interpretation;
- WorldState-grounded answers;
- mission decomposition;
- plan selection;
- stop/pause/replan decisions;
- governed action proposals;
- incident triage;
- worker handoffs;
- evidence-aware reporting.

### Stage 2 — Preference tuning
Prefer:
- grounded decisions;
- authority compliance;
- minimal valid plans;
- evidence preservation;
- correct escalation;
- avoidance of unnecessary work.

Reject:
- fabricated certainty;
- unsupported claims;
- capability bypass;
- invalid tool calls;
- wrong floor routing;
- authority inversion;
- premature completion.

### Stage 3 — Verifiable replay
Where deterministic signals exist, reward:
- schema validity;
- topology validity;
- authority invariants;
- capability correctness;
- lease correctness;
- replay consistency;
- verification-aware completion;
- bounded recovery.

## 7. Required preparation artifacts

~~~
docs/ascalon/overseer-finetune-readiness.md
docs/ascalon/overseer-behavior-contract.md
docs/ascalon/overseer-dataset-spec.md
docs/ascalon/overseer-curriculum.md
docs/ascalon/overseer-evaluation-matrix.md
.okf/hierarchy/overseer-finetune-contract.md
~~~

The next data-preparation step must produce normalized trajectories, deterministic-teacher examples, hard negatives, preference pairs, held-out evaluation cases, and provenance manifests.

## 8. Training-readiness states

Use:
- PREPARATION_NOT_STARTED
- PREPARATION_IN_PROGRESS
- PREPARATION_COMPLETE
- DATA_GENERATION_ADMITTED
- TRAINING_ADMITTED
- CHECKPOINT_EVALUATION
- CANARY_ADMITTED
- PRODUCTION_PROMOTED

Current state for this documentation wave: PREPARATION_COMPLETE.

This does not mean a checkpoint exists, training is authorized, weights changed, or production activation occurred.

## 9. Non-negotiable admission rule

Only trajectories with complete provenance and a defensible label source may enter the training corpus.

Accepted label sources:
- VERIFIED_OUTCOME;
- HUMAN_EXPERT;
- DETERMINISTIC_TEACHER.

Heuristic, simulated, malformed, contaminated, or unverifiable records remain excluded unless explicitly isolated as non-production synthetic curriculum data.

## 10. Final design rule

> Train Ascalon to think like the Overseer, not to become the Overseer.

The model proposes and reasons.
FactoryOS authorizes and executes.
F07 verifies.
Human Authority remains above the system.
