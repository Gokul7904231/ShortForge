import { UniversalRenderJob, UserTier } from "./RenderQueueManager";

export type WorkerVendor = "oracle" | "github-actions" | "byor" | "gpu" | "custom";
export type WorkerAccessTier = "ADMIN_ONLY" | "BASIC" | "USER_OWNED";
export type WorkerState = "DEALLOCATED" | "STARTING" | "BOOTING" | "READY" | "BUSY" | "DRAINING" | "DEALLOCATING" | "FAILED" | "LOST";

export interface WorkerCapability {
  vendor: WorkerVendor;
  accessTier?: WorkerAccessTier;
  architecture: "x86_64" | "arm64";
  vCPU: number;
  memoryMb: number;
  ffmpegVersion: string;
  supportsGpu: boolean;
  maxConcurrentRenders: number;
}

export interface WorkerTelemetryData {
  cpuUtilizationPct: number;
  cpuCreditBalance?: number;
  ramUtilizationPct: number;
  activeRenders: number;
  tempStorageFreeMb: number;
  b2Connectivity: boolean;
  lastHeartbeatTimestamp: number;
}

export interface RegisteredWorker {
  workerId: string;
  vendor: WorkerVendor;
  accessTier?: WorkerAccessTier;
  tenantId?: string; // Bound to specific tenant if USER_OWNED
  name: string;
  endpoint: string;
  tokenHash: string;
  capabilities: WorkerCapability;
  state: WorkerState;
  telemetry: WorkerTelemetryData;
  assignedJobId?: string;
  bootedAt?: string;
  lastHeartbeat: string;
}

export class WorkerPoolRegistryClass {
  private workers = new Map<string, RegisteredWorker>();
  private defaultVendorOrder: WorkerVendor[] = ["oracle", "github-actions", "byor", "gpu", "custom"];

  /**
   * Register a new worker or update an existing worker's heartbeat & state.
   */
  public registerWorker(worker: RegisteredWorker): void {
    const timestamp = worker.telemetry?.lastHeartbeatTimestamp ?? Date.now();
    const existing = this.workers.get(worker.workerId);
    if (existing) {
      existing.state = worker.state;
      existing.telemetry = { ...worker.telemetry, lastHeartbeatTimestamp: timestamp };
      existing.lastHeartbeat = new Date(timestamp).toISOString();
      if (worker.assignedJobId !== undefined) {
        existing.assignedJobId = worker.assignedJobId;
      }
    } else {
      this.workers.set(worker.workerId, {
        ...worker,
        lastHeartbeat: new Date(timestamp).toISOString(),
        telemetry: { ...worker.telemetry, lastHeartbeatTimestamp: timestamp },
      });
    }
  }

  /**
   * Process incoming heartbeat from worker.
   */
  public handleHeartbeat(
    workerId: string,
    token: string,
    state: WorkerState,
    telemetry: WorkerTelemetryData,
    activeJobId?: string
  ): boolean {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return false;
    }
    // Verify worker token
    if (worker.tokenHash && worker.tokenHash !== token) {
      console.warn(`[WorkerPoolRegistry] Unauthorized heartbeat attempt for worker ${workerId}`);
      return false;
    }

    worker.state = state;
    worker.telemetry = { ...telemetry, lastHeartbeatTimestamp: Date.now() };
    worker.lastHeartbeat = new Date().toISOString();
    worker.assignedJobId = activeJobId;
    return true;
  }

  /**
   * Return all registered workers.
   */
  public getAllWorkers(): RegisteredWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get active worker by ID.
   */
  public getWorker(workerId: string): RegisteredWorker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Find an available worker suitable for a job, evaluating tier security and tenant boundaries.
   */
  public findAvailableWorker(job: UniversalRenderJob): RegisteredWorker | null {
    for (const vendor of this.defaultVendorOrder) {
      const candidates = Array.from(this.workers.values()).filter((w) => {
        if (w.vendor !== vendor || w.state !== "READY" || !w.telemetry.b2Connectivity) {
          return false;
        }

        // BYOR USER_OWNED tenant isolation
        if (w.accessTier === "USER_OWNED" && w.tenantId !== job.tenantId) {
          return false; // Cannot use another tenant's BYOR worker
        }

        return true;
      });

      if (candidates.length > 0) {
        return candidates[0];
      }
    }
    return null;
  }

  /**
   * Mark worker as LOST if heartbeat missed beyond threshold (e.g. 60s).
   */
  public checkStaleWorkers(heartbeatTimeoutMs: number = 60000): string[] {
    const now = Date.now();
    const lostWorkerIds: string[] = [];

    for (const [id, worker] of this.workers.entries()) {
      if (worker.state === "READY" || worker.state === "BUSY") {
        const elapsed = now - worker.telemetry.lastHeartbeatTimestamp;
        if (elapsed > heartbeatTimeoutMs) {
          console.warn(`[WorkerPoolRegistry] Worker ${id} heartbeat timeout (${elapsed}ms). Marking LOST.`);
          worker.state = "LOST";
          lostWorkerIds.push(id);
        }
      }
    }
    return lostWorkerIds;
  }

  /**
   * Remove or deallocate worker entry.
   */
  public unregisterWorker(workerId: string): boolean {
    return this.workers.delete(workerId);
  }

  /**
   * Reset registry state (for tests).
   */
  public clear(): void {
    this.workers.clear();
  }
}

export const WorkerPoolRegistry = new WorkerPoolRegistryClass();
