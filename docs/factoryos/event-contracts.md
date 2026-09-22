# FACTORYOS EVENT & COMMAND CONTRACTS

## 1. Commands vs Events

- **Commands (Requests to perform actions)**: Imperative, targeted, validated by state machine before acceptance.
  - `StartMission`, `CancelMission`, `StartFloor`, `CancelFloor`, `RepairFloor`, `DispatchRender`.
- **Events (Facts of state changes)**: Past-tense, immutable, durable, published to `DurableEventBus`.
  - `MissionCreated`, `MissionStarted`, `MissionCompleted`, `MissionFailed`, `FloorStarted`, `FloorProgressed`, `FloorCompleted`, `FloorFailed`, `FloorRepairRequested`, `FloorRepaired`.

---

## 2. Event Envelope Structure

```typescript
export interface DurableEventEnvelope<T = Record<string, unknown>> {
  readonly eventId: string;
  readonly topic: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly source: string;
  readonly userId?: string;
  readonly jobId?: string;
  readonly missionId?: string;
  readonly executionId?: string;
  readonly payload: T;
  readonly schemaVersion: string;
  readonly idempotencyKey?: string;
}
```
