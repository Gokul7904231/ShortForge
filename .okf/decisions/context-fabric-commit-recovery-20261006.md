# Decision: Context Fabric Guarded Durable Commit and Recovery

**Date:** 2026-10-06  
**Status:** ACTIVE IMPLEMENTATION WAVE

## Decision

ContextFabric may durably advance its active working-context head only through the repository atomic commit contract.

A durable commit contains the proposed workspace head, all edit ledger entries that produced that head, and the expected previous workspace version.

Implementations must commit the workspace head and ledger entries together or fail without advancing the durable head.

## Recovery

ContextFabric recovery loads the durable workspace, verifies its deterministic context hash, validates ledger version bounds, then restores the active working set.

Recovery fails closed on integrity mismatch, duplicate ledger identity, or invalid version history.

A failed durable commit restores the in-memory active context to its pre-commit snapshot so the process cannot claim an uncommitted version.

## MongoDB

Mongo persistence requires a MongoClient capable of transactions. When the client is unavailable or the deployment cannot provide transaction semantics, the atomic commit path fails closed rather than degrading to non-atomic persistence.

## Authority boundary

MongoDB remains operational persistence; ContextFabric remains the sole working-context authority. No context commit can grant capabilities, acquire leases, reserve Treasury capacity, mutate CAS identity, certify F07, or promote a model.

## Next gate

After Wave C is proven, direct ContextOS consumers migrate behind ContextFabric. CLM shadow inference remains later.
