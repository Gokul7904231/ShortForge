# Floor Governance Cell — Canonical Architecture

**Classification:** new capability  
**Status:** Wave 1 implemented on `feat/floor-governance-cell-wave1-20260928`  
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

### Target but not yet fully integrated

- full Advisor subsystem
- signed policy and workload identity
- provenance/OTel integrations
- predictive/adversarial evaluation

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
