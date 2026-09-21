---
name: factoryos-graph
description: Skill for inspecting, validating, projecting, and diffing FactoryOS MissionGraph and SituationGraph IR models.
---

# FactoryOS Mission Graph & Situation IR Skill

## Invariants
1. The graph is NOT truth; it is a projection over canonical execution records and physical evidence.
2. A graph visualization must never invent topology.
3. Stable IDs must be used for nodes and edges; never derive identity from display labels alone.

## Multi-Agent Projections
- `OverseerView`: Operational overview emphasizing mission progress, completed floors, and blockers.
- `SlayerView`: Forensic causal path tracing from failure origin to affected descendants.
- `GuardianView`: Floor boundary contracts and invariant health.

## Validation Rule
Always run `GraphValidator.validate(missionGraph, evidenceGraph)` before rendering or committing graph structures to guarantee zero dangling edges and complete evidence grounding.
