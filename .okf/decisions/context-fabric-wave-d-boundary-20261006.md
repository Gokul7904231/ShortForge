# Context Fabric Wave D — Boundary and Legacy Consumer Convergence

Date: 2026-10-06
Issue: #219

## Decision

ContextFabric is the sole production boundary for active working context. Legacy ActiveContextManager and ContextOS implementations remain available only as explicit internal primitives or reference/compatibility code until a later retirement wave proves zero required usage.

## Evidence from main

- CognitivePlaneEngine already routes working-context state through ContextFabric.
- Its `activeContextManager` property is retained only as a deprecated compatibility alias and no longer imports the legacy class directly.
- Repository search found no production runtime consumer of ContextOS APIs.
- Direct ActiveContextManager construction/reference in production code is confined to the canonical ContextFabric primitive itself.
- Tests may continue to exercise the legacy primitive directly while compatibility coverage remains necessary.

## Enforcement

`factoryos:verify:context-fabric-boundary` scans FactoryOS production runtime code and fails on direct ActiveContextManager/ContextOS references outside their canonical primitive files.

The verifier is a blocking step in the Context Fabric Architecture workflow.

## Non-goals

- No CLM inference or training.
- No ContextBench.
- No new database or authority.
- No deletion of legacy primitives before usage and regression evidence support retirement.

## Exit criteria

1. Production mutation of active context enters through ContextFabric.
2. Legacy direct references remain only in allowed primitive files or tests.
3. The boundary check is green in blocking CI.
4. Context Fabric architecture and Team evidence are reconciled.

## Next wave

After this boundary is merged, the next architectural gate is cognitive orchestration convergence behind ContextFabric. CLM remains deferred until the ContextFabric boundary and orchestration paths are proven.
