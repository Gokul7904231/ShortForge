# Overseer Collaboration & Work Fabric — Wave 4

**Status:** IMPLEMENTED ON FEATURE BRANCH
**Product layer:** Agent Intercom & Governed Delegation

## Purpose

Wave 4 closes the next collaboration gap after:
- Wave 1 — Mission Room collaboration.
- Wave 2 — durable mission work.
- Wave 3 — workspace-scoped Agent Workforce.

The result is a real multi-human/multi-agent communication layer inside Mission Room. Communication is durable and scoped; delegation becomes an explicit stateful handoff. Neither mechanism becomes execution authority.

## Product outcome

Human / Agent
     |
     v
Mission Room
     |
     +--> Conversation
     |
     +--> Handoff / Delegation
     |
     v
Agent Intercom
     |
     +--> protocol + scope admission
     +--> negotiated peer session
     +--> durable outbox / delivery receipt
     +--> bounded retry / dead-letter
     +--> replay cursor
     +--> correlation / causation
     |
     v
Mission Work / FGC / AEF
     |
     v
F00 … F07
     |
     v
F07 truth

## Wave 4 capabilities

### Agent Intercom
- mission-scoped messages;
- explicit sender and target principals;
- event/control lane separation;
- protocol-version admission;
- target allowlist admission;
- payload-size enforcement;
- durable message records;
- delivery lifecycle: CREATED → ADMITTED → QUEUED → DISPATCHED → DELIVERED → ACKED;
- negative delivery states: RETRYING / NACKED / EXPIRED / CANCELLED / DEAD_LETTERED;
- bounded retry;
- idempotent sends;
- explicit replay cursor;
- correlation/causation identifiers.

### Peer sessions
- typed peer hello;
- protocol version verification;
- capability negotiation;
- schema-version intersection;
- heartbeat;
- stale-session degradation;
- session persistence across in-memory, disk, and Mongo modes.

### Governed delegation
Delegation is a durable request:
REQUESTED → ACCEPTED / DECLINED / CANCELLED / EXPIRED

An accepted delegation remains a coordination result. It does not directly invoke an MCP, provider, worker, render job, or floor action.

## Authorization

Mission Room remains the product boundary for browser-created intercom traffic.
The route derives an explicit target allowlist from active room participants.
Managed workforce agents must be ACTIVE before they may participate.
For managed-agent delegation with a declared capability, the target agent must already possess that capability. Delegation cannot mint or expand permissions.

## Comms architecture

Wave 4 consumes the existing Comms Fabric v2 contract rather than creating another message broker.
Comms remains transport-neutral and retains principal identity, mission/floor scope, lane, interaction, delivery semantics, correlation/causation, schema/protocol version, and capability declarations.
The DurableEventBus remains the transport substrate.

## Persistence

Mongo collections:
- agent_intercom_messages
- agent_intercom_delegations
- agent_intercom_sessions

Mongo indexes cover mission-scoped replay/order and recent session discovery.
Disk mode stores the same logical records below the existing FactoryOS storage root.
No second authoritative database is introduced.

## Execution boundary

Wave 4 preserves the invariant:
> Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.

Intercom cannot:
- mint capabilities;
- bypass Guardian/FGC;
- acquire or release a worker lease;
- mark an artifact verified;
- publish externally;
- certify F07;
- turn an ACK into execution success.

Delegation cannot:
- create authority from text;
- widen a target agent's capabilities;
- directly dispatch work;
- silently resurrect expired work.

## Mission Room UX

The existing Mission Room gains:
- Conversation;
- Canvas;
- Work;
- Handoffs.

The Handoffs view shows source → target, objective, requested capability, linked task when supplied, delegation state, and correlation identity.
Intercom messages are projected back into the existing Mission Room conversation through the Collaboration Store so there is one human-facing collaboration history.
The existing living/emotional Overseer face remains unchanged and stays the primary Dashboard identity.

## Security posture

Wave 4 adds explicit negative checks for:
- mission scope escape;
- target allowlist escape;
- protocol mismatch;
- payload overflow;
- missing capability negotiation;
- duplicate idempotent send;
- stale peer;
- unauthorized delegation response;
- target capability absence;
- bounded retry exhaustion.

Focused Semgrep runs only the new security-sensitive Wave 4 paths and fails on error-severity findings.

## Acceptance checklist
- [x] Mission-scoped agent intercom
- [x] Durable outbox/message persistence
- [x] Delivery receipts and lifecycle
- [x] Bounded retry and dead-letter state
- [x] Idempotent sends
- [x] Explicit replay cursor
- [x] Correlation/causation propagation
- [x] Target allowlist admission
- [x] Protocol version gate
- [x] Payload-size gate
- [x] Typed peer handshake
- [x] Capability/schema negotiation
- [x] Heartbeat and stale-session degradation
- [x] Durable session registry
- [x] Durable delegation lifecycle
- [x] Target capability validation
- [x] Mission Room Handoffs surface
- [x] Intercom-to-room projection
- [x] Wave 4 focused tests
- [x] Wave 4 focused Semgrep gate

## Deliberate non-goals
- no new message broker;
- no direct agent-to-provider authority;
- no automatic execution from delegation acceptance;
- no live fine-tuned Ascalon requirement;
- no replacement of FGC/AEF/F07;
- no self-hosted sandbox assumption;
- no raw credential storage.

## Expected next wave
Wave 5 can build on this stable collaboration protocol for higher-level fleet orchestration, shared agent activity streams, and mission-level automation recipes without changing the authority boundaries.

## Final validation evidence

- Dedicated Wave 4 validation run **36978269973** passed.
- npm ci passed.
- npm run typecheck passed.
- Focused Comms Fabric, Agent Intercom, and Mission Collaboration tests passed.
- Focused Wave 4 Semgrep passed with **0 findings** on the exact affected security paths.
- Team Change Gate for the Wave 4 report is expected to validate the BLOCKED cumulative-release disposition because the inherited Wave 3 Strix proof remains unavailable.
- Wave 4 does not modify the existing Overseer emotional face/presence subsystem.
