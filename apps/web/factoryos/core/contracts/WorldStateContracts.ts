/**
 * FactoryOS v1 — World State Contracts
 * Represents authoritative, persistent factory operational state.
 * Enhanced for Project Ascalon training readiness with immutable snapshot
 * and event contracts, deterministic provenance IDs, and strict schema versioning.
 */

export interface ProvenanceMeta {
  readonly source: string;
  readonly confidence: number; // 0.0 to 1.0
  readonly timestamp: string;
  readonly freshnessSeconds: number;
  readonly version: number;
}

export interface StateFact<T> {
  readonly value: T;
  readonly provenance: ProvenanceMeta;
}

export type FloorStatus = "ONLINE" | "DEGRADED" | "ERROR" | "IDLE" | "MAINTENANCE" | "OFFLINE";

export interface FloorState {
  readonly floorId: string;
  readonly name: string;
  readonly status: FloorStatus;
  readonly activeWorkers: number;
  readonly queueDepth: number;
  readonly activeJobs: string[];
  readonly lastHeartbeat: string;
  readonly currentObjective?: string;
  readonly recentAnomalies: string[];
}

export type WorkerRole = "SLAYER" | "HEALER" | "GUARDIAN" | "VALIDATOR" | "OPERATOR" | "SPECIALIST" | "WORKER" | "EXECUTOR";

export type WorkerHealthStatus = "HEALTHY" | "BUSY" | "STALE" | "DEGRADED" | "FAILED" | "QUARANTINED" | "RECOVERING" | "OFFLINE";

export interface WorkerState {
  readonly workerId: string;
  readonly role: WorkerRole;
  readonly specialization: string;
  readonly status: WorkerHealthStatus;
  readonly assignedFloor?: string;
  readonly currentTaskId?: string;
  readonly currentCaseId?: string;
  readonly lastSeen: string;
  readonly leaseExpiresAt?: string;
  readonly metrics: {
    readonly tasksCompleted: number;
    readonly tasksFailed: number;
    readonly uptimeSeconds: number;
    readonly averageLatencyMs: number;
  };
}

export interface SystemResourceState {
  readonly cpuPercent: number;
  readonly memoryUsedMb: number;
  readonly memoryTotalMb: number;
  readonly vramUsedMb: number;
  readonly vramTotalMb: number;
  readonly gpuAvailable: boolean;
  readonly networkOnline: boolean;
  readonly driveAvailable: boolean;
}

export interface WorldState {
  readonly schemaVersion: "1.0.0";
  updatedAt: string;
  sequenceNumber: number;
  factoryStatus: "OPERATIONAL" | "DEGRADED" | "ATTENTION_REQUIRED" | "HALTED";
  globalGoal?: string;
  floors: Record<string, FloorState>;
  workers: Record<string, WorkerState>;
  activeCaseIds: string[];
  activeRunIds: string[];
  activeRepairs: string[];
  resources: SystemResourceState;
  systemConfidence: number; // 0.0 to 1.0
}

export interface WorldStateProvenance {
  readonly provenanceId: string;
  readonly actor: string;
  readonly action: string;
  readonly reason: string;
  readonly correlationId?: string;
  readonly sequenceNumber: number;
  readonly timestamp: string;
}

export interface WorldStateSnapshot {
  readonly state: WorldState;
  readonly sequenceNumber: number;
  readonly snapshotAt: string;
}

export interface WorldStateSnapshotContract {
  readonly worldStateId: string;
  readonly schemaVersion: string;
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly capturedAt: string;
  readonly sourceVersion: string;
  readonly correlationId?: string;
  readonly state: WorldState;
}

export interface WorldStateEventContract {
  readonly eventId: string;
  readonly eventType: string;
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly actor: string;
  readonly payload: Record<string, unknown>;
}
