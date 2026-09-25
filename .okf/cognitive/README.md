# ShortForge Cognitive Layer — Cognitive Operating Specification

> Document Class: Target Cognitive Architecture
> Status: PLANNED / DESIGN-CANONICAL; not an implementation claim
> Owner: ShortForge / FactoryOS
> Primary Model: ShortForge Cognitive Model (the project's fine-tuned LLM)
> Self-Improvement Program: Devourer
> Parent Authority: Overseer Supreme Control Plane
> Source-of-Truth Rule: Implementation and tests outrank this document.

## 1. Purpose

The ShortForge Cognitive Layer (SCL) is the dedicated cognitive substrate beneath the Overseer.

The Overseer remains the sovereign operational authority. SCL is the specialized brain that performs high-frequency factory cognition so the Overseer does not need to carry every worker-level decision itself.

Core mission:

> Understand the factory, maintain worker cognition, make bounded decisions quickly, assist every floor, preserve records, and continuously improve the factory's operating knowledge.

SCL is not another public chatbot and not a replacement for the Overseer.

## 2. Position in the hierarchy

~~~
Human Authority
      ↓
Overseer
      ↓
SHORTFORGE COGNITIVE LAYER
      ↓
Worker Brain + Decision Core + Knowledge/IR
      ↓
Guardians / Floor Agents / Workers / Tools
      ↓
Artifacts + Verification + Telemetry
~~~

The Overseer decides what the factory should accomplish and what authority applies.

SCL decides how specialized agents should reason and operate within those authorized boundaries.

Guardian, Slayer, Healer, Auditor, and Floor 07 remain independent enforcement and verification boundaries.

## 3. Responsibilities

SCL must eventually be able to:

1. Maintain operational records and reconstruct relevant state.
2. Act as the cognitive layer for specialized workers.
3. Make high-speed bounded decisions.
4. Maintain the cognitive state of the hierarchy below Overseer.
5. Give each worker the correct task, inputs, constraints, tools, and success criteria.
6. Monitor whether a worker is actually following its specialization.
7. Assist the full end-to-end production cycle.
8. Design or adapt templates for the selected content engine.
9. Assist F00-F07 without owning their physical execution.
10. Consume AgentReach research and analysis.
11. Convert research into structured reusable knowledge.
12. Detect recurring failures and propose architecture improvements.
13. Generate training and evaluation candidates for Ascalon.
14. Feed verified improvements into the controlled Devourer loop.

## 4. End-to-end cognitive cycle

~~~
OBSERVE
  ↓
RECONSTRUCT STATE
  ↓
UNDERSTAND OBJECTIVE
  ↓
SELECT STRATEGY
  ↓
ISSUE WORKER CONTRACT
  ↓
MONITOR EXECUTION
  ↓
INSPECT RESULT
  ↓
VERIFY EVIDENCE
  ↓
ACCEPT / REPAIR / REPLAN / ESCALATE
  ↓
RECORD TRAJECTORY
  ↓
LEARN
~~~

Every stage is trace-linked to the mission, run, worker, tools, and artifacts.

## 5. Worker cognition

For every worker assignment SCL should construct:

~~~
Mission
  ↓
Floor objective
  ↓
Worker specialization
  ↓
Task contract
  ↓
Required inputs
  ↓
Allowed tools/capabilities
  ↓
Constraints
  ↓
Success criteria
  ↓
Verification criteria
  ↓
Fallback / escalation policy
~~~

Workers receive a compact cognitive package, not the entire factory context.

## 6. Memory and records

SCL does not replace MemoryOS or KnowledgeOS.

Minimum cognitive records:

- WorkerState
- WorkerCapabilityProfile
- WorkerTaskContract
- DecisionRecord
- EvidenceRecord
- FailureCase
- RecoveryRecord
- TemplateRecord
- ContentEngineProfile
- ArchitectureProposal
- LearningCandidate
- ModelEvaluation
- CognitiveCheckpoint

Working memory is mission-scoped. Long-term memory is promoted only after verification.

## 7. AgentReach integration

~~~
AgentReach
   ↓
Research result
   ↓
Source / evidence capture
   ↓
Claim extraction
   ↓
Research IR
   ↓
SCL analysis
   ↓
Candidate pattern
   ↓
Validation
   ↓
Knowledge / architecture proposal
~~~

A repository, paper, issue, benchmark, or post may suggest an improvement. It does not automatically become a factory rule.

## 8. Content-engine templates

SCL must be able to design a typed production template for the selected content engine:

~~~
Chosen engine
   ↓
Engine capability profile
   ↓
SCL template planner
   ↓
Template
   ├── input schema
   ├── prompt structure
   ├── scene limits
   ├── duration rules
   ├── asset requirements
   ├── voice requirements
   ├── TimelineIR mapping
   ├── render requirements
   └── verification rules
~~~

Templates are versioned artifacts. A template cannot silently change a production contract.

## 9. High-speed decision design

SCL should prefer the smallest sufficient reasoning path:

~~~
Simple + known + low risk → direct decision
Ambiguous               → retrieve more context
Complex                  → decompose
High risk / irreversible  → verify + Guardian gate
Unknown / novel           → investigate + propose
~~~

The target is fast cognition, not maximum reasoning depth on every request.

## 10. Architecture improvement responsibility

SCL continuously looks for:

- repeated worker failures
- unnecessary handoffs
- duplicated tools
- slow paths
- recurring repair patterns
- provider instability
- schema mismatches
- poor templates
- unsupported engine behavior
- research patterns that can improve a floor
- opportunities to simplify the hierarchy

These become ArchitectureProposal records.

No proposal becomes an implementation fact until it passes the normal source-of-truth and verification rules.

## 11. Model boundary

The ShortForge fine-tuned LLM is the primary cognitive model.

The runtime remains model-agnostic and requests capabilities such as:

- FACTORY_REASONING
- WORKER_PLANNING
- STRUCTURED_DECISION
- RESEARCH_SYNTHESIS
- TEMPLATE_DESIGN
- FAILURE_DIAGNOSIS
- ARCHITECTURE_ANALYSIS

Future smaller decision heads may be added for repetitive low-latency tasks, but they must remain contract-compatible with the main cognitive model.

## 12. Non-negotiable boundaries

SCL must not:

- bypass Guardian authorization
- revoke leases directly
- declare physical success without verification
- treat external research as truth without provenance
- silently modify production contracts
- overwrite Last-Known-Good
- deploy an unverified model candidate
- directly self-rewrite production weights
- turn failed experiments into training truth

Devourer handles controlled model evolution separately.

## 13. Status discipline

Every SCL capability is tagged IMPLEMENTED, PARTIALLY_IMPLEMENTED, SCAFFOLDED, EXPERIMENTAL, or PLANNED.

Target architecture must never be described as current implementation.
