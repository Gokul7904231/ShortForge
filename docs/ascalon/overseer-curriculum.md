# Ascalon / Overseer Fine-Tuning Curriculum

> Status: CURRICULUM SPECIFICATION
> Audience: Ascalon dataset and evaluation pipeline

## 1. Curriculum design

Train from deterministic contracts upward to realistic closed-loop operational episodes.

~~~
Ontology
  ↓
State grounding
  ↓
Intent
  ↓
Planning
  ↓
Governance
  ↓
Execution proposals
  ↓
Supervision
  ↓
Failure / recovery
  ↓
Verification
  ↓
Long-horizon closed-loop missions
~~~

The model should become progressively better at choosing whether and what to do before learning the complexity of how workers implement it.

## 2. Level 0 — Vocabulary and ontology

Teach:
- Overseer;
- Guardian;
- Slayer;
- Healer;
- Worker;
- F00–F07;
- MissionManager;
- Capability Registry;
- Agent Runtime;
- RenderFabric;
- F07;
- CAS;
- provenance;
- lease;
- fencing;
- training eligibility.

Success condition:
- zero floor identity swaps;
- zero authority inversion.

## 3. Level 1 — State grounding

Scenarios:
- healthy factory;
- idle factory;
- active mission;
- blocked mission;
- degraded GPU;
- insufficient disk;
- active incident;
- multiple cases;
- stale state;
- contradictory reports.

Targets:
- distinguish fact from uncertainty;
- identify authoritative source;
- request evidence before action;
- avoid invented telemetry.

## 4. Level 2 — Intent routing

Teach:
- direct telemetry question;
- current trend/research request;
- production command;
- status query;
- incident triage;
- recovery request;
- ambiguous request.

Target behavior:
- classify intent;
- select correct source;
- ask for clarification only when needed.

## 5. Level 3 — Mission planning

Give:
- objective;
- state;
- constraints;
- resource budget;
- available capabilities;
- floor dependencies.

Teach outputs:
- mission objective;
- smallest valid sub-DAG;
- target floors;
- parallel branches;
- completion conditions.

Important negative:
A generic "run all eight floors" response should be rejected when a smaller valid plan exists.

## 6. Level 4 — Governance-aware proposals

Scenarios:
- guarded render dispatch;
- protected provider invocation;
- external MCP interaction;
- publishing;
- capability unavailable;
- capability denied;
- expired authorization.

Target:
- propose the action;
- identify required capability;
- identify Guardian gate;
- preserve scope and evidence requirements;
- stop when denied.

## 7. Level 5 — Supervision

Provide stepwise updates:
- task accepted;
- worker running;
- worker stalled;
- worker recovered;
- output observed;
- output verified;
- mission partially complete.

Target:
- continue;
- pause;
- replan;
- recover;
- contain;
- escalate;
- complete.

## 8. Level 6 — Failure and recovery

Core failure classes:
- worker timeout;
- CAS digest mismatch;
- FFprobe decode failure;
- F07 policy rejection;
- stale fencing token;
- GPU out of memory;
- malformed model output.

Target:
- classify failure;
- choose correct regulator;
- propose bounded recovery;
- require independent verification;
- avoid repeated unsafe retries.

## 9. Level 7 — Evidence and verification

Force the model to distinguish:

~~~
accepted
  ≠
executed
  ≠
observed
  ≠
verified
  ≠
released
~~~

Use concrete evidence references in gold outputs.

Never claim success solely from:
- provider response;
- worker status;
- intention;
- generated metadata;
- stale memory.

## 10. Level 8 — Long-horizon missions

Canonical pattern:

~~~
research → strategy → script → assets/media
→ timeline → render → verify
~~~

Add disturbances:
- resource degradation;
- worker failure;
- policy rejection;
- provider change;
- verification failure;
- recovery;
- replan.

Gold behavior should preserve the mission objective while changing only what is necessary.

## 11. Deterministic-teacher rules

### Protected action
If a capability requires a Guardian gate and no valid authorization exists:
~~~
decision = REQUEST_AUTHORIZATION
execution = NOT_PERMITTED
~~~

### Missing physical evidence
If outcome says SUCCESS but verification evidence is absent:
~~~
reportedState = UNVERIFIED
trainingLabel = REJECT
~~~

### Expired lease
If a lease is expired or the fencing token is stale:
~~~
execution = REJECT
remediation = SLAYER_CONTAINMENT
~~~

### Blocking verification failure
If F07 rejects:
~~~
mission = BLOCKED_OR_REMEDIATION_REQUIRED
release = DENIED
~~~

### Ambiguous request
If the requested object or quality criterion is materially missing:
~~~
decision = CLARIFICATION_REQUIRED
~~~

## 12. Hard-negative curriculum

Every major lesson should have a paired failure:
- correct Guardian request vs self-authorized dispatch;
- correct F03/F04 topology vs swapped floors;
- evidence-bounded status vs fabricated completion;
- bounded retry vs infinite retry;
- targeted replan vs full-pipeline restart;
- correct F07 escalation vs creator self-verification.

## 13. Graduation criteria

A curriculum stage can graduate only when the candidate:
- passes its deterministic invariant set;
- does not regress earlier levels;
- produces valid structured output;
- avoids capability hallucination;
- preserves evidence requirements;
- remains stable on held-out scenarios.

Curriculum completion does not itself authorize production use.
