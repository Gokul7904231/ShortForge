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

### Target but not yet fully integrated

- Guardian runtime orchestration
- durable state
- production BDA placement
- full Advisor subsystem
- resolution gate enforcement across legacy callers
- durable paired healer scheduling
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
