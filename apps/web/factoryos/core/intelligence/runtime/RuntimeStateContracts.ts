/**
 * ShortForge / FactoryOS — Runtime State Contracts
 * Represents live, read-only operational truth from the FactoryOS control plane and render workers.
 */

export interface WorkerState {
  readonly workerId: string;
  readonly pool: "BASIC_FASTAPI" | "AZURE_VM" | "FALLBACK";
  readonly url: string;
  readonly status: "IDLE" | "BUSY" | "DEGRADED" | "OFFLINE";
  readonly activeJobsCount: number;
  readonly lastHeartbeatAt: string;
}

export interface QueueState {
  readonly pendingCount: number;
  readonly processingCount: number;
  readonly failedCount: number;
  readonly completedCount: number;
  readonly oldestPendingJobAgeSec?: number;
}

export interface ActiveMissionState {
  readonly missionId: string;
  readonly goal: string;
  readonly status: "PENDING" | "PLANNING" | "EXECUTING" | "COMPLETED" | "FAILED";
  readonly currentTaskId?: string;
  readonly activeAgentId?: string;
  readonly startedAt: string;
}

export interface RuntimeSnapshot {
  readonly capturedAt: string;
  readonly factoryStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
  readonly activeMissions: ActiveMissionState[];
  readonly workers: WorkerState[];
  readonly queue: QueueState;
  readonly currentBlockers: string[];
  readonly currentUserRequest?: string;
}

export interface IRuntimeStateProvider {
  getSnapshot(): Promise<RuntimeSnapshot>;
  getWorkerState(workerId: string): Promise<WorkerState | null>;
  getCurrentBlockers(): Promise<string[]>;
  updateLiveState(partial: Partial<RuntimeSnapshot>): void;
}
