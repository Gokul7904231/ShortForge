/**
 * FactoryOS Render Fabric — Worker Fleet Manager
 * Manages active worker fleet, heartbeats, state transitions, and draining.
 */

import {
  WorkerCapability,
  WorkerState,
} from "../contracts/RenderFabricContracts";
import { IRenderWorker } from "./RenderWorkerContract";
import { FabricEventJournal } from "../events/FabricEventJournal";

export interface ManagedWorkerRecord {
  readonly workerId: string;
  readonly worker: IRenderWorker;
  capability: WorkerCapability;
  state: WorkerState;
  lastHeartbeatAt: number;
  registeredAt: number;
  activeJobId?: string;
}

export class WorkerFleetManager {
  private workers: Map<string, ManagedWorkerRecord> = new Map();
  private journal: FabricEventJournal;
  private heartbeatTimeoutMs: number;

  constructor(heartbeatTimeoutMs: number = 15000, journal?: FabricEventJournal) {
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.journal = journal || FabricEventJournal.getInstance();
  }

  public async registerWorker(worker: IRenderWorker): Promise<ManagedWorkerRecord> {
    const cap = await worker.getCapabilities();
    const now = Date.now();

    const record: ManagedWorkerRecord = {
      workerId: worker.workerId,
      worker,
      capability: cap,
      state: "READY",
      lastHeartbeatAt: now,
      registeredAt: now,
    };

    this.workers.set(worker.workerId, record);

    this.journal.record({
      type: "worker.registered",
      subject: `worker:${worker.workerId}`,
      data: {
        workerId: worker.workerId,
        providerType: cap.providerType,
        gpuVendor: cap.gpuVendor,
        gpuModel: cap.gpuModel,
        vramMb: cap.vramMb,
      },
    });

    return record;
  }

  public processHeartbeat(workerId: string): { acknowledged: boolean; state: WorkerState } {
    const record = this.workers.get(workerId);
    if (!record) {
      return { acknowledged: false, state: "OFFLINE" };
    }

    const now = Date.now();
    record.lastHeartbeatAt = now;

    // Check remaining lifetime for ephemeral workers
    const remainingLifetime = record.capability.estimatedRemainingLifetimeSeconds;
    if (remainingLifetime > 0 && remainingLifetime < 120 && record.state === "READY") {
      record.state = "DRAINING";
      this.journal.record({
        type: "worker.draining",
        subject: `worker:${workerId}`,
        data: { workerId, remainingLifetime },
      });
    }

    this.journal.record({
      type: "worker.heartbeat",
      subject: `worker:${workerId}`,
      data: { workerId, state: record.state },
    });

    return { acknowledged: true, state: record.state };
  }

  public getAvailableWorkers(): ManagedWorkerRecord[] {
    const now = Date.now();
    const available: ManagedWorkerRecord[] = [];

    for (const record of this.workers.values()) {
      // Heartbeat timeout check
      if (now - record.lastHeartbeatAt > this.heartbeatTimeoutMs) {
        if (record.state !== "OFFLINE") {
          record.state = "OFFLINE";
          this.journal.record({
            type: "worker.lost",
            subject: `worker:${record.workerId}`,
            data: { workerId: record.workerId, reason: "Heartbeat timeout" },
          });
        }
        continue;
      }

      if (record.state === "READY") {
        available.push(record);
      }
    }

    return available;
  }

  public getWorker(workerId: string): ManagedWorkerRecord | undefined {
    return this.workers.get(workerId);
  }

  public getAllWorkers(): ManagedWorkerRecord[] {
    return Array.from(this.workers.values());
  }

  public unregisterWorker(workerId: string): void {
    const record = this.workers.get(workerId);
    if (record) {
      record.state = "OFFLINE";
      this.workers.delete(workerId);
    }
  }
}
