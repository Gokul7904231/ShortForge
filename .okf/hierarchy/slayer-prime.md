# Slayer Prime — Enforcement Architecture

Status: IMPLEMENTED foundation / distributed-safety hardened enforcement boundary

Slayer Prime is the enforcement control plane inside the canonical Slayer layer.

## Authority boundary

Human Authority
      |
      v
Overseer
      |
      v
Guardian ---- authorizes ----> Slayer Prime
                                |
                                +--> durable incident identity
                                +--> evidence quorum
                                +--> deterministic action intent
                                +--> single-writer leadership epoch
                                +--> action lease / monotonic fencing
                                +--> enforcement adapter
                                +--> postcondition verification
                                +--> durable enforcement receipt
                                |
                                v
                              Worker

Core doctrine:

> Intelligence proposes. Authority authorizes. Slayer Prime enforces. Evidence proves.

Slayer Prime never treats model confidence as permission. Mutating actions require a matching Guardian/Human authorization grant, fresh evidence quorum, exact target/scope, an action lease, and a postcondition check.

## Action lifecycle

Observation
  -> incident fingerprint
  -> evidence accumulation
  -> quorum evaluation
  -> action intent
  -> Guardian authorization
  -> action lease / fencing token
  -> adapter precondition check
  -> execute
  -> authoritative postcondition verification
  -> EnforcementReceipt
  -> Healer / Overseer handoff
  -> F07 / Auditor verification where required

## Progressive containment

WORKER -> TASK -> QUEUE -> RESOURCE_POOL -> PROVIDER -> FLOOR -> FACTORY

Broader blast radius requires a separately authorized intent at the broader scope. Slayer Prime cannot self-escalate scope.

## Evidence quorum

Evidence quorum is based on independent evidence classes, not the number of Slayers agreeing.

| Action | Required evidence |
|---|---|
| REVOKE_LEASE | LEASE + HEARTBEAT |
| TERMINATE | KERNEL + LEASE + HEARTBEAT |
| FLOOR_HALT | KERNEL + TELEMETRY + RUNTIME_STATE |
| FACTORY_HALT | KERNEL + TELEMETRY + RUNTIME_STATE |

Evidence has source identity, freshness, trust score, independence key, and optional expiry.

## Implemented adapters

REVOKE_LEASE is executable through the existing LeaseManager and is independently re-read to require RELEASED.

FENCE, ISOLATE, TERMINATE, FLOOR_HALT, and FACTORY_HALT are contractually represented but are not reported as successful until a real enforcement adapter exists.

## Concurrency

A worker/task lease and Slayer action lease are different resources.

- Worker/task lease: ownership of execution.
- Slayer action lease: ownership of the enforcement mutation.
- Prime leadership lease: ownership of the single enforcement writer.

Prime now uses a process-incarnation holder identity, a monotonic leadership epoch, deterministic intent deduplication, and a separate monotonic action fence. A stale Prime replica can remain alive without retaining mutation authority.

State storage has explicit tiers:
- InMemorySlayerPrimeStateStore: tests/offline only.
- DiskSlayerPrimeStateStore: single-host restart recovery; not a multi-host consensus mechanism.
- MongoSlayerPrimeStateStore: shared coordination path with atomic conditional leadership, unique intent identity, and shared action-lease fencing.

A production multi-host deployment must use a shared strongly-consistent store.

## Distributed-safety invariants

Prime's critical path is deliberately transactional in shape:

authority check -> current leadership check -> action reservation -> current action-lease check -> adapter mutation -> independent postcondition.

Leadership can change between any two steps, so the executor rechecks authority state immediately before mutation.

The design follows established distributed-systems patterns: Kubernetes leader election uses a shared Lease with optimistic concurrency; etcd transactions provide atomic compare-and-set-style concurrency control and monotonically increasing revisions; fencing tokens prevent delayed or resurrected clients from writing under stale ownership; durable event histories allow recovery after worker/process failure. These patterns are reflected here without claiming that Prime itself is a consensus protocol.

## Crash-window handling

Prime persists an EXECUTING receipt after action reservation and before the enforcement adapter is invoked. This creates an externalized record of the dangerous window where a process can disappear after beginning an effect but before returning its final result.

On a later execution of the same intent:
- VERIFIED is returned idempotently.
- EXECUTING or UNKNOWN blocks blind replay.
- A reconciler must establish the authoritative postcondition before the intent can safely continue.

This follows the newer agent-runtime emphasis on deterministic replay and runtime-verifiable execution history: the goal is to make an action trajectory reconstructible, not merely to log the final answer.

## Distributed-safety model

The critical enforcement path is deliberately ordered as:

authority check -> current leadership check -> action reservation -> current action-lease check -> adapter mutation -> independent postcondition.

Leadership is checked immediately before mutation because authorization and leadership can become stale while a process is paused or a network call is delayed.

This follows established distributed-systems patterns: Kubernetes leader election uses shared Leases with optimistic concurrency; etcd provides atomic compare-and-set-style transactions and monotonic revisions; fencing tokens prevent delayed or resurrected clients from writing under stale ownership; durable execution systems retain progress outside the worker process so another process can reconstruct state after failure.

Prime is not itself a consensus protocol. The safety of multi-host coordination depends on the guarantees of its backing state store.

## Incident storm control

Repeated observations with the same floor/target/category fingerprint are merged into one logical incident within the incident TTL. This prevents repeated patrol ticks from creating an enforcement storm.

## AER / Ascalon boundary

AER/Ascalon may supply deeper investigation or proposals through a future adapter, but they cannot grant Slayer authority or bypass evidence/Guardian gates.

## Current implementation coverage

- Incident fingerprinting: implemented.
- Incident lifecycle state machine: implemented.
- Evidence quorum: implemented.
- Blast-radius policy: implemented.
- Guardian/Human authorization validation: implemented.
- Action lease and fencing token: implemented through the Prime state-store abstraction.
- Single-writer leadership lease and restart-safe holder identity: implemented.
- Deterministic cross-replica action intent dedupe: implemented.
- Lease revocation: implemented.
- Postcondition proof and receipt: implemented.
- Physical process termination: adapter required.
- eBPF/kernel enforcement: adapter required.
- Durable distributed event bus / cross-process observation replay: not yet complete.
- Universal worker-resource fencing: not yet complete; legacy LeaseManager still lacks an atomic fencing-token release contract.
- F07 independent verification: remains outside Slayer Prime.

## Safety invariants

1. No mutating action without authority.
2. No mutating action without fresh evidence quorum.
3. Target and scope must match the authorization.
4. One logical action has one reserved enforcement lease.
5. Action success requires a postcondition verification.
6. A stale/expired action is rejected safely.
7. Slayer Prime cannot grant itself capabilities.
8. Slayer Prime cannot disable Guardian, Watchdog, or F07.
9. Unsupported physical actions are rejected rather than simulated.
10. A stale action lease cannot mutate merely because its process has resumed.
11. Durable state recovery must precede enforcement input acceptance.
12. Multi-host enforcement requires a shared strongly-consistent state store.
13. Prime remains unable to disable Guardian, Watchdog, or F07.
