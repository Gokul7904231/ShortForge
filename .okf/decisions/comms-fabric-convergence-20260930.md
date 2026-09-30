# Decision — Comms Fabric Convergence — 2026-09-30

## Decision

Upgrade FactoryOS Comms from a SituationRecord delivery helper into a layered communication protocol over the existing DurableEventBus.

## Why

The current Comms implementation already protects SituationRecord integrity, evidence references, truth levels, duplicate semantic delivery, and conflict visibility. The next reliability bottlenecks are protocol identity, session state, scoped authorization, capability negotiation, explicit delivery lifecycle, causality, and lane isolation.

## Architecture

```
Semantic payload
   ↓
Comms v2 Envelope
   ↓
Admission / scope / capability gate
   ↓
DurableEventBus transport
   ↓
lane-specific delivery
   ↓
consumer/session
   ↓
delivery receipt
```

The protocol deliberately separates:
- transport
- semantic payload
- authority
- delivery lifecycle
- session state
- observability

## Authority rules

Comms never grants execution authority. Commands remain subject to the existing action graph / Guardian / lease / fencing controls. A successful ACK means communication processing completed, not that an external action was authorized or correct.

## Research basis

OpenShell motivates control-plane/runtime separation, authenticated persistent sessions, multiplexed relay/control, capability declaration, and last-known-good configuration.

MCP for Blender motivates explicit protocol handshakes and capability reporting around a persistent socket connection.

Elasticsearch motivates explicit request/response/task/listener semantics in distributed transport.

Worktrunk motivates explicit per-agent context and lifecycle hooks for parallel work.

PageIndex motivates structured, traceable context instead of opaque similarity-only messages.

hey motivates a disciplined load-test surface with concurrency/rate/timeout metrics.

ReClip and FxEmbed motivate thin adapter boundaries and deduplication at integration edges.

2026 communication-protocol research motivates treating counterparty, payload, interaction state, discovery, and schema flexibility as explicit dimensions and recognizing that transport maturity does not automatically provide semantic alignment or verification.

## Release gates

Before Comms v2 is considered production-grade:
1. protocol integration into SituationCommsClient
2. durable outbox + delivery receipts
3. persistent session registry
4. heartbeat/degradation/reconnect semantics
5. per-lane backpressure and quotas
6. explicit replay cursor
7. authentication and principal binding
8. cross-replica ownership/fencing
9. adversarial authorization tests
10. load tests with real transport adapters
11. trace reconstruction tests
12. no regression in SituationRecord A-L suite

## Non-goals

No second message broker, no second source-of-truth DB, no LLM-controlled authority, no replacement of F07 verification, and no free-text protocol hidden behind an agent prompt.
