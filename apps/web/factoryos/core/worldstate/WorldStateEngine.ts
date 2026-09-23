/**
 * FactoryOS v1 — Authoritative Persistent World State Engine
 * Manages operational ground truth across floors, workers, cases, repairs, and resources.
 */

import { randomUUID } from "node:crypto";
import type {
  FloorState,
  FloorStatus,
  SystemResourceState,
  WorkerHealthStatus,
  WorkerState,
  WorldState,
  WorldStateSnapshotContract,
} from "../contracts/WorldStateContracts";
import type { IWorldStateRepository } from "../database/DatabaseContracts";
import { InMemoryWorldStateRepository } from "../database/InMemoryDatabase";

export type WorldStateListener = (state: WorldState) => void;

export class WorldStateEngine {
  private currentState: WorldState;
  private repository: IWorldStateRepository;
  private listeners: Set<WorldStateListener> = new Set();
  private autoPersist: boolean;

  constructor(
    repository: IWorldStateRepository = new InMemoryWorldStateRepository(),
    autoPersist: boolean = true
  ) {
    this.repository = repository;
    this.autoPersist = autoPersist;
    this.currentState = this.createDefaultState();
  }

  private createDefaultState(): WorldState {
    const now = new Date().toISOString();
    return {
      schemaVersion: "1.0.0",
      updatedAt: now,
      sequenceNumber: 1,
      factoryStatus: "OPERATIONAL",
      globalGoal: undefined,
      floors: {
        floor00_analyst: {
          floorId: "floor00_analyst",
          name: "Floor 00 — Strategic Intelligence & Analyst",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor01_strategy: {
          floorId: "floor01_strategy",
          name: "Floor 01 — Strategic Orchestration",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor02_scripting: {
          floorId: "floor02_scripting",
          name: "Floor 02 — Scripting & Dialogue",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor03_asset_realization: {
          floorId: "floor03_asset_realization",
          name: "Floor 03 — Asset Realization & Audio",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor04_media_synthesis: {
          floorId: "floor04_media_synthesis",
          name: "Floor 04 — Media & Voice Synthesis",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor05_timeline_composition: {
          floorId: "floor05_timeline_composition",
          name: "Floor 05 — Timeline & Render Intent Composition",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor06_rendering: {
          floorId: "floor06_rendering",
          name: "Floor 06 — Production Video Rendering",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
        floor07_compliance: {
          floorId: "floor07_compliance",
          name: "Floor 07 — Enterprise Compliance & Verification",
          status: "ONLINE",
          activeWorkers: 1,
          queueDepth: 0,
          activeJobs: [],
          lastHeartbeat: now,
          recentAnomalies: [],
        },
      },
      workers: {},
      activeCaseIds: [],
      activeRunIds: [],
      activeRepairs: [],
      resources: {
        cpuPercent: 15.0,
        memoryUsedMb: 2048,
        memoryTotalMb: 16384,
        vramUsedMb: 1024,
        vramTotalMb: 8192,
        gpuAvailable: true,
        networkOnline: true,
        driveAvailable: true,
      },
      systemConfidence: 0.98,
    };
  }

  getState(): WorldState {
    return structuredClone(this.currentState);
  }

  async restore(): Promise<boolean> {
    const saved = await this.repository.getLatestState();
    if (saved) {
      this.currentState = structuredClone(saved);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  async persist(): Promise<void> {
    await this.repository.saveState(structuredClone(this.currentState));
  }

  private mutateState(updater: (draft: WorldState) => void): void {
    const draft = structuredClone(this.currentState);
    updater(draft);
    draft.updatedAt = new Date().toISOString();
    draft.sequenceNumber = (draft.sequenceNumber || 0) + 1;
    this.currentState = draft;
    this.notifyListeners();
    if (this.autoPersist) {
      this.persist().catch(() => {});
    }
  }

  subscribe(listener: WorldStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (e) {
        // Safe swallow
      }
    }
  }

  setFactoryStatus(status: WorldState["factoryStatus"]): void {
    this.mutateState((draft) => {
      draft.factoryStatus = status;
    });
  }

  setGlobalGoal(goal?: string): void {
    this.mutateState((draft) => {
      draft.globalGoal = goal;
    });
  }

  setSystemConfidence(confidence: number): void {
    this.mutateState((draft) => {
      draft.systemConfidence = Math.max(0, Math.min(1, confidence));
    });
  }

  updateFloorStatus(
    floorId: string,
    status: FloorStatus,
    objective?: string,
    activeJobs?: string[]
  ): void {
    this.mutateState((draft) => {
      const existing = draft.floors[floorId];
      if (existing) {
        draft.floors[floorId] = {
          ...existing,
          status,
          currentObjective: objective !== undefined ? objective : existing.currentObjective,
          activeJobs: activeJobs !== undefined ? activeJobs : existing.activeJobs,
          lastHeartbeat: new Date().toISOString(),
        };
      } else {
        draft.floors[floorId] = {
          floorId,
          name: floorId,
          status,
          activeWorkers: 0,
          queueDepth: 0,
          activeJobs: activeJobs || [],
          lastHeartbeat: new Date().toISOString(),
          currentObjective: objective,
          recentAnomalies: [],
        };
      }
    });
  }

  recordFloorAnomaly(floorId: string, anomalyId: string): void {
    this.mutateState((draft) => {
      const floor = draft.floors[floorId];
      if (floor) {
        if (!floor.recentAnomalies.includes(anomalyId)) {
          floor.recentAnomalies.push(anomalyId);
          if (floor.recentAnomalies.length > 20) {
            floor.recentAnomalies.shift();
          }
        }
      }
    });
  }

  registerWorker(worker: WorkerState): void {
    this.mutateState((draft) => {
      draft.workers[worker.workerId] = structuredClone(worker);
    });
  }

  updateWorkerHeartbeat(
    workerId: string,
    status?: WorkerHealthStatus,
    currentTaskId?: string,
    currentCaseId?: string,
    metricsUpdate?: Partial<WorkerState["metrics"]>
  ): void {
    this.mutateState((draft) => {
      const worker = draft.workers[workerId];
      if (worker) {
        draft.workers[workerId] = {
          ...worker,
          status: status !== undefined ? status : worker.status,
          currentTaskId: currentTaskId !== undefined ? currentTaskId : worker.currentTaskId,
          currentCaseId: currentCaseId !== undefined ? currentCaseId : worker.currentCaseId,
          lastSeen: new Date().toISOString(),
          metrics: {
            ...worker.metrics,
            ...(metricsUpdate || {}),
          },
        };
      } else {
        draft.workers[workerId] = {
          workerId,
          role: "WORKER",
          specialization: "GENERAL",
          status: status || "HEALTHY",
          currentTaskId,
          currentCaseId,
          lastSeen: new Date().toISOString(),
          metrics: {
            tasksCompleted: 0,
            tasksFailed: 0,
            uptimeSeconds: 0,
            averageLatencyMs: 0,
            ...(metricsUpdate || {}),
          },
        };
      }
    });
  }

  removeWorker(workerId: string): void {
    this.mutateState((draft) => {
      delete draft.workers[workerId];
    });
  }

  addActiveCase(caseId: string): void {
    this.mutateState((draft) => {
      if (!draft.activeCaseIds.includes(caseId)) {
        draft.activeCaseIds.push(caseId);
      }
      if (draft.activeCaseIds.length > 0 && draft.factoryStatus === "OPERATIONAL") {
        draft.factoryStatus = "ATTENTION_REQUIRED";
      }
    });
  }

  removeActiveCase(caseId: string): void {
    this.mutateState((draft) => {
      draft.activeCaseIds = draft.activeCaseIds.filter((id) => id !== caseId);
      if (draft.activeCaseIds.length === 0 && draft.factoryStatus === "ATTENTION_REQUIRED") {
        draft.factoryStatus = "OPERATIONAL";
      }
    });
  }

  addActiveRun(runId: string): void {
    this.mutateState((draft) => {
      if (!draft.activeRunIds.includes(runId)) {
        draft.activeRunIds.push(runId);
      }
    });
  }

  removeActiveRun(runId: string): void {
    this.mutateState((draft) => {
      draft.activeRunIds = draft.activeRunIds.filter((id) => id !== runId);
    });
  }

  addActiveRepair(repairId: string): void {
    this.mutateState((draft) => {
      if (!draft.activeRepairs.includes(repairId)) {
        draft.activeRepairs.push(repairId);
      }
    });
  }

  removeActiveRepair(repairId: string): void {
    this.mutateState((draft) => {
      draft.activeRepairs = draft.activeRepairs.filter((id) => id !== repairId);
    });
  }

  updateResources(resources: Partial<SystemResourceState>): void {
    this.mutateState((draft) => {
      draft.resources = {
        ...draft.resources,
        ...resources,
      };
    });
  }

  private provenanceLog: Array<{
    provenanceId: string;
    actor: string;
    action: string;
    reason: string;
    correlationId?: string;
    sequenceNumber: number;
    timestamp: string;
  }> = [];

  recordProvenance(actor: string, action: string, reason: string, correlationId?: string): void {
    const provId = `prov_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
    this.provenanceLog.push({
      provenanceId: provId,
      actor,
      action,
      reason,
      correlationId,
      sequenceNumber: this.currentState.sequenceNumber,
      timestamp: new Date().toISOString(),
    });
    if (this.provenanceLog.length > 500) this.provenanceLog.shift();
  }

  getProvenanceLog(limit: number = 50) {
    return structuredClone(this.provenanceLog.slice(-limit));
  }

  getFloorProjection(floorId: string) {
    const floor = this.currentState.floors[floorId];
    return floor ? structuredClone(floor) : null;
  }

  getWorkerProjection(workerId: string) {
    const worker = this.currentState.workers[workerId];
    return worker ? structuredClone(worker) : null;
  }

  getSnapshot(correlationId?: string): WorldStateSnapshotContract & { snapshotAt: string } {
    const now = new Date().toISOString();
    return {
      worldStateId: `ws_snap_${this.currentState.sequenceNumber}_${now.replace(/[:.-]/g, "")}`,
      schemaVersion: this.currentState.schemaVersion,
      sequenceNumber: this.currentState.sequenceNumber,
      timestamp: this.currentState.updatedAt,
      capturedAt: now,
      sourceVersion: "1.0.0",
      correlationId,
      state: structuredClone(this.currentState),
      snapshotAt: now, // For backwards compatibility
    };
  }
}
