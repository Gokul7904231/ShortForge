# ShortForge — One-Floor Governance Cell / Floor Design

> Status: SCAFFOLDED / IMPLEMENTED FOUNDATION
>
> This document defines the target architecture and the Wave 1 executable foundation.
> It does not claim the full BDA, Joint Healing Session, policy engine, workload identity,
> or durable healing runtime are implemented yet.

## 1. Design objective

A floor is a closed governance cell, not a single autonomous LLM.

The LLM is cognition. The Guardian is authority. The runtime is execution. BDA and Auditor provide independent evidence.

Core doctrine:

Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.

## 2. One-floor topology

FLOOR GUARDIAN
    |
    +--> ACTION GRAPH
            |
            +--> ASCALON
            +--> INSTRUCTOR / ADVISOR / AUDITOR
            +--> FLOOR BLACKBOARD
            +--> BDA / ACTION GATE
                      |
                      +--> WORKERS
                      |      |
                      |      +--> physical effect
                      |
                      +--> BDA reinspection
                              |
                              +--> AUDITOR
                                      |
                                      +--> GUARDIAN CLOSE

Failure path:
BDA anomaly -> quarantine -> incident -> Guardian -> FG-Healer -> optional Overseer assist -> Common Healer -> Joint Healing Session -> repair -> BDA -> Auditor -> Guardian close.

## 3. Seven planes

| Plane | Component | Owns | Must not own |
|---|---|---|---|
| Authority | Floor Guardian | local authorization, escalation, closure | factory-wide mission |
| Cognitive | Ascalon | state synthesis, hypotheses, candidate actions | authority |
| Council | Instructor / Advisor / Auditor | typed counsel | sovereign mutation |
| Boundary | BDA | ingress/egress, quarantine, dossier | changing policy |
| Execution | Workers / AgentRuntime | bounded tool execution | capability expansion |
| Healing | FG-Healer / Common Healer | bounded repair | final truth |
| Verification | Auditor / F07 where applicable | physical/semantic proof | self-certifying creation |

## 4. Floor Action Graph

Every meaningful operation is represented by a typed action definition.

Action
  - Preconditions
  - Required evidence
  - Authority
  - Allowed actor roles
  - Capability
  - Resource / mutation scope
  - Reversibility
  - Risk
  - Postconditions
  - Verification requirement
  - Failure transitions

Important distinction:
- graph filtering = structural admissibility;
- Guardian authorization = authority;
- AgentRuntime = execution enforcement;
- BDA/Auditor = evidence and verification.

No single layer may collapse these responsibilities.

## 5. Standard action lifecycle

OBSERVE -> ANALYZE -> VALIDATE -> PROPOSE -> AWAIT GUARDIAN AUTHORIZATION -> EXECUTE -> VERIFY -> CLOSE / READY

For incidents:
OBSERVE -> QUARANTINE -> INCIDENT -> DIAGNOSE -> HEAL -> VERIFY -> CLOSE.

The graph can be dynamic, but the action vocabulary remains constrained. A model may select a valid transition; it may not invent a new executable capability.

## 6. Reversibility and risk

Reversibility:
- REVERSIBLE: inspect/analyze style actions.
- COMPENSATABLE: mutation has a defined compensating path.
- IRREVERSIBLE: destructive or external-release style actions.

Risk:
- LOW
- MEDIUM
- HIGH
- CRITICAL

Risk and reversibility are separate from model confidence.

## 7. Ascalon contract

Ascalon receives structured floor state rather than an unbounded log dump.

FloorState:
- identity
- floor contract
- workers/resources
- active cases
- trusted evidence
- council packets
- available actions
- constraints
- recent verified experiences

Ascalon may synthesize state, form hypotheses, consult council records, propose actions, request more evidence, and request Guardian authorization.

Ascalon may not mint authorization, expand capabilities, bypass preconditions, convert untrusted text into authority, close incidents, or self-certify physical results.

## 8. Council packets

Instructor = knowledge and constraints.
Advisor = strategy, trade-offs, expected outcomes.
Auditor = integrity findings, evidence gaps, verification requirements and explicit blocks.

Council messages are typed CounselPacket records, not unbounded agent-to-agent chat.

## 9. Blackboard

The floor should eventually maintain an append-only structured blackboard:
- verifiedFacts
- observations
- hypotheses
- recommendations
- conflicts
- constraints
- candidateActions
- verificationRequirements

The blackboard is shared cognition, not authority.

## 10. BDA boundary contract

BDA should eventually enforce:
1. Admission — identity, floor, schema, version, capability, lineage, hash, provenance and policy.
2. Inspection — semantic and physical validity plus evidence completeness.
3. Containment — freeze, quarantine, preserve, fingerprint, open incident.
4. Egress — outgoing contract passes before crossing the boundary.

Every crossing should produce a BorderDossier.

## 11. Paired healing

Do not lock the incident as a whole.

Create a JointHealingSession and control mutations at the resource/action level.

Thinking can be parallel. Mutations must be fenced and scope-bound.

Future ResourceLock fields:
- resourceId
- incidentId
- sessionId
- ownerId
- leaseExpiry
- fencingEpoch
- capabilityGrant
- actionScope

## 12. Closure gate

A healer saying fixed is a claim.

repair evidence + BDA reinspection + Auditor verification + Guardian closure authorization = RESOLVED.

This prevents direct healer-to-resolved transitions.

## 13. Negative safety contracts

Every floor must test:
1. unknown action rejected;
2. cross-floor target rejected;
3. untrusted evidence cannot satisfy trusted-evidence preconditions;
4. Ascalon cannot self-authorize;
5. mismatched Guardian authorization rejected;
6. expired authorization rejected;
7. stale fencing epoch rejected once fencing is implemented;
8. duplicate repair suppressed;
9. conflicting mutations serialized;
10. unverified repair cannot close;
11. quarantined artifacts cannot propagate;
12. worker cannot expand capability.

## 14. Implementation status

Implemented in this wave:
- FloorActionGraphContracts.ts
- FloorActionGraph.ts
- CounselContracts.ts
- AscalonGuardianAdapter.ts
- regression tests for proposal/authorization boundaries.

Existing substrate reused:
- GuardianKernel
- GuardianPolicy
- GuardianDecisionEngine
- AgentRuntime
- RepairLockManager
- RepairDeduplicator
- RepairDependencyAnalyzer
- TransactionalRepairGate
- CaseManager
- TraceContext
- .okf authority and FloorRegistry.

Next waves:
1. BDA + BorderDossier.
2. Incident Blackboard.
3. JointHealingSession + fencing epoch.
4. Resolution Gate.
5. typed external policy engine.
6. workload identity.
7. full GenAI observability mapping.
8. predictive prevention / shadow repair.
9. adversarial floor evaluation.
10. Devourer / Ascalon learning loop.

## 15. Research disposition

External references used as design patterns:
- NetInjectBench (2026): indirect prompt injection through operational artifacts.
- Cedar: principal/action/resource/context authorization.
- in-toto: authorized-step and evidence-chain provenance.
- SPIFFE/SPIRE: workload identity and short-lived credentials.
- OpenTelemetry GenAI observability: model/tool trace relationships.
- Temporal: durable execution for long-running agent workflows.
- OpenLineage: explicit producer/lineage metadata.

External research informs architecture; it never overrides executable implementation, canonical contracts, tests, or .okf authority.