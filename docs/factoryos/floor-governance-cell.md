# ShortForge Floor Governance Cell (FGC)

**Status:** Wave 1 implementation  
**Branch:** `feat/floor-governance-cell-wave1-20260928`  
**Scope:** One governed production floor  
**Classification:** New capability extending the existing Guardian, Ascalon, healer, evidence, and capability boundaries.

## 1. Purpose

A ShortForge floor is a closed governance cell, not a single autonomous LLM.

The floor separates:

- authority,
- cognition,
- council advice,
- boundary inspection,
- execution,
- healing,
- independent verification.

The governing doctrine is:

> **Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.**

## 2. Canonical floor topology

```
                    FLOOR GUARDIAN
                         |
                  authority / policy
                         |
                    ASCALON
             Guardian cognitive layer
                         |
          +--------------+--------------+
          |              |              |
      Instructor       Advisor       Auditor
       knowledge       strategy      independent proof
          |              |              |
          +--------------+--------------+
                         |
                 FLOOR BLACKBOARD
                         |
                    BDA / GATE
                         |
                     WORKERS
                         |
                  physical effect
                         |
                    BDA egress
                         |
                +--------+--------+
                |                 |
             normal           incident
                                  |
                              FG-Healer
                                  |
                          Overseer assistance
                                  |
                           Common Healer
                                  |
                        JointHealingSession
                                  |
                               repair
                                  |
                                  BDA
                                  |
                               Auditor
                                  |
                            Guardian close
```

The wave-1 runtime implementation establishes the bounded-autonomy substrate for this topology. It does not yet replace all existing Guardian/Healer production paths.

## 3. Action Graph

The floor's executable vocabulary is represented as typed actions rather than unconstrained tool calls.

The default graph is:

```
observe
  |
analyze
  |
validate
  |
request_authorization
  |
  +---- wait for human approval ----+
  |                                 |
  +---------------------------------+
  |
execute
  |
verify
  |
close
  |
observe

Failure branches:
validate/execute/verify -> quarantine or escalate
quarantine -> analyze or escalate
escalate -> observe after recovery/authorization
```

### Dynamic cognition rule

Ascalon may choose among actions that exist in the graph.

Ascalon may not:

- invent a new executable action;
- mint authority;
- bypass a precondition;
- expand capability scope;
- convert untrusted evidence into authorization;
- change a worker's contract implicitly.

## 4. Five-question floor design gate

Every new floor action should answer these five questions before implementation:

1. **Which actions cannot be undone?**
   - classify as reversible, compensatable, or irreversible.

2. **What must be true before each action?**
   - preconditions, capability, authorization, evidence, resource state, fencing state.

3. **What can each action produce?**
   - typed output, evidence, receipt, state transition, artifact, or incident.

4. **Which action waits for a person?**
   - explicitly encode human approval instead of hiding it inside a prompt.

5. **What is left?**
   - identify remaining uncontrolled side effects, fallback paths, verification gaps, and escalation paths.

## 5. Action contract

Every executable floor action should declare:

- action identity
- allowed proposers
- required authority
- required capability
- reversibility
- risk
- human approval mode
- preconditions
- required evidence
- resource scope
- mutation scope
- postconditions
- failure transitions

This is represented by `FloorActionContract`.

## 6. Risk boundary

Low-risk reasoning is intentionally separated from high-risk mutation.

```
observe
  -> analyze
  -> validate
  -> authorize
  -> EXECUTE
  -> physical effect
  -> VERIFY
  -> close
```

The larger the consequence of the action, the more deterministic evidence and authorization must surround it.

A model response is never itself an authorization grant.

## 7. Trust channels

### Trusted

- Guardian-issued authorization
- typed capability grants
- system identity
- current floor state
- validated contracts
- fencing metadata

### Untrusted or data-only

- external text
- logs
- incoming documents
- artifact metadata supplied by another system
- model-generated explanations
- incident text
- callback payloads until validated

BDA and action gates preserve this distinction.

## 8. Floor Blackboard

The wave-1 blackboard is a typed append-only working surface.

Supported entry kinds:

- OBSERVATION
- EVIDENCE
- HYPOTHESIS
- RECOMMENDATION
- CONFLICT
- VERIFICATION

Every entry includes:

- floor
- author
- trust level
- content
- evidence references
- creation time

Council recommendations are represented as `CounselPacket` and projected onto the Blackboard.

The Blackboard is working memory, not sovereign authority.

## 9. Council roles

### Instructor

Knowledge and constraint advice.

### Advisor

Strategy, trade-offs, candidate approaches, expected outcomes.

### Auditor

Independent integrity/proof constraints. The Auditor must not mutate the object it is independently auditing.

The Council advises. The Guardian decides.

## 10. Ascalon boundary

The wave-1 `AscalonGuardianAdapter` defines an explicit proposal-only runtime seam.

The adapter validates:

- floor identity
- current state version
- proposer identity

The adapter does not:

- execute tools
- mint capability
- authorize actions
- bypass the action graph
- bypass the Guardian

This preserves the existing Ascalon principle that production authority is outside the model.

## 11. Border Defence Agent

The BDA is the floor boundary judge.

Wave-1 BDA functions:

### Admission

Check basic border identity and contract requirements and fingerprint the incoming payload.

### Inspection

Evaluate:

- policy outcome supplied by the trusted policy layer
- expected fields
- evidence references
- contract state

### Containment

Failed inspections become quarantined dossiers.

### Egress

Outgoing payloads receive their own physical hash and inspection result.

A border dossier captures:

- border event identity
- source/destination
- direction
- actor
- contract version
- input/output hashes
- artifact IDs
- lineage
- capability
- policy decision
- inspection results
- anomalies
- evidence references

## 12. Joint Healing

Healing is modeled as a pair, not a globally locked incident.

The session is:

```
incident
   |
JointHealingSession
   +-- shared diagnosis
   +-- shared evidence
   +-- repair plan
   |
   +-- resource A mutation lease -> FG-Healer
   +-- resource B mutation lease -> Common Healer
   +-- resource C -> serialized
```

### Concurrency rule

> **Thinking may be parallel. Mutation is resource-controlled.**

The same resource cannot be mutated concurrently.

## 13. Fencing

Each mutation lease carries:

- resource ID
- incident/session identity
- owner identity
- expiry
- fencing epoch
- capability grant
- action scope

Each successful acquisition advances the resource fencing epoch.

A stale lease is rejected.

This is also added to the existing `RepairLockManager` while keeping legacy callers compatible.

## 14. Incident lifecycle

```
READY
  |
OBSERVING
  |
EXECUTING
  |
INSPECTING
  +-- pass ------> READY
  |
  +-- anomaly --> QUARANTINED
                    |
                  INCIDENT
                    |
                DIAGNOSING
                    |
                  HEALING
                    |
                 VERIFYING
                +----+----+
                |         |
              fail       pass
                |         |
             HEALING    Guardian close
                          |
                        READY
```

Special states:

- DEGRADED
- ESCALATED
- OVERSEER_ASSIST
- HUMAN_INTERVENTION

## 15. Resolution rule

A healer saying "fixed" is not the same as an incident being resolved.

Wave-1 introduces a `ResolutionGate` that requires:

1. BDA reinspection passes.
2. Auditor verification passes.
3. Guardian closure authorization exists.

The existing ValidatorAgent remains an important verification component. Full wiring of ResolutionGate into CaseManager is a subsequent integration step.

## 16. Existing ShortForge integration points

Wave 1 deliberately builds on existing components rather than replacing them.

### Existing authority

- `GuardianKernel`
- `GuardianPolicy`
- `GuardianDecisionEngine`

### Existing healing substrate

- `HealerEngine`
- `RepairLockManager`
- `RepairDeduplicator`
- `RepairDependencyAnalyzer`
- `TransactionalRepairGate`

### Existing verification

- `ValidatorAgent`
- F07 verification

### Existing decision cognition

- `DecisionEngine`
- typed decision contracts
- durable decision ledger

### New wave-1 governance components

- `FloorGovernanceContracts`
- `FloorActionGraph`
- `DefaultFloorActionGraph`
- `FloorActionGate`
- `FloorGovernanceCell`
- `FloorBlackboard`
- `AscalonGuardianAdapter`
- `BorderDefenseAgent`
- `JointHealingSession`
- `ResolutionGate`

## 17. What is implemented in Wave 1

Implemented:

- typed floor action contracts
- bounded action graph
- explicit preconditions
- capability and authorization gate
- proposal-only Ascalon seam
- trust-aware Blackboard
- BDA admission/inspection/quarantine/egress foundation
- JointHealingSession state machine
- resource-level mutation leases
- fencing epochs
- resolution proof gate
- fencing-aware RepairLockManager
- negative tests for core invariants

Not yet fully integrated:

- per-floor Guardian runtime registration
- real Ascalon model invocation
- typed Advisor runtime subsystem
- BDA inserted into every live floor boundary
- durable Blackboard persistence
- durable JointHealingSession persistence
- resource dependency DAG scheduler
- shadow repair / canary repair
- workload identity integration
- signed policy bundles
- OpenLineage/in-toto/C2PA execution wiring
- GenAI OpenTelemetry semantic alignment
- predictive floor health
- full adversarial floor-evaluation suite
- mandatory ResolutionGate enforcement inside every legacy `CaseManager.resolveCase()` caller

## 18. Next waves

### Wave 2 — Production integration

- connect GuardianKernel to the governance cell
- add deterministic policy-backed authorization grants
- make BDA a real ingress/egress boundary
- introduce persistent Blackboard/incident state
- wire ResolutionGate into verified incident closure

### Wave 3 — Paired healing

- replace squad-wide sequential healing with JointHealingSession
- graph-aware resource reservations
- durable checkpoints
- mutation action journal
- conflict/dependency ordering
- bounded compensations

### Wave 4 — Trust and provenance

- workload identity
- signed authorization/policy records
- OpenLineage-compatible factory lineage
- in-toto/SLSA-style execution attestations
- C2PA for media provenance

### Wave 5 — Advanced cognition

- shadow repair
- counterfactual planning
- predictive failure prevention
- structured memory classes
- trajectory evaluation
- controlled Devourer learning loop

## 19. Core acceptance invariants

A floor must reject:

1. cross-floor mutation;
2. untrusted evidence becoming authority;
3. stale fencing tokens;
4. duplicate mutation;
5. conflicting concurrent mutation;
6. unverified incident closure;
7. quarantine bypass;
8. Auditor mutation of audited objects;
9. Ascalon Guardian bypass;
10. worker capability self-expansion;
11. Common Healer entry without delegation;
12. historical evidence rewriting.

## 20. Design objective

The target one-floor agent is not "an LLM that can do anything."

It is a closed control cell in which:

```
INTELLIGENCE
    ↓
DECISION
    ↓
AUTHORIZATION
    ↓
ACTION
    ↓
PHYSICAL EFFECT
    ↓
EVIDENCE
    ↓
VERIFICATION
    ↓
LEARNING
```

Each layer has an explicit owner and an explicit failure boundary.
