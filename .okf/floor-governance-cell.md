# Floor Governance Cell — Canonical Architecture

**Classification:** new capability  
**Status:** Final governance wave implemented and validated on `feat/floor-governance-cell-wave1-20260928`  
**Scope:** one governed ShortForge production floor.

## Decision

ShortForge floors use a closed Floor Governance Cell (FGC) pattern. A floor is not represented by one unrestricted autonomous model.

The FGC consists of:

```
Floor Guardian
  ↓
Ascalon cognitive layer
  ↓
Instructor / Advisor / Auditor
  ↓
Floor Blackboard
  ↓
Border Defence Agent
  ↓
Workers
  ↓
BDA egress / verification
  ↓
incident handling
  ↓
FG-Healer + delegated Common Healer
  ↓
BDA → Auditor → Guardian closure
```

## Non-negotiable authority separation

- Overseer is global authority.
- Floor Guardian is highest authority inside its floor.
- Ascalon is cognition, not sovereignty.
- Ministers provide typed counsel.
- BDA is boundary judge.
- Workers execute bounded capabilities.
- Healers repair bounded resources.
- Auditor independently verifies.
- F07 remains final production verification/release authority.

## Core doctrine

> **Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.**

## Action Graph rule

Every executable action has a typed contract and known graph transition.

A model may choose among permitted actions. It cannot define a new authority-bearing action merely through generated text.

## Trust rule

Evidence and operational text are inputs to cognition, not executable instructions.

Authorization derives only from trusted, typed runtime state and explicit capability/policy grants.

## Resolution rule

A repair claim does not close an incident.

Closure requires independent proof and Guardian authorization:

```
BDA reinspection
  + Auditor verification
  + Guardian closure grant
  = resolution proof
```

## Healing rule

Do not globally lock an incident.

Lock/lease the mutation resources.

Parallelize thinking; serialize or lease conflicting mutations; fence stale holders.

## Source-of-truth precedence

1. executable implementation
2. canonical contracts / ontology
3. automated tests
4. runtime configuration / provider registries
5. authoritative .okf documents
6. historical reports
7. external research
8. architectural inference

A locked decision is a design commitment, not implementation proof.

## Current wave status

### Implemented

- governance contracts
- action graph
- action gate
- Blackboard
- Ascalon proposal seam
- BDA foundation
- Joint Healing session foundation
- mutation fencing
- ResolutionGate
- negative tests

### Implemented and validated

- Guardian runtime orchestration
- durable floor Blackboard state
- production Python BDA placement
- ResolutionGate enforcement on direct legacy resolution
- durable paired healer scheduling for high-risk/non-local incidents
- resource-scoped mutation fencing
- BDA reinspection + independent Auditor + Guardian closure chain

### Remaining program boundaries outside the final FGC wave

- heterogeneous multi-model Advisor diversity
- signed policy and workload identity
- complete provenance/OTel integrations
- comprehensive predictive/adversarial evaluation
- deployment of the actual fine-tuned Ascalon model

## Required documentation discipline

Any future change to the FGC must begin with the current .okf sweep and classify the change as:

- already exists
- extends existing rule
- contradicts existing rule
- new capability
- experiment only

A contradiction must be preserved explicitly and cannot silently overwrite a locked authority rule.

## 21. Wave 2 runtime integration

Wave 2 connects the governance substrate to real FactoryOS control paths:

```text
Guardian observation/audit/plan
          |
          v
   Floor Governance Cell
          |
   typed action + grant
          |
          v
      legacy execution
          |
          v
     physical/system effect
```

### Guardian integration

`GuardianKernel` remains local authority. Its autonomous mutation decisions now cross the Floor Governance Cell before the legacy execution implementation runs.

The governance cell records:
- the Guardian action;
- target scope;
- current floor state version;
- required capability;
- Guardian authorization grant;
- execution outcome.

### Persistent Blackboard

`DiskFloorBlackboardJournal` stores append-only floor cognition/evidence entries under the configured FactoryOS storage directory. Entries are chained with SHA-256 hashes so restart reconstruction can detect journal tampering or truncation.

### Live BDA boundary

`PythonFloorBridge.handleFloorHandoff()` treats execution handoffs as egress from a floor. The handoff is inspected by BDA before world-state mutation. Border decisions are emitted as governance events, and bridge-originated failure cases retain BDA proof as diagnostic evidence.

### Closure hardening

`CaseManager.resolveCase()` is now a legacy compatibility path behind `ResolutionGate`. Direct closure requires explicit `ResolutionProof`. Boot recovery may reconstruct incidents but may not silently close them.

### Current Wave 2 boundary

Implemented: Guardian gate, journal persistence, Python bridge BDA, border events, BDA evidence retention, and direct-resolution gate.

Still not claimed: live Ascalon model execution, complete BDA coverage across every internal floor transition, durable JointHealingSession persistence, graph-aware paired-healing scheduling, workload identity, signed policy bundles, or advanced adversarial evaluation.

See `.okf/decisions/floor-governance-cell-wave2-20260928.md` and `.okf/audits/floor-governance-cell-wave2-audit.md`.\n\n## 22. Wave 3 paired-healing integration\n\nWave 3 is now a validated production path for high-risk or non-local incidents:\n\n```text\nHEALING INCIDENT\n      |\n      v\npaired healer diagnosis (parallel, no mutation)\n      |\n      v\nresource/conflict grouping + fencing lease\n      |\n      v\nbounded mutation + compensation\n      |\n      v\nBDA reinspection\n      |\n      v\nIndependent Auditor\n      |\n      v\nFloor Guardian closure grant\n      |\n      v\nResolutionGate proof\n```\n\nThe existing low-risk healer path remains backward compatible. Restart recovery escalates in-flight physical healing instead of resuming stale mutation.\n\nValidated executable head: `1a53b3dacd3567c3b01b82aed867703c4303b437`. Dedicated Wave-3 run `36389319825`, combined Wave 2–3 run `36389319673`, and Team Change Gate `36389319689` passed.\n\nWave 3 does not claim live fine-tuned Ascalon inference, complete BDA coverage, workload identity, signed policy bundles, or predictive/adversarial prevention.\n\nSee `.okf/decisions/floor-governance-cell-wave3-20260928.md` and `.okf/audits/floor-governance-cell-wave3-audit.md`.

## 23. Wave 4 cognitive council

Wave 4 inserts a bounded Council review between proposal generation and the existing Floor Governance Cell gate:

```
Ascalon proposal
      |
      v
Instructor ---- deterministic contract/action graph
      |
      +---- Advisor ---- CognitiveRuntime advisory assessment
      |
      +---- Auditor ---- deterministic evidence/trust check
      |
      v
Synthesis / conflict check
      |
      +---- conflict / low confidence -> ESCALATE
      |
      v
Floor Governance Cell / Guardian authority
```

The Council cannot mint capability grants, execute workers, revoke leases, or close incidents. It records typed CounselPackets and a reproducible phase trace in the floor governance evidence path.

The current Advisor is the existing CognitiveRuntime. Fine-tuned Ascalon inference remains outside the implemented claim.

Wave 4 is validated on executable head `7473c5c12e93bc365a2b487f6e5244a84358bc9c`.

Dedicated Wave 4 validation `36392648796` passed. Combined Wave 2–3 validation `36392648769` passed. Team Change Gate `36392648822` passed.

During Wave 4, an existing contradiction-resolution regression was hardened: objective GPU/VRAM and disk telemetry now drive contradiction probes, probe confidence is preserved, and verified contradiction confidence propagates into CognitiveRuntime decision confidence.

See `.okf/decisions/floor-governance-cell-wave4-20260928.md` and `.okf/audits/floor-governance-cell-wave4-audit.md`.

## 24. Final governance wave — durable Council and Ascalon admission

The final FGC wave closes the governance implementation roadmap by making Council deliberation durable, feeding bounded verified memory into the Advisor, and defining a typed admission seam for future fine-tuned Ascalon inference.

### Durable Council

```text
Ascalon proposal
      |
      v
proposal fingerprint
      |
      v
durable Council session
      |
      +--> Instructor checkpoint
      |
      +--> Advisor checkpoint + bounded derived memory
      |
      +--> Auditor checkpoint
      |
      +--> Synthesis checkpoint
      |
      v
 CLOSED / ESCALATED
```

Council sessions are persisted per floor through an append-only hash-chained journal. An in-flight session found during restart is escalated rather than resumed.

### Memory boundary

The existing MemoryFabric is reused as derived context. The Council stores memory references, not authority-bearing memory state. Memory availability does not grant permission to execute an action.

### Ascalon admission

```text
Future fine-tuned Ascalon
          |
          v
AscalonInferenceAdmissionGate
   |                    |
 SHADOW              ADMITTED
   |                    |
record only             v
never execute        Floor Council
                         |
                         v
                 existing ActionGate
```

An admitted model proposal is still only a proposal. The gate verifies identity, floor/state version, action availability, input trust, confidence, model metadata and context fingerprint.

The wave does not claim a deployed fine-tuned Ascalon model. The proposal-only adapter remains the production runtime seam until a separately validated inference gateway is connected.

### Final authority invariant

> Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.

The final governance wave does not alter Overseer, Floor Guardian, BDA, ResolutionGate, worker capabilities, or F07 authority boundaries.

Validated executable head: `eb3456fa8e7ad78603d85d7daa6bc1d3d0d1ed49`.
Final-wave validation: `36394051521` PASS.
Cross-wave governance validation: `36394051496`, `36394051567`, `36394051595`, `36394051504`, `36394051501`, `36394051500` all PASS.

See:
- .okf/decisions/floor-governance-cell-final-wave-20260928.md
- .okf/audits/floor-governance-cell-final-wave-audit.md

## 25. Final integration closeout

The FGC governance roadmap and Agent Execution Fabric are now consolidated in `main` through PR #47. The remaining long-running execution gap was closed with durable human approval and restart-safe WAITING state semantics.

Main merge commit: `ac3352487cbfc50bc468b9d512fb0e79ac06244e`.

The authority invariant remains unchanged: **Intelligence proposes. Authority authorizes. Runtime executes. Evidence proves.**

See `.okf/audits/final-integration-closeout-20260928.md`.
