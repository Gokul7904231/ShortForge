# Decision: Context Fabric Durable Persistence

**Date:** 2026-10-06  
**Status:** ACTIVE IMPLEMENTATION WAVE

## Decision

ContextFabric working-context state is durable through the existing MongoDB operational persistence boundary. No new database is introduced.

Two collections are reserved:
- context_workspaces: current durable workspace head.
- context_edit_ledger: immutable edit/audit records keyed by editId.

Mongo remains operational persistence; ContextFabric remains the authority for active working-context semantics.

## Concurrency

Workspace writes support optimistic compare-and-swap using workspaceId + expectedVersion. A stale writer fails with ContextConcurrencyConflictError and must reload/recompute rather than overwrite newer context.

Edit ledger writes are idempotent by editId.

## Reliability boundary

The repository is persistence infrastructure, not a new authority. ContextFabric still owns which references are active, context version/hash semantics, and bounded context operations.

The repository does not decide policy, capabilities, leases, economics, artifact identity, verification, or model promotion.

## Migration

Wave B adds persistence primitives and tests. Automatic durable commit from ContextFabric and direct ContextOS consumer migration remain later gated changes so persistence semantics are proven before becoming hot-path behavior.
