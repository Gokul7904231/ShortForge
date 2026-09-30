# Slayer Prime — Distributed Safety Research Record

Status: R&D evidence for the Slayer Prime hardening pass
Date: 2026-09-29

## Objective

Harden Slayer Prime against:
- duplicate logical actions across replicas
- resurrection of a previously paused process
- split-brain enforcement
- loss of incident/action state during process restart
- stale writes after leadership changes
- replay after ambiguous adapter outcomes

## ShortForge evidence reviewed

Canonical implementation reviewed on `feat/slayer-prime`:
- `apps/web/factoryos/core/slayers/prime/SlayerPrimeEngine.ts`
- `apps/web/factoryos/core/slayers/prime/SlayerPrimeStateStore.ts`
- `apps/web/factoryos/core/slayers/prime/SlayerActionLease.ts`
- `apps/web/factoryos/core/slayers/prime/SlayerActionExecutor.ts`
- `apps/web/factoryos/core/database/DatabaseContracts.ts`
- `apps/web/factoryos/core/database/InMemoryDatabase.ts`
- `apps/web/factoryos/core/database/PersistentDiskDatabase.ts`
- `apps/web/factoryos/core/database/MongoDBClient.ts`
- `apps/web/factoryos/core/leases/LeaseManager.ts`
- `apps/web/factoryos/tests/slayer-prime.test.ts`
- `.okf/hierarchy/slayer-prime.md`

## Research findings adopted

### 1. Fencing tokens are required beyond a lease

A lease can expire while the old client is paused and later resume. A monotonically increasing fencing token lets the protected resource reject writes from the older holder.

Reference:
https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

Adopted:
- Prime leadership epoch
- Prime action fencing token
- worker/task lease fencing token
- pre-mutation lease re-read
- fenced worker lease release

### 2. Leader election needs a shared compare-and-update primitive

Kubernetes uses a shared Lease and optimistic concurrency so only the accepted update becomes leader. The lease also has an identity and renewal timing.

References:
https://kubernetes.io/docs/concepts/cluster-administration/coordinated-leader-election/
https://kubernetes.io/docs/concepts/architecture/leases/

Adopted:
- one logical Prime leadership record
- unique process-incarnation holder identity
- short-lived leadership term
- leadership recheck immediately before enforcement
- loss of leadership removes local enforcement authority

### 3. Atomic compare-and-set is the useful primitive for coordination

etcd documents transactions as atomic If/Then/Else operations that can compare a key's version/revision and perform a protected update.

Reference:
https://etcd.io/docs/v3.6/learning/api/

Adopted conceptually:
- state-store abstraction allows a strongly-consistent coordination backend
- Mongo implementation uses conditional updates and unique indexes
- stronger consensus-backed stores remain a possible future deployment option

### 4. MongoDB single-document writes and unique indexes are useful for Prime coordination

MongoDB documents that each single-document write is atomic and unique indexes enforce uniqueness. `findOneAndUpdate()` can condition updates on the current document state.

References:
https://www.mongodb.com/docs/v8.0/core/write-operations/atomicity/
https://www.mongodb.com/docs/v7.0/reference/method/db.collection.findoneandupdate/

Adopted:
- unique `dedupeKey` for Prime intents
- unique intent ownership for action leases
- conditional leader acquisition
- primary + majority consistency settings in the Prime Mongo store

## Resulting Prime invariants

1. A restarted process receives a new holder identity.
2. Leadership terms do not change merely because the same leader renews.
3. Leadership changes advance a new fencing generation.
4. An action cannot be reserved without current leadership.
5. An action cannot execute if its reservation is no longer current.
6. A worker lease created after an old intent receives a newer resource fence and defeats the old intent.
7. The same logical action proposal maps to one deterministic intent within its dedupe window.
8. Prime state can survive process restart through Disk or Mongo state stores.
9. An adapter outcome that is not definitive is recorded as `UNKNOWN` and the action reservation is not immediately released for blind replay.
10. Unsupported physical enforcement remains adapter-gated.

## Remaining R&D gaps

These are deliberately not marked complete:

- `DurableEventBus` is still process-local; distributed event replay/consumer offsets remain separate work.
- Disk state is restart durable but is not a multi-host consensus mechanism and needs host-level file locking for competing processes.
- Mongo coordination relies on the configured Mongo deployment's consistency/availability characteristics; Prime itself is not a consensus protocol.
- A process can still disappear between an external side effect and a final receipt; the `EXECUTING` marker plus retained action lease prevents immediate blind replay, but a dedicated reconciler is still required for definitive recovery.
- The legacy worker lease model now supports fencing for built-in repositories, but external/custom lease repositories must implement the optional atomic fenced-release operation.
- Physical kernel/eBPF enforcement adapters are still future implementations.

## Architectural conclusion

The hardening direction is:

THINK -> AUTHORIZE -> LEAD -> FENCE -> EXECUTE -> PROVE

The important safety property is not that duplicate or stale processes never exist. It is that an old process may exist without retaining a valid right to mutate the current authoritative state.
