# Context Fabric Wave E — Cognitive Orchestration Convergence

Date: 2026-10-06
Issue: #221

## Decision

Production cognitive runtime enters RLM/context operations through ContextFabric. ContextOrchestrator remains the implementation substrate and is bound once by CognitivePlaneEngine.

## Runtime boundary

- ContextFabric exposes narrow `indexContext` and `runRecursiveInvestigation` entry points.
- CognitiveRuntime no longer directly calls `contextOrchestrator.*`.
- CognitivePlaneEngine wires ContextOrchestrator into ContextFabric.
- The production boundary verifier rejects direct `contextOrchestrator.*` use outside canonical wiring/substrate files.
- Tests may retain direct orchestrator access where they explicitly test the RLM substrate.

## Non-goals

- No CLM inference or training.
- No ContextBench.
- No new database or authority.
- No deletion or replacement of RLM primitives.

## Exit criteria

1. CognitiveRuntime context operations route through ContextFabric.
2. RLM remains a subordinate implementation substrate.
3. Blocking CI enforces the orchestration boundary.
4. Tests cover facade delegation.
5. .okf architecture and Team evidence are reconciled.

## Next wave

Introduce CLM shadow proposals only after the Context Fabric orchestration boundary is proven in CI. CLM proposals remain typed ContextEdit suggestions and cannot bypass ContextFabric.
