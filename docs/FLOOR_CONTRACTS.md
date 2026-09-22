# FACTORYOS 6-FLOOR CONTRACTS & PROTOCOL SPECIFICATION

## 1. Security & Ownership Tuple

Every floor command and callback envelope MUST include the canonical security tuple:
- `userId`: Owner of the generation.
- `jobId`: Unique video generation identifier.
- `missionId`: FactoryOS mission identifier.
- `floorId`: Current floor (e.g., `floor01_strategy`, `floor06_rendering`).
- `executionId`: Unique execution run identifier for this floor attempt.
- `parentExecutionId`: Preceding floor execution ID for causal tracing.
- `attempt`: Current attempt number (1-indexed).
- `executionToken`: High-entropy cryptographic token for authorization.
- `initiatedBy`: Origin of trigger (`user`, `overseer`, `retry`, `healer`, etc.).

---

## 2. Floor Envelopes

### Floor Command (TypeScript Kernel → Worker)
```typescript
export interface FloorCommandEnvelope<T = Record<string, unknown>> {
  readonly commandId: string;
  readonly commandType: "StartFloor" | "CancelFloor" | "RepairFloor";
  readonly userId: string;
  readonly jobId: string;
  readonly missionId: string;
  readonly floorId: string;
  readonly executionId: string;
  readonly parentExecutionId?: string;
  readonly attempt: number;
  readonly executionToken: string;
  readonly payload: T;
  readonly timestamp: string;
  readonly schemaVersion: string;
}
```

### Floor Completion / Status Handoff (Worker → TypeScript Kernel)
```typescript
export interface FloorHandoffEnvelope<T = Record<string, unknown>> {
  readonly floorId: string;
  readonly userId: string;
  readonly jobId: string;
  readonly missionId: string;
  readonly executionId: string;
  readonly parentExecutionId?: string;
  readonly attempt: number;
  readonly executionToken: string;
  readonly status: "SUCCESS" | "FAILED" | "DEGRADED" | "REPAIR_REQUIRED";
  readonly outputArtifact?: T;
  readonly complianceScore?: number;
  readonly errors?: string[];
  readonly executionTimeMs: number;
  readonly timestamp: string;
  readonly schemaVersion: string;
}
```
