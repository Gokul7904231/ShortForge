# FactoryOS Comms Fabric v2

## Purpose

Comms is the nervous system of FactoryOS, not a generic event bus. It transports machine-actionable state, commands, queries, responses, heartbeats, and relays while preserving scope, authority, causality, delivery state, and evidence boundaries.

The existing `SituationRecord` remains the semantic payload for structured situation exchange. `CommsFabric` adds the transport-neutral protocol shell.

## Design

```
Human / Overseer / Guardian / Ascalon / Worker
                    |
             Comms Admission
                    |
        +-----------+-----------+
        | Envelope / Scope      |
        | Correlation / Cause   |
        | TTL / Priority        |
        | Schema / Digest       |
        +-----------+-----------+
                    |
             DurableEventBus
                    |
       +------------+-------------+
       | CONTROL | EVENT | RELAY |
       | STREAM  | HEARTBEAT     |
       +------------+-------------+
                    |
              Consumer/session
                    |
          Delivery state machine
```

### 1. Envelope is not payload

The envelope carries protocol metadata: message identity, source/target, mission/floor scope, interaction model, lane, delivery semantics, correlation/causation, attempt, schema version, TTL, priority, and content digest.

The payload remains owned by the domain contract, such as `SituationRecord`.

### 2. Session before trust

Every live peer relationship must negotiate protocol version, supported schemas, capabilities, and limits before normal traffic. The communication layer should eventually expose a persistent session with heartbeat, degradation, last-known-good configuration, and explicit close.

### 3. Authorization before transport effect

Admission is a pure policy decision. A sender cannot select a lane, message kind, mission, floor, or broadcast scope outside its granted context.

Transport is not authority. A successful publish means accepted transport work, not permission to execute the payload.

### 4. Explicit delivery state

Delivery is modeled as a state machine rather than inferred from a successful function return:

`CREATED → ADMITTED → QUEUED → DISPATCHED → DELIVERED → ACKED`

Negative paths are explicit:

`DISPATCHED → RETRYING/NACKED/EXPIRED/CANCELLED`

and:

`RETRYING/NACKED → DEAD_LETTERED`

Retries are bounded and require a retryable failure.

### 5. Causality

Use `correlationId` for the mission/conversation and `causationId` for the immediate triggering message. This makes multi-step agent conversations reconstructable without relying on prose.

### 6. Scoped communications

Mission is the minimum security boundary. Floor and channel are narrower boundaries. Global/broadcast messages must be explicit capability grants, never implied by recipient `*`.

### 7. Capability negotiation

Peers advertise named capabilities with versions, lanes, payload limits, and in-flight limits. New capabilities should be opt-in and versioned.

### 8. Control vs relay vs event

- CONTROL: commands, queries, responses, cancellation, protocol management.
- EVENT: durable domain events and SituationRecord publication.
- RELAY: byte/interactive forwarding for external adapters or execution sessions.
- STREAM: long-lived progress/output streams.

This prevents a large interactive stream from starving control-plane messages.

## Research-derived principles

### NVIDIA OpenShell

OpenShell separates gateway control-plane authority from local runtime enforcement and uses authenticated long-lived supervisor sessions, multiplexed control/relay traffic, capability reporting, scoped authorization, bounded request handling, and last-known-good configuration. FactoryOS should adopt the architectural separation, not copy OpenShell implementation details.

### MCP for Blender

The Blender MCP project demonstrates a simple JSON command/response protocol over sockets plus explicit addon protocol-version/capability handshakes and a persistent connection. FactoryOS should retain this friendliness but add stronger identity, scope, causality, delivery receipts, and authorization.

### Elasticsearch

Elasticsearch uses explicit request/response/action/listener/task concepts and a node-to-node transport layer. FactoryOS can apply the same conceptual split: request metadata and lifecycle tracking should be explicit, with operation identity independent from transport connection identity.

### Worktrunk

Worktrunk treats parallel agent execution as a first-class workflow with explicit worktree context and ordered lifecycle hooks. FactoryOS Comms should likewise carry explicit worker context and allow lifecycle hooks around session/dispatch/close rather than relying on implicit shell state.

### PageIndex

PageIndex shows the value of reasoning over explicit structure and producing traceable references instead of opaque similarity-only retrieval. Comms should therefore preserve structured references, source identity, and evidence links rather than collapsing important state into free-text messages.

### ReClip / FxEmbed

These projects reinforce a useful edge principle: keep adapters lightweight and let the protocol boundary absorb transport/integration complexity. ReClip emphasizes deduplication for media downloads, while FxEmbed is a serverless edge adapter. In FactoryOS, integration adapters should not become a second comms protocol or state store.

### Current agent-communication research

A 2026 taxonomy of LLM-agent communication protocols identifies counterparty, payload, interaction state, discovery, and schema flexibility as core dimensions and observes a trend toward federated layered protocol stacks. A 2026 study argues current protocols are stronger on transport/streaming/schema/lifecycle than on context alignment, clarification, and verification. This supports making semantic alignment, provenance, and policy explicit in FactoryOS rather than treating them as prompt conventions.

## FactoryOS invariants

- Comms may move information; Comms may not grant execution authority.
- A message is not proof of the claim it transports.
- F07 physical/verification evidence remains the truth boundary.
- Scope is evaluated before delivery.
- Broadcast is explicit.
- Protocol/schema/capability mismatches fail closed.
- Duplicate transport does not imply duplicate semantic effects.
- Retry is bounded.
- Expired work is never resurrected silently.
- The durable event bus remains the transport substrate; CommsFabric is its protocol and policy layer.
- No secondary authoritative state database is introduced.

## Immediate implementation

Phase A (implemented on the AER branch):
- typed v2 envelope
- scope/principal model
- capability negotiation types
- pure admission gate
- delivery state machine
- retry gate
- regression tests

Phase B:
- adapt `SituationCommsClient` to emit/consume the v2 envelope
- add real session registry + heartbeat
- durable delivery receipts/outbox
- correlation/causation tracing
- per-lane quotas and backpressure
- explicit replay cursor instead of timestamp-only replay

Phase C:
- authenticated peer handshake
- external relay adapter boundary
- streaming progress lane
- cross-replica ownership/fencing
- communication observability and trace reconstruction

## Non-goals

Comms does not become:
- an LLM reasoning layer
- an execution engine
- a second memory store
- a replacement for Guardian authority
- a replacement for F07 verification
