
# ShortForge / FactoryOS — Absolute Hierarchy & Mapping

> Document Class: Master Hierarchy Map
> Location: .okf/hierarchy-map.md
> Status: AUTHORITATIVE ARCHITECTURAL MAP / IMPLEMENTATION-GROUNDED WHERE MARKED
> Purpose: One unambiguous map of authority, cognition, enforcement, execution, verification, memory, learning, and production-floor relationships.

IMPORTANT:
This document maps relationships and resolves terminology/navigation. It does not outrank executable implementation, canonical contracts, or automated tests. Where documentation conflicts with executable code, the source-of-truth hierarchy in .okf/index.md applies.

---

## 0. Absolute hierarchy at a glance

~~~
LEVEL 0
HUMAN AUTHORITY
  |
  | ultimate approval / override / emergency authority
  v
LEVEL 1
OVERSEER — SUPREME CONTROL PLANE
  |
  +------------ sovereign mission authority -----------+
  |                                                   |
  v                                                   v
SHORTFORGE COGNITIVE LAYER                       LEVEL 2 REGULATORS
(SCL)                                             Guardian
  |                                               Slayer
  +-- Fast Decision Core                          Healer
  +-- ShortForge Cognitive Model
  +-- Context Compiler
  +-- Decision / Record synthesis
  +-- Worker cognition
  +-- Template cognition
  +-- Research / architecture interpretation
  |
  | bounded cognitive instructions
  v
RUNTIME / EXECUTION BOUNDARY
AgentRuntime + leases + checkpoints + TraceContext
  |
  v
LEVEL 3
SPECIALIZED FLOOR WORKERS
  |
  +-- F00 Research
  +-- F01 Strategy
  +-- F02 Scripting
  +-- F03 Visual
  +-- F04 Voice / Audio
  +-- F05 Timeline
  +-- F06 Rendering
  +-- F07 Verification
  |
  v
ARTIFACTS + TELEMETRY + FINDINGS
  |
  +-- Auditor / Validator
  +-- Last-Known-Good
  +-- Cases
  +-- Verification Receipts
  |
  v
MEMORY / LEARNING
  |
  +-- MemoryOS / KnowledgeOS
  +-- Ascalon training trajectories
  +-- Devourer controlled improvement
~~~

### Core rule

The system has one sovereign command authority: the Overseer, beneath Human Authority.

The system has multiple independent boundaries:

- Guardian owns capability / policy authorization.
- Slayer owns lease revocation / kill enforcement.
- Healer owns bounded remediation.
- Auditor / F07 owns evidence-based verification.
- Workers own execution only.
- SCL owns cognition, not authority.

---

# 1. Canonical authority levels

## Level 0 — Human Authority

Definition: ultimate human control over the factory.

Owns:
- final policy authority
- exceptional approval
- manual override
- emergency stop / kill switch
- production governance
- architecture promotion where human review is required

Does not own:
- routine worker execution
- ordinary DAG scheduling
- low-level model calls
- routine floor decisions

Relationship:

~~~
Human
  |
  v
Overseer
  |
  v
Factory
~~~

Implementation status: conceptual/external to FactoryOS runtime.

---

## Level 1 — Overseer Supreme Control Plane

Canonical source: apps/web/factoryos/core/overseer/OverseerControlPlane.ts

Definition: factory-wide command and lifecycle authority.

Owns:
- mission intake
- mission lifecycle
- factory-wide objective decomposition
- production DAG planning
- production dispatch
- cross-floor supervision
- global state monitoring
- global strategy
- decision ledger
- escalation coordination
- architecture-proposal review workflow

Delegates / requests:
- Guardian authorization
- Slayer enforcement
- Healer repair
- worker execution
- verification

Canonical rule:

> SCL supports the Overseer; SCL does not become a second Overseer.

---

## Level 2 — Sovereign Regulators / Independent Safety Boundaries

### Guardian

Owns: capability authorization, policy enforcement, execution gates.

Can:
- approve
- deny
- reject
- constrain
- validate capability grants
- enforce schema and policy boundaries

Cannot:
- become a content-generation worker
- replace Overseer
- redefine factory objective independently

### Slayer

Owns: emergency enforcement and worker/lease revocation.

Can:
- detect operational anomalies
- trip circuit breakers
- evict stale workers
- revoke leases
- kill failing execution
- create forensic cases
- correlate incidents

Cannot:
- become factory planner
- rewrite production policy
- replace Overseer strategy

### Healer

Owns: bounded recovery and remediation.

Can:
- apply approved repair actions
- requeue transient work
- recover bounded infrastructure failures
- execute bounded artifact repair
- preserve / restore Last-Known-Good
- submit repaired state for verification

Cannot:
- perform unlimited retries
- overwrite verified baselines with unverified candidates
- declare final success independently of verification

---

# 2. Cross-cutting verification authority

Verification is not an ordinary worker hierarchy. It is an independent evidence boundary.

## Auditor

Owns:
- non-destructive attestation
- media checks
- factual / provenance checks
- economic / quota checks
- verification receipts
- structured findings

Cannot:
- mutate the artifact it audits
- approve its own work
- become a production generator

## Floor 07

Floor 07 is the production-floor implementation of final QA / compliance.

Critical distinction:

~~~
Guardian != Floor 07
Auditor != production creator
F07 != sovereign command plane
~~~

Guardian is a control authority.

F07 is a production verification floor.

---

# 3. Level 3 — Specialized floor workers

Workers are bounded execution units.

Canonical implementation concepts:
- apps/web/factoryos/core/agent/
- worker runtime / worker contracts
- apps/web/factoryos/core/hierarchy/FloorRegistry.ts
- AgentRuntime
- lease / fencing infrastructure

Workers:
- receive task contracts
- receive only authorized capabilities
- execute specialized work
- checkpoint
- emit structured outputs
- report failures
- remain lease-bound
- remain fenced
- cannot redefine their own authority

Workers do not own factory strategy, policy, or architecture.

---

# 4. Runtime boundary — infrastructure, not authority

The Agent Runtime Harness is not a hierarchy level.

Primary source:
apps/web/factoryos/core/agent/AgentRuntime.ts

Responsibilities:
- session lifecycle
- execution budgets
- timeouts
- capability checks
- checkpointing
- resumability
- TraceContext propagation
- task execution isolation

Relationship:

~~~
Overseer / regulator decision
        |
        v
AgentRuntime
        |
        v
Worker
~~~

AgentRuntime is technical enforcement infrastructure, not sovereign authority.

---

# 5. ShortForge Cognitive Layer hierarchy

SCL exists under the Overseer and beside, not above, the regulators.

~~~
OVERSEER
   |
   v
SHORTFORGE COGNITIVE LAYER
   |
   +-- Cognitive Router
   |
   +-- Context Compiler
   |
   +-- Fast Decision Core
   |     +-- choice
   |     +-- score
   |     +-- yes/no
   |
   +-- ShortForge Cognitive Model
   |     +-- planning
   |     +-- diagnosis
   |     +-- synthesis
   |     +-- template design
   |     +-- architecture reasoning
   |
   +-- Worker Brain
   +-- Template / Engine reasoning
   +-- Decision Records
   +-- Research / Architecture interpretation
~~~

SCL can:
- interpret mission state
- build compact working context
- choose among already-authorized actions
- generate worker task contracts
- diagnose failures
- propose repair strategies
- design templates
- interpret research
- generate architecture proposals
- produce training/evaluation candidates

SCL cannot:
- bypass Guardian
- revoke leases directly
- kill workers directly
- declare physical success without verification
- silently alter production contracts
- silently promote a model
- overwrite Last-Known-Good
- become sovereign authority

---

# 6. SCL internal cognition hierarchy

## Tier 0 — Deterministic cognition

Use code, lookup, or cached truth whenever the answer is deterministic.

Examples:
- floor successor
- capability eligibility
- verified artifact hash lookup
- fixed DAG transition
- known retry rule
- provider circuit state
- template capability registry

No neural inference should be invoked unnecessarily.

## Tier 1 — Fast Decision Core

High-frequency bounded decisions.

Examples:
- worker selection
- provider selection
- template selection
- ranking
- quality score
- risk score
- escalation decision
- repair-family classification
- retrieval-needed decision

Target architecture:

~~~
compact state
   |
shared encoder
   |
multiple typed heads
   |
decision pack
~~~

The Fast Decision Core may be JEV/Laya-inspired. This map does not claim current implementation of Jev or Laya.

## Tier 2 — ShortForge Cognitive Model

The project deep fine-tuned LLM.

Use for:
- multi-step diagnosis
- research synthesis
- planning
- unfamiliar failure analysis
- template construction
- architecture reasoning
- worker replanning
- novel problems

## Tier 3 — Exceptional external / heavyweight reasoning

Use only when local capability is insufficient.

External models remain subordinate to:
- factory policy
- Guardian gates
- verification
- source-of-truth rules
- Overseer authority

---

# 7. Cognitive decision cascade

~~~
REQUEST
  |
  v
Can deterministic logic answer?
  |
  +-- YES -> deterministic result
  |
  +-- NO
       |
       v
Fast Decision Core
       |
       +-- high confidence -> continue
       |
       +-- low confidence / insufficient scope
              |
              v
ShortForge Cognitive Model
              |
              +-- sufficient -> continue
              |
              +-- exceptional / high-authority / novel
                     |
                     v
Overseer / approved heavyweight reasoning
~~~

Absolute rule:

The next tier is invoked because the lower tier is insufficient, not because the larger model is always preferred.

---

# 8. Overseer internal component mapping

Current OverseerControlPlane.ts maps to:

| Component | Responsibility | Authority |
|---|---|---|
| AutonomousScheduler / mission intake | schedule-driven mission intake | Overseer intake |
| MissionManager | mission lifecycle | Overseer-owned |
| TaskDAGPlanner | canonical DAG construction | Overseer planning |
| TaskDAGExecutor | bounded asynchronous execution | Overseer execution |
| OverseerThinkingController | strategic / deliberate reasoning control | Overseer support |
| DecisionLedger | append-only decision records | Overseer audit |
| CognitivePlaneEngine | current cognitive infrastructure | under Overseer |
| CognitiveRuntime | incident / reasoning runtime | under Overseer |
| CapabilityRouter | capability-based dispatch | bounded by policy |
| StrategicMetaThinker | strategy/meta reasoning | Overseer support |
| OverseerPresenceEngine | operational telemetry/presence | Overseer observability |
| VerificationEngine | media/quality verification | independent verification |
| ResearchRuntime | research execution | F00 / research |
| VoiceFabric | voice/audio synthesis | F04 |
| RenderFabric | render orchestration | F06 |
| TemplateRegistry | template inventory | shared cognitive/production |
| TemplateProductionPipeline | template production | shared service |
| DecisionEngine | current decision mechanism | migration candidate toward future Fast Decision Core |

These are implementation mappings, not proof that every future SCL abstraction is already implemented.

---

# 9. Guardian mapping

Flow:

~~~
Overseer task
   |
Guardian pre-gate
   +-- schema
   +-- capability
   +-- budget
   +-- risk
   |
   v
Worker execution
   |
Guardian post-gate
   +-- output schema
   +-- policy
   +-- provenance
   +-- artifact integrity
   |
   v
Next stage
~~~

Current implementation note:

GuardianManager.ts currently registers default Guardians for:
- F01 Strategy
- F02 Scripting
- F03 Asset Realization
- F07 Compliance

Therefore:
- Current implementation: selected-floor Guardian instances.
- Target architecture: Guardian enforcement at every required production boundary.

---

# 10. Slayer mapping

Master coordinator:
apps/web/factoryos/core/slayers/SlayerEngine.ts

Current specialized Slayer agents:
- GeneralPatrolSlayer
- ComputeSlayer
- PipelineSlayer
- RenderingSlayer
- QualitySlayer
- SecuritySlayer

Relationship:

~~~
SLAYER ENGINE
   +-- general patrol
   +-- compute
   +-- pipeline
   +-- rendering
   +-- quality
   +-- security
         |
         v
case detection / anomaly correlation
         |
         +--> Healer
         +--> Overseer
         +--> Human
~~~

"One Slayer" means one factory-level coordinator, not one detector implementation.

---

# 11. Healer mapping

Current healing infrastructure includes:
- HealerEngine.ts
- BoundedRepairEngine.ts
- RepairDeduplicator.ts
- RepairDependencyAnalyzer.ts
- RepairLockManager.ts
- TransactionalRepairGate.ts
- SpecializedHealers.ts

Absolute repair path:

~~~
Finding / Case
   |
Healer diagnosis
   |
Repair plan
   |
repair gate
   |
bounded mutation
   |
verification
   +-- PASS -> promote
   |
   +-- FAIL -> next bounded attempt / LKG rollback
~~~

Implementation invariant:

BoundedRepairEngine.ts defaults to 2 attempts when maxBudget is omitted.

Any older .okf wording that says 3 attempts is subordinate to executable behavior and should be normalized.

---

# 12. ReMaker mapping

Role:
Surgical artifact reconstruction for already-produced media.

Path:

~~~
F07 finding
   |
identify defective dependency
   |
load TimelineIR / lineage
   |
patch smallest affected segment
   |
rebuild affected dependency subtree
   |
F07 re-verification
~~~

Boundary:

~~~
Healer  = bounded recovery authority
ReMaker = surgical artifact reconstruction mechanism
~~~

Neither can bypass verification.

Status note:
The hierarchy documentation identifies apps/web/factoryos/core/remaker/, but the current repository tree lookup did not resolve that directory directly. The implementation location is therefore a reconciliation item, not an implementation fact.

---

# 13. Auditor / Validator / F07 mapping

These concepts are separate.

Auditor:
- independent, read-only attestation

F07:
- production verification floor

ValidatorAgent:
- current independent invariant verification implementation for case resolution
- source: apps/web/factoryos/core/validator/ValidatorAgent.ts

Relationship:

~~~
Production worker
   |
artifact
   |
Auditor / F07 checks
   |
Finding / Receipt
   |
Healer / ReMaker if needed
   |
repaired artifact
   |
verification again
   |
publishable after verification
~~~

A creator must not be the final attestor of its own result.

---

# 14. Agent Runtime mapping

~~~
Overseer
  |
Task / Worker Contract
  |
AgentRuntime
  +-- session
  +-- budget
  +-- capability gate
  +-- timeout
  +-- checkpoint
  +-- TraceContext
  |
  v
Worker
  |
result
~~~

AgentRuntime provides infrastructure enforcement.

Guardian owns policy authorization.

Slayer owns emergency revocation.

These responsibilities must remain separate.

---

# 15. Canonical production floor mapping

The topology is fixed by apps/web/factoryos/core/hierarchy/FloorRegistry.ts.

~~~
F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07
~~~

## F00 — Analyst & Research Ingestion

ID: floor00_analyst
Category: RESEARCH
Required agent type: FLOOR_ANALYST

Purpose:
- source discovery
- research ingestion
- evidence capture
- provenance
- candidate slate
- freshness / duplication analysis

Consumes:
- schedule
- research sources
- external research systems
- AgentReach / Reach outputs

Produces:
- research candidates
- evidence
- claims
- Research IR
- research passport / source records

Feeds: F01

## F01 — Strategic Direction & Research

ID: floor01_strategy
Category: PLANNING
Required agent type: FLOOR_STRATEGY

Consumes:
- F00 research
- evidence
- audience/channel memory
- content-engine capabilities

Produces:
- strategy
- audience interpretation
- narrative direction
- selected production route

Feeds: F02

## F02 — Cognitive Scripting & Structure

ID: floor02_scripting
Category: CREATIVE
Required agent type: FLOOR_SCRIPTING

Consumes:
- F01 strategy
- verified claims
- narrative constraints
- template constraints

Produces:
- script
- beat structure
- scene structure
- retention plan
- voice requirements
- visual requirements
- timeline metadata

Forks into:
- F03
- F04

## F03 — Visual Asset Realization & Blueprints

ID: floor03_asset_realization
Category: MEDIA
Required agent type: FLOOR_ASSET_REALIZATION
Runs: parallel with F04

Consumes:
- F02 scene structure
- visual plan
- template
- content-engine capability profile

Produces:
- visual assets
- scene blueprints
- asset provenance
- visual timing metadata

Converges into: F05

## F04 — Voice & Audio Synthesis

ID: floor04_media_synthesis
Category: VOICE
Required agent type: FLOOR_MEDIA_SYNTHESIS
Runs: parallel with F03

Consumes:
- F02 script
- voice profile
- pronunciation data
- timing constraints

Produces:
- audio
- speech timings
- pronunciation metadata
- audio quality measurements

Converges into: F05

## F05 — Timeline Composition & Motion

ID: floor05_timeline_composition
Category: COMPOSITION
Required agent type: FLOOR_TIMELINE_COMPOSITION

Consumes:
- verified F03 assets
- verified F04 audio
- scene structure
- template constraints

Produces:
- TimelineIR
- track relationships
- timing map
- motion instructions
- RenderIntent

Invariant:
F05 convergence requires required F03 and F04 outputs to be verified.

## F06 — Video GPU Rendering Engine

ID: floor06_rendering
Category: RENDER
Required agent type: FLOOR_RENDERING

Consumes:
- TimelineIR / RenderIntent
- render requirements
- compute capability constraints

Produces:
- physical rendered artifact
- render telemetry
- artifact digest
- runtime information

Uses:
- ComputeRouter
- provider adapters
- worker leases
- fencing
- CAS / artifact storage

## F07 — QA Gate & Social Compliance

ID: floor07_compliance
Category: VERIFICATION
Required agent type: FLOOR_COMPLIANCE

Consumes:
- rendered artifact
- source script
- policy
- verification rules
- physical media telemetry

Produces:
- verification result
- structured findings
- compliance outcome
- verification receipt when passed

F07 produces evidence; it does not create factory authority.

---

# 16. Floor-to-control mapping

| Floor | Primary worker | SCL role | Guardian role | Slayer role | Healer role | Verification |
|---|---|---|---|---|---|---|
| F00 | research worker | evidence/context/source reasoning | capability/schema gate | source/runtime anomaly detection | bounded research recovery | claim/evidence audit |
| F01 | strategy worker | strategy support | policy boundary | execution anomaly detection | strategy recovery | rationale/evidence audit |
| F02 | scripting worker | cognitive scripting / claim checks | policy + capability | anomaly detection | bounded script repair | factuality audit |
| F03 | visual worker | visual planning/template matching | capability gate | worker/resource anomaly detection | asset repair | asset/provenance audit |
| F04 | audio worker | voice/profile/timing reasoning | capability gate | provider/audio anomaly detection | synthesis recovery | audio forensic audit |
| F05 | timeline worker | template/constraint reasoning | composition boundary | pipeline anomaly detection | timeline repair | timeline validation |
| F06 | render worker | provider/compute choice | compute capability boundary | GPU / worker enforcement | render recovery | physical media checks |
| F07 | verification worker | explanation/triage support | policy boundary | quality anomaly detection | repair dispatch | final attestation |

---

# 17. Authority flow vs cognition flow

These are different graphs.

## Authority flow

~~~
Human
  |
  v
Overseer
  |
  +--> Guardian
  +--> Slayer
  +--> Healer
  |
  v
Runtime / Worker
~~~

## Cognition flow

~~~
Observation
  |
Context Compiler
  |
Fast Decision Core
  |
ShortForge Cognitive Model
  |
Worker Contract
  |
Execution
~~~

## Verification flow

~~~
Execution
  |
Evidence
  |
Auditor / F07
  |
Finding / Receipt
~~~

## Learning flow

~~~
Verified trajectory
  |
Memory / Knowledge
  |
Ascalon training candidate
  |
Evaluation
  |
Devourer
  |
Candidate improvement
  |
Canary
  |
Promotion
~~~

None of these flows may silently replace another.

---

# 18. Failure flow

~~~
Worker / provider failure
        |
Telemetry / event
        |
Slayer detection
        |
Case creation
        |
SCL cognitive diagnosis
        |
Healer repair strategy
        |
Bounded repair gate
        |
Verification
     +--+--+
     |     |
   PASS   FAIL
     |     |
 resolve  retry within budget
               |
               v
         LKG rollback if exhausted
~~~

Boundary:
SCL may diagnose or recommend.
Slayer enforces.
Healer repairs.
Validator / F07 verifies.
Overseer coordinates.
Human handles exceptional authority.

---

# 19. Worker lifecycle mapping

~~~
Worker Task Contract
      |
Guardian authorization
      |
Lease acquisition
      |
Fencing token
      |
AgentRuntime session
      |
Worker execution
      |
Heartbeat / telemetry
      |
Artifact / result
      |
Guardian post-gate
      |
Verification
      |
Accept / repair / retry / replan / escalate
      |
Record trajectory
      |
Memory / Ascalon
~~~

Worker cannot:
- self-grant capabilities
- self-extend lease without lease authority
- ignore fencing
- change its own contract
- bypass verification
- directly rewrite global policy

---

# 20. Cognitive worker contract mapping

Every worker cognitive assignment is conceptually:

~~~
WorkerTaskContract
+-- workerId
+-- floorId
+-- specialization
+-- objective
+-- inputs
+-- constraints
+-- allowedCapabilities
+-- toolBudget
+-- successCriteria
+-- verificationCriteria
+-- escalationPolicy
+-- memoryRefs
~~~

SCL constructs this package.

Guardian validates the authority boundary.

AgentRuntime enforces execution constraints.

Worker executes it.

F07 / Auditor verifies the resulting evidence.

---

# 21. Content-engine template hierarchy

Templates are production contracts, not just prompts.

~~~
Content Engine
   |
Engine Capability Profile
   |
SCL Template Planner
   |
Versioned Template
   +-- input schema
   +-- prompt structure
   +-- scene limits
   +-- duration rules
   +-- asset requirements
   +-- voice requirements
   +-- TimelineIR mapping
   +-- render requirements
   +-- verification rules
   +-- fallback engine
   +-- provenance
~~~

Authority:
- SCL proposes / designs.
- Registry stores.
- Production consumes.
- Guardian validates policy/capability boundary.
- Verification tests resulting artifacts.

A template cannot silently alter the production contract.

---

# 22. Compute / rendering hierarchy

~~~
TimelineIR
  |
RenderIntent
  |
ComputeRouter
  |
ProviderAdapter
  |
RenderJob
  |
Worker
  |
Lease + fencing
  |
Render
  |
CAS
  |
Callback
  |
F07 verification
~~~

SCL may select or rank provider candidates.

Guardian / compute policy authorizes the capability.

Slayer can revoke execution.

Worker performs the render.

F07 verifies the physical artifact.

---

# 23. Memory and knowledge hierarchy

Memory is not authority.

~~~
Observed execution
   |
Working memory
   |
Verification
   |
Typed memory / KnowledgeOS
   |
Long-term promotion
   |
Future context retrieval
~~~

SCL consumes memory.

SCL does not decide that unverified memory is truth.

Memory promotion is evidence-gated.

---

# 24. Research hierarchy

External intelligence follows:

~~~
AgentReach / external source
        |
raw research
        |
source capture
        |
claim extraction
        |
evidence
        |
Research IR
        |
SCL interpretation
        |
candidate pattern
        |
validation
        |
ArchitectureProposal / Knowledge
        |
promotion
~~~

External research never outranks:
1. executable implementation
2. canonical contracts
3. tests
4. provider/runtime configuration
5. authoritative .okf
6. external reference material

---

# 25. Ascalon / training hierarchy

Training data must be traceable to real, verified system behavior.

~~~
WorldState
   +
TraceContext
   +
verified artifact / finding / outcome
   |
trajectory
   |
quality filter
   |
training candidate
   |
SFT / DPO / RLVR candidate
   |
evaluation
   |
model candidate
~~~

Ascalon does not treat synthetic hallucinated trajectories as production truth.

---

# 26. Devourer hierarchy

Devourer is a program, not a sovereign authority.

~~~
External discovery
      |
Devourer research
      |
compare with current architecture
      |
prototype
      |
benchmark
      |
candidate model / architecture
      |
evaluation gates
      |
canary
      |
promotion decision
~~~

Devourer cannot:
- replace Overseer authority
- replace Guardian policy
- replace F07 verification
- directly rewrite production weights
- promote unverified architecture
- turn external evidence into canonical truth without validation

---

# 27. Absolute ownership matrix

| Entity | Owns | Recommends | Executes | Verifies | Can deny | Can revoke | Can change architecture |
|---|---|---:|---:|---:|---:|---:|---:|
| Human Authority | ultimate authority | yes | exceptional/manual | yes | yes | yes | yes |
| Overseer | mission + orchestration | yes | dispatches | coordinates | via authority path | requests Slayer | review/promote path |
| SCL | cognition | yes | no physical execution | no final physical verification | no sovereign denial | no | proposes only |
| Guardian | capability/policy gates | yes | no production work | gate checks | yes | scoped grant denial | no |
| Slayer | enforcement | yes | kill/revoke | forensic evidence capture | isolate | yes | no |
| Healer | bounded remediation | yes | repair | no final authority | no | no | no |
| ReMaker | surgical reconstruction | yes | targeted artifact repair | no final authority | no | no | no |
| Auditor/F07 | evidence verification | yes | audit | yes | verification rejection | no | no |
| Worker | specialized execution | limited | yes | self-check only | no authority | no | no |
| AgentRuntime | execution enforcement | no | infrastructure | no | technical enforcement only | session/timeout handling | no |
| Memory/Knowledge | typed memory | retrieval support | no | promotion gate dependent | no | no | no |
| Ascalon | training/evaluation | candidate learning | model training | evaluation | no authority | no | no |
| Devourer | controlled improvement | yes | experiment only | candidate validation | no sovereign authority | no | promotion only through gates |

---

# 28. Who decides what?

Factory objective:
**Overseer**

Human override:
**Human Authority**

Whether an action is authorized:
**Guardian**

Which eligible worker should be considered:
**SCL / Fast Decision Core**

Deep diagnosis:
**SCL / ShortForge Cognitive Model**

Whether stale execution must be removed:
**Slayer**

How to repair a verified defect within limits:
**Healer**

How to surgically rebuild the smallest artifact:
**ReMaker**

Whether physical output is valid:
**F07 / Auditor / independent Validator**

How the task is actually performed:
**Worker**

How the worker session is technically constrained:
**AgentRuntime**

What should be learned from verified execution:
**Ascalon / Memory / Knowledge pipeline**

What architecture/model changes should be explored:
**Devourer + SCL proposal path**

What becomes production truth:
**explicit gated promotion under established authority and source-of-truth rules**

---

# 29. Who must not decide?

| Entity | Must not decide |
|---|---|
| SCL | its own authority boundary |
| Fast Decision Core | irreversible high-authority architecture changes |
| Worker | its own capabilities |
| Guardian | factory business objective |
| Slayer | production strategy |
| Healer | unlimited retry policy |
| ReMaker | whether its own repair is finally valid |
| F07 | its own creation quality by self-certification |
| AgentRuntime | architecture |
| Memory | truth without verification |
| AgentReach | factory policy |
| Devourer | silent production promotion |

---

# 30. Absolute do-not-confuse rules

1. Overseer != SCL
2. SCL != worker
3. SCL != Guardian
4. Guardian != F07
5. Slayer != Healer
6. Healer != ReMaker
7. Auditor != creator
8. AgentRuntime != authority
9. Memory != truth
10. Research != verified factory rule
11. Devourer != unrestricted self-modification
12. Fast Decision Core != full cognitive model
13. F06 rendering != verification
14. F07 verification != production orchestration
15. Design target != implemented capability

---

# 31. Canonical state progression

~~~
Schedule
  |
ScheduleInstance
  |
Mission
  |
Overseer plan
  |
Worker contracts
  |
F00
  |
F01
  |
F02
  |
F03 || F04
  |
F05
  |
F06
  |
F07
  |
Verification Receipt
  |
Delivery / Outbox
  |
Telemetry / Memory
  |
Ascalon trajectory
  |
Devourer improvement candidate
~~~

Failure diversion:

~~~
any stage
  |
Case / anomaly
  |
Slayer
  |
Healer / ReMaker
  |
re-verification
  |
resume / retry / rollback / escalate
~~~

---

# 32. Canonical control-loop model

Every subsystem should be understandable as:

~~~
OBSERVE
  |
DECIDE
  |
EXECUTE
  |
VERIFY
  |
RECORD
  |
LEARN
~~~

The identity of DECIDE changes by layer:
- deterministic rule
- Fast Decision Core
- ShortForge Cognitive Model
- Overseer
- Guardian
- Slayer
- Healer
- human

Authority depends on the layer, not on model intelligence.

---

# 33. Current implementation vs target hierarchy

| Area | Current evidence | Target |
|---|---|---|
| Human Authority | external governance | same |
| Overseer | implemented | broader strategic autonomy |
| 8-floor registry | implemented in FloorRegistry.ts | remain single source of truth |
| DAG planning | implemented | richer dynamic sub-DAGs |
| AgentRuntime | implemented | deeper distributed supervision |
| Guardian | implemented for selected floors | broader boundary coverage |
| Slayer | implemented master coordinator + specialized slayers | stronger predictive anomaly/revocation |
| Healer | implemented bounded repair | learned repair ranking within strict gates |
| ReMaker | architecture documented; implementation path needs reconciliation | full surgical artifact reconstruction |
| F07 / verification | implemented infrastructure | stronger forensic / social compliance |
| SCL | design architecture | full worker cognition layer |
| Fast Decision Core | target | trained, calibrated, warm, batched local decision service |
| ShortForge Cognitive Model | target role | project-owned fine-tuned cognitive model |
| Context Compiler | target | production compact context compiler |
| Devourer | design program | gated autonomous improvement pipeline |
| Ascalon | training architecture | continuous verified trajectory learning |

---

# 34. Known documentation / implementation mismatches

## 34.1 Authority numbering mismatch

Canonical root architecture states:

~~~
L0 Human
L1 Overseer
L2 Regulators
L3 Workers
~~~

Some individual .okf/hierarchy headers use different numeric labels.

Resolution for this map:
The root .okf/index.md and .okf/architecture.md hierarchy is treated as canonical numbering. Individual headers should be normalized later.

## 34.2 Guardian coverage mismatch

Design documents describe Guardians broadly across manufacturing boundaries.

Current GuardianManager.ts registers:
- F01
- F02
- F03
- F07

Resolution:
Current implementation is partial; broader coverage remains target architecture.

## 34.3 Healer repair-budget mismatch

Some older hierarchy prose references a default repair budget of 3.

Current BoundedRepairEngine.ts uses:
maxBudget = options.maxBudget ?? 2

Resolution:
Executable implementation is canonical for current behavior. Normalize documentation to 2 unless implementation changes.

## 34.4 ReMaker implementation-path mismatch

Hierarchy documentation names apps/web/factoryos/core/remaker/, but the current repository tree lookup did not resolve that directory directly.

Resolution:
Keep ReMaker as an architectural role while treating the exact executable path as unresolved until code discovery reconciles it.

---

# 35. Absolute source-of-truth hierarchy

When descriptions conflict, resolve in this order:

1. executable implementation
2. canonical ontologies / contracts
3. automated tests
4. provider registries / runtime configuration
5. inline architecture comments
6. authoritative .okf
7. historical audits
8. external patterns
9. inference

This applies to:
- authority
- floor topology
- worker behavior
- model routing
- repair budgets
- provider behavior
- status claims
- capability claims

---

# 36. Absolute future-research rule

Before adding any new ShortForge architecture, inspect:

~~~
.okf/index.md
.okf/hierarchy-map.md
.okf/architecture.md
.okf/principles.md
.okf/terminology.md
.okf/hierarchy/
.okf/intelligence/
.okf/memory/
.okf/research/
.okf/cognitive/
.okf/decisions.md
~~~

Then inspect the relevant implementation and tests.

Classify the idea as exactly one:
- already exists
- extends existing rule
- contradicts existing rule
- new capability
- experiment only

Never create a new architecture node merely because a new repository or paper describes a similar concept.

---

# 37. Canonical one-page mental model

~~~
                         HUMAN AUTHORITY
                               |
                               v
                    OVERSEER / COMMAND
                               |
            +------------------+------------------+
            |                  |                  |
            v                  v                  v
           SCL             GUARDIAN             SLAYER
        cognition          authorize            enforce
            |                                     |
            |                                     |
            v                                     v
      worker cognition                         kill / revoke
            |
            v
      AGENT RUNTIME
            |
            v
       WORKER SWARMS
            |
            v
F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07
                                      |         |
                                      |         v
                                      |     verification
                                      |         |
                                      v         v
                                  artifacts / findings
                                      |
                         +------------+------------+
                         |                         |
                         v                         v
                      HEALER                    REMAKER
                    bounded repair          surgical rebuild
                         |                         |
                         +------------+------------+
                                      |
                                      v
                                   F07 again
                                      |
                                      v
                                 VERIFIED OUTPUT
                                      |
                                      v
                           MEMORY / KNOWLEDGE
                                      |
                                      v
                                   ASCALON
                                      |
                                      v
                                  DEVOURER
                                      |
                                      v
                       gated model / architecture
                              improvement
~~~

---

# 38. Final absolute rules

1. There is one sovereign operational authority: Overseer.
2. Human Authority remains above Overseer.
3. SCL is the cognitive substrate beneath Overseer.
4. Intelligence does not imply authority.
5. Fast Decision Core handles frequent narrow decisions.
6. ShortForge Cognitive Model handles deeper reasoning.
7. Guardian authorizes.
8. Slayer revokes / kills.
9. Healer repairs within bounded budgets.
10. ReMaker reconstructs the smallest affected artifact.
11. Workers execute.
12. F07 / Auditor verifies.
13. AgentRuntime enforces execution mechanics.
14. Memory records; it does not declare truth.
15. External research informs; it does not become policy automatically.
16. Ascalon learns only from verified trajectories.
17. Devourer experiments and proposes; gated promotion creates production truth.
18. No component may silently cross its authority boundary.
19. No target architecture may be described as implemented without evidence.
20. Use the smallest sufficient cognition to safely advance the state machine.

---

# 39. Related canonical documents

- .okf/index.md
- .okf/architecture.md
- .okf/principles.md
- .okf/terminology.md
- .okf/decisions.md
- .okf/decision-protocol.md
- .okf/security/worker-permissions.md
- .okf/engineering-stack.md
- .okf/production-helper.md
- .okf/devourer.md
- .okf/hierarchy/overseer.md
- .okf/hierarchy/guardian.md
- .okf/hierarchy/slayer.md
- .okf/hierarchy/healer.md
- .okf/hierarchy/remaker.md
- .okf/hierarchy/auditor.md
- .okf/hierarchy/worker.md
- .okf/cognitive/README.md
- .okf/cognitive/layer-contract.md
- .okf/cognitive/performance.md
- .okf/cognitive/devourer.md
- .okf/intelligence/agent-runtime.md
- .okf/intelligence/model-routing.md
- .okf/intelligence/context.md


## 39. Governance-linked hierarchy contracts

The absolute hierarchy is further constrained by these canonical contracts:

- `.okf/security/worker-permissions.md` — exact worker capability boundaries.
- `.okf/engineering-stack.md` — media-engine hierarchy and compiler boundary.
- `.okf/production-helper.md` — routine evidence-generation boundary.
- `.okf/decision-protocol.md` — mandatory decision-analysis process.
- `.okf/devourer.md` — controlled self-improvement boundary.

These documents refine responsibilities; they do not create new sovereign authorities.


## 9. Engineering Workforce Boundary — Forgers

Forgers are a **development-time engineering workforce outside the F00-F07 production hierarchy**.

Human / Repository authority
        |
        v
Overseer / engineering direction
        |
        v
Forger Assembly
        |
        +--> Architect
        +--> Builder
        +--> Browser
        +--> Sentinel
        +--> Evaluator
        +--> Media
        +--> Knowledge
        +--> Reliability
        +--> Performance
        +--> Visualization
        +--> Release
        |
        v
Branch + Evidence + Tests + PR

The Forger Assembly may prepare changes to production components, but it cannot promote those changes by itself.

Production authority remains:
Human -> Overseer -> Guardian / regulators -> AgentRuntime -> Workers -> F07 -> ReleaseAuthorization

Security Forgers are evidence producers. Evaluation Forgers are judges. Release Forgers prepare releases. None of them become sovereign merely because they operate outside the production worker hierarchy.


## Content Engine → Configuration → ProductionSpec Boundary

The existing Content-engine template hierarchy is extended with an explicit runtime compilation boundary:

```text
Content Engine
   ↓
Engine Capability Profile
   ↓
Engine Manifest
   ├── input/data contract
   ├── research contract
   ├── creative/cognitive contract
   ├── asset/voice contract
   ├── timeline/render contract
   └── verification contract
   ↓
ConfigurationSchema
   ↓
Creator Intent
   ↓
ProductionSpecCompiler
   ↓
Immutable ProductionSpec
   ↓
F00–F07 floor projections
```

The dashboard is only a schema renderer. It is not an independent configuration authority.

ProductionSpec cannot grant worker capabilities, bypass .okf, override Guardian/Slayer controls, or bypass F07.

## 10. Development-Time Team Boundary

Team is outside the F00-F07 production hierarchy.

Human / repository governance
  ↓
.okf authority and canonical implementation
  ↓
Team Change Gate
  ↓
Forger Assembly
  ├─ Architecture
  ├─ Build
  ├─ Browser
  ├─ Security
  ├─ Evaluation
  ├─ Media
  ├─ Knowledge
  ├─ Reliability
  ├─ Performance
  ├─ Visualization
  └─ Release
  ↓
evidence / report / authorized disposition

Team agents cannot exercise production-floor authority merely because they participated in a change.
