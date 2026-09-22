/**
 * ShortForge / FactoryOS — RuntimeStateProvider Implementation
 * Authoritative live operational state provider.
 */

import {
  IRuntimeStateProvider,
  RuntimeSnapshot,
  WorkerState,
} from "./RuntimeStateContracts";

export class RuntimeStateProvider implements IRuntimeStateProvider {
  private currentSnapshot: RuntimeSnapshot;

  constructor(initialSnapshot?: Partial<RuntimeSnapshot>) {
    this.currentSnapshot = {
      capturedAt: new Date().toISOString(),
      factoryStatus: initialSnapshot?.factoryStatus || "HEALTHY",
      activeMissions: initialSnapshot?.activeMissions || [],
      workers: initialSnapshot?.workers || [
        {
          workerId: "basic_fastapi_pool_01",
          pool: "BASIC_FASTAPI",
          url: "http://localhost:8100",
          status: "IDLE",
          activeJobsCount: 0,
          lastHeartbeatAt: new Date().toISOString(),
        },
      ],
      queue: initialSnapshot?.queue || {
        pendingCount: 0,
        processingCount: 0,
        failedCount: 0,
        completedCount: 0,
      },
      currentBlockers: initialSnapshot?.currentBlockers || [],
      currentUserRequest: initialSnapshot?.currentUserRequest,
    };
  }

  public async getSnapshot(): Promise<RuntimeSnapshot> {
    return {
      ...this.currentSnapshot,
      capturedAt: new Date().toISOString(),
    };
  }

  public async getWorkerState(workerId: string): Promise<WorkerState | null> {
    const worker = this.currentSnapshot.workers.find((w) => w.workerId === workerId);
    return worker || null;
  }

  public async getCurrentBlockers(): Promise<string[]> {
    return [...this.currentSnapshot.currentBlockers];
  }

  public updateLiveState(partial: Partial<RuntimeSnapshot>): void {
    this.currentSnapshot = {
      ...this.currentSnapshot,
      ...partial,
      capturedAt: new Date().toISOString(),
    };
  }
}
