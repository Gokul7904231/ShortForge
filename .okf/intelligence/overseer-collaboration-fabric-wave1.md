# Overseer Collaboration & Work Fabric — Wave 1

**Status:** IMPLEMENTED ON FEATURE BRANCH
**Scope:** Human + agent mission collaboration inside the existing Overseer Dashboard.

## Product outcome

Wave 1 makes a Mission a shared collaboration surface without introducing a second human control plane.

A Mission Room contains:
- multiple authenticated human participants;
- named FactoryOS agents;
- one shared conversation;
- reply threads;
- explicit @agent mentions;
- links from messages to canonical MissionTask records;
- a shared Mission Canvas;
- mission-scoped work visibility.

## Architecture boundary

```
Human
  ↓
Overseer Dashboard
  ↓
Mission Room / Threads / Canvas
  ↓
Overseer
  ↓
FGC + Action Graph
  ↓
Agent Execution Fabric
  ↓
F00 … F07
  ↓
F07 truth
```

The collaboration layer is a projection and interaction surface. It is not allowed to:
- call provider APIs directly;
- authorize floor mutations;
- bypass Agent Execution Fabric;
- turn a chat message into execution implicitly;
- treat agent acknowledgement as task completion;
- treat a room message as evidence or F07 verification.

## Room semantics

### Participants

Humans have room membership. Managers can add participants. Agents are named participants with a response policy:
- `JOINS_CONVERSATION` for Overseer and Ascalon;
- `MENTION_ONLY` for specialist agents by default.

The response policy controls presentation/invocation intent only; it does not grant tool or execution permission.

### Threads

A root room message may receive replies using its `messageId` as `threadId`.

### Task linkage

A message can carry a `taskId`. The referenced task remains authoritative in Mission/MissionTask state.

### Canvas

Canonical mission fields are projected from Mission state. Human-editable fields are limited to shared working notes, decisions, and risks. Updating the canvas does not mutate mission execution state.

## Security/privacy

Room reads are scoped by room membership. `OWNER` and `ADMIN` workspace roles have read/manage access. A `VIEWER` cannot create a new room.

Personal memory, personal credentials, and private external integrations are never copied into a room by this feature.

## Persistence

The store supports:
- MongoDB when the controller is backed by Mongo;
- disk persistence when the controller uses its existing disk runtime;
- in-memory mode for isolated tests/development.

Mongo/distributed execution can evolve independently from the product API because the collaboration store is a dedicated persistence boundary.

## Research provenance

The UX direction is informed by Hyperagent Rooms, Slack team conversation patterns, and Hermes Kanban:
- Hyperagent demonstrates shared rooms, role-based management, and per-agent response modes.
- Slack demonstrates channel/thread/mention interaction and structured work surfaces.
- Hermes demonstrates durable work state, dependencies, review, heartbeat, and event-oriented handoffs.

Wave 1 deliberately implements only the collaboration substrate. Durable Kanban execution controls belong to a later work-management wave.


## Wave 1 acceptance checklist

- [x] Mission-scoped shared room exists beside the existing Overseer Command Center.
- [x] Human membership gates room reads and writes.
- [x] Named agents have explicit response modes.
- [x] Shared conversation supports root messages and replies.
- [x] Messages can link to canonical MissionTask ids.
- [x] Known @mentions are resolved to room participant ids.
- [x] Mission Canvas projects canonical mission state and keeps human notes separate.
- [x] Collaboration state is persisted independently from execution state.
- [x] Room events are emitted onto the existing DurableEventBus.
- [x] No room action directly invokes a provider, MCP tool, floor mutation, or F07 decision.
