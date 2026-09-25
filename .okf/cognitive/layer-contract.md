# ShortForge Cognitive Layer — Responsibility Contract

> Status: PLANNED / DESIGN-CANONICAL

## 1. Authority separation

| Entity | Owns | Does not own |
|---|---|---|
| Human Authority | ultimate approval, policy override, kill switch | routine worker cognition |
| Overseer | factory-wide command, mission lifecycle, global planning | every low-level worker decision |
| ShortForge Cognitive Layer | worker cognition, bounded decisions, context synthesis, templates, learning candidates | sovereign authority, safety gates, physical execution |
| Guardian | capability and policy authorization | content generation |
| Slayer | lease revocation and zombie eviction | planning |
| Healer | bounded recovery | unlimited retries |
| Auditor / F07 | evidence-based verification | generating fake success |
| Floor Worker | specialized execution | changing its own contract |

## 2. Worker brain contract

Each worker receives a cognitive contract containing:

- workerId
- floorId
- specialization
- objective
- inputs
- constraints
- allowedCapabilities
- toolBudget
- successCriteria
- verificationCriteria
- escalationPolicy
- memoryRefs

The worker executes the contract. SCL may revise the contract only through an authorized state transition.

## 3. Worker correctness loop

~~~
contract
  ↓
execute
  ↓
observe
  ↓
validate output
  ↓
compare against specialization
  ↓
accept
  ├── or repair
  ├── or retry
  ├── or re-plan
  └── or escalate
~~~

A worker that repeatedly violates its specialization becomes a FailureCase and a candidate for training or architecture improvement.

## 4. Decision record

Every important SCL decision should record:

~~~
DecisionRecord
  ├── decisionId
  ├── missionId
  ├── runId
  ├── workerId / floorId
  ├── stateDigest
  ├── evidenceRefs
  ├── decision
  ├── uncertainty
  ├── policyRefs
  ├── modelRef
  ├── latencyMs
  ├── outcome
  └── verificationRefs
~~~

Eligible records become part of the Ascalon trajectory stream.

## 5. Context discipline

SCL must not pass the entire factory state to every worker.

Context should be compiled into:

1. objective context
2. relevant state
3. required evidence
4. allowed actions
5. constraints
6. expected output
7. verification contract

This keeps cognition fast and easier to evaluate.

## 6. Template contract

A content-engine template must identify:

- engine and engine version
- supported capabilities
- input schema
- prompt/template schema
- output schema
- TimelineIR mapping
- media limits
- render requirements
- verification rules
- fallback engine
- provenance

Template revisions are versioned and evaluated before promotion.

## 7. Escalation

SCL escalates when:

- confidence is insufficient for the permitted action
- evidence conflicts
- worker behavior is outside its contract
- an action is irreversible
- a required capability is unavailable
- safety or policy state is ambiguous
- a novel architecture pattern is not yet validated

Escalation target is normally Overseer or Guardian depending on the problem.
