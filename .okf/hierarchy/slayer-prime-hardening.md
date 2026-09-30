# Slayer Prime — Distributed Failure Matrix

Purpose: keep the Prime enforcement boundary safe under duplicate processes, crash/restart, pauses, network delays, leadership turnover, and partial state loss.

## Core rule

A running process is not proof of authority.

Prime authority is represented by shared state, and a mutation must carry the current leadership generation plus a unique action fence.

## Failure matrix

| Failure | Attack / failure shape | Prime defense | Current status |
|---|---|---|---|
| Duplicate proposal | Two replicas observe the same incident | Deterministic action dedupe key + unique intent index | Implemented |
| Duplicate execution | Two replicas try the same intent | Shared action lease + unique intent lease + monotonic fence | Implemented in shared state store |
| Restart resurrection | Old process comes back after its lease expired | New process-incarnation holder identity + fresh leadership acquisition | Implemented |
| Split brain | Old and new replicas both believe they can enforce | Shared leadership lease + monotonic epoch + pre-mutation leadership recheck | Implemented when using shared strong-consistency store |
| Stale action lease | Old action reservation survives locally after takeover | Current action-lease identity/fence checked before adapter mutation | Implemented |
| Stale state write | Old leader resumes after a new leader has advanced state | Epoch-stamped incident write primitive in state store | Store primitive implemented; Prime persist-path integration remains required |
| Process crash mid-state update | RAM disappears | Disk/Mongo state stores keep incidents/intents/receipts/action leases outside the process | Implemented through injected durable store |
| Lost incoming observation | Prime process is offline while an in-memory event bus emits | Requires durable shared event transport or replayable inbox | Not yet complete |
| Resource resurrection | Worker is reacquired under a new lease while an old Prime action still targets it | Requires atomic worker-resource fencing at LeaseManager/repository layer | Not yet complete |
| Partial adapter success | Adapter mutates then process dies before receipt | Idempotent intent identity + postcondition verification; reconciler still required for ambiguous outcomes | Partially implemented |
| Store partition | Coordination backend is unavailable | Fail closed: no current leadership proof means no enforcement | Implemented in executor |
| Clock skew | Wall-clock disagreement | Lease expiry still depends on store timestamps; future distributed lease service should use authoritative/monotonic server semantics | Partial |
| State rollback | Former DB primary exposes stale data | Mongo Prime collections use primary routing and majority read/write concerns; leadership proof uses bounded linearizable read | Implemented in Mongo store |
| Event replay | Same observation/event delivered twice | Incident fingerprinting and idempotency keys | Implemented locally; durable replay transport pending |
| Safety-index loss | Unique indexes fail or are unavailable | Mongo store readiness rejects the entire coordination path instead of running without duplicate barriers | Implemented |

## Required production topology

Single host:
Prime -> DiskSlayerPrimeStateStore

Multi-replica:
Prime replicas -> MongoSlayerPrimeStateStore -> replicated MongoDB

Future consensus-grade coordination:
Prime replicas -> dedicated consensus KV/lease service such as etcd

The application must not treat the process-local InMemorySlayerPrimeStateStore as a production HA mechanism.

## Research basis

The design follows the same classes of primitives used in established distributed systems:

- Kubernetes leader election: shared Lease + optimistic concurrency + unique holder identity.
- etcd: atomic transactions and monotonic revisions for concurrency control.
- Fencing-token pattern: stale clients must be rejected by the protected resource, not merely by the lock service.
- Raft / replicated state machines: a single ordered authority log is the model for strong multi-replica coordination.
- Durable execution systems: progress/state must outlive an individual worker process.

## Non-negotiable Prime invariants

1. No current leadership proof -> no enforcement.
2. No fresh evidence quorum -> no enforcement.
3. No unique action reservation -> no enforcement.
4. No current action fence -> no enforcement.
5. A caller holding a previous leadership generation is stale even if the same process identity is still alive.
6. No postcondition proof -> no VERIFIED receipt.
7. A restarted process gets a new holder identity.
8. A new leadership generation must be greater than every previously issued generation.
9. A stale state writer must never overwrite state committed by a newer leadership generation.
10. Durable coordination must fail closed under uncertainty.
11. Worker-resource mutations ultimately need resource-side fencing, not only control-plane fencing.
