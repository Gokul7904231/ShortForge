# Slayer Prime — Enforcement Architecture

Status: IMPLEMENTED foundation / bounded production enforcement boundary

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
                                +--> incident identity
                                +--> evidence quorum
                                +--> blast-radius policy
                                +--> action lease / fencing
                                +--> enforcement adapter
                                +--> postcondition verification
                                +--> enforcement receipt
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

The action lease supplies a monotonic fencing token and prevents duplicate mutation for the same action intent within the configured lease store.

The default action lease store is in-memory for tests/offline operation. Distributed production requires a durable, strongly-consistent implementation.

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
- Action lease and fencing token: implemented in-memory.
- Lease revocation: implemented.
- Postcondition proof and receipt: implemented.
- Physical process termination: adapter required.
- eBPF/kernel enforcement: adapter required.
- Durable distributed enforcement ledger: future adapter/store.
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
