/**
 * FactoryOS Frontier v2 — Phase 7: Autonomous Factory Watchdog 2.0 (Whole-Agent Supervisor)
 * Continuously monitors Overseer, Floor Guardians, Slayer Swarm, Healers, Event Consumers, and Task Leases.
 * Automatically recovers failed agents, reclaims abandoned leases, and quarantines repeat offenders.
 */

import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { CaseManager } from "../cases/CaseManager";
import type { LeaseManager } from "../leases/LeaseManager";
import type { MissionManager } from "../missions/MissionManager";
import type { MissionWorkManager } from "../work/MissionWorkManager";
import { HeartbeatTracker, DEFAULT_WATCHDOG_POLICY } from "./HeartbeatTracker";
import type {
  AgentHeartbeatRecord,
  SubsystemType,
  WatchdogHealthSweepReport,
  WatchdogSupervisionPolicy,
} from "../contracts/WatchdogContracts";

export interface WatchdogHealthReport {
  readonly healthyWorkers: string[];
  readonly staleWorkers: string[];
  readonly failedWorkers: string[];
  readonly recoveredWorkers: string[];
  readonly quarantinedWorkers: string[];
  readonly reclaimedTasks: string[];
  readonly monitoredAgents: {
    readonly overseerOnline: boolean;
    readonly activeGuardiansCount: number;
    readonly activeSlayersCount: number;
    readonly activeHealersCount: number;
  };
  readonly missionBreaches?: { missionId: string; breachReason: string }[];
  readonly timestamp: string;
}

export class FactoryWatchdog {
  private worldState: WorldStateEngine;
  private eventBus: DurableEventBus;
  private caseManager: CaseManager;
  private leaseManager?: LeaseManager;
  private missionManager?: MissionManager;
  private workManager?: MissionWorkManager;
  private isRunning: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private failureCounts: Map<string, number> = new Map();
  private staleThresholdMs: number;

  public readonly heartbeatTracker: HeartbeatTracker;

  constructor(
    worldState: WorldStateEngine,
    eventBus: DurableEventBus,
    caseManager: CaseManager,
    leaseManager?: LeaseManager,
    staleThresholdMs: number = 15000,
    missionManager?: MissionManager,
    policy: Partial<WatchdogSupervisionPolicy> = {},
    workManager?: MissionWorkManager,
  ) {
    this.worldState = worldState;
    this.eventBus = eventBus;
    this.caseManager = caseManager;
    this.leaseManager = leaseManager;
    this.staleThresholdMs = staleThresholdMs;
    this.missionManager = missionManager;
    this.workManager = workManager;
    this.heartbeatTracker = new HeartbeatTracker({
      staleThresholdMs,
      ...policy,
    });
  }

  /**
   * Registers a direct agent/subsystem for whole-agent supervision.
   */
  registerAgent(
    componentId: string,
    componentType: SubsystemType,
    expectedIntervalMs: number = 2000,
    metadata?: Record<string, unknown>
  ): AgentHeartbeatRecord {
    return this.heartbeatTracker.register(componentId, componentType, expectedIntervalMs, metadata);
  }

  /**
   * Records a heartbeat signal for a tracked agent.
   */
  recordHeartbeat(componentId: string, metadata?: Record<string, unknown>): boolean {
    const success = this.heartbeatTracker.recordHeartbeat(componentId, metadata);
    if (this.worldState) {
      this.worldState.updateWorkerHeartbeat(componentId, "HEALTHY");
    }
    return success;
  }

  start(intervalMs: number = 2000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.monitorInterval = setInterval(() => {
      this.runHealthCheck().catch(() => {});
    }, intervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  async runHealthCheck(): Promise<WatchdogHealthReport> {
    const now = Date.now();
    const currentState = this.worldState.getState();
    const healthy: string[] = [];
    const stale: string[] = [];
    const failed: string[] = [];
    const recovered: string[] = [];
    const quarantined: string[] = [];
    const reclaimed: string[] = [];

    let overseerOnline = false;
    let activeGuardiansCount = 0;
    let activeSlayersCount = 0;
    let activeHealersCount = 0;

    // 1. Inspect all registered agents and workers in WorldState
    for (const [workerId, worker] of Object.entries(currentState.workers)) {
      const lastSeenTime = new Date(worker.lastSeen).getTime();
      const elapsed = now - lastSeenTime;

      // Count agent specializations
      if (worker.role === "OPERATOR" && worker.status === "HEALTHY") overseerOnline = true;
      if (worker.role === "GUARDIAN" && worker.status === "HEALTHY") activeGuardiansCount += 1;
      if (worker.role === "SLAYER" && worker.status === "HEALTHY") activeSlayersCount += 1;
      if (worker.role === "HEALER" && worker.status === "HEALTHY") activeHealersCount += 1;

      // Ensure registered in HeartbeatTracker
      const subType: SubsystemType =
        worker.role === "OPERATOR"
          ? "OVERSEER"
          : worker.role === "GUARDIAN"
          ? "GUARDIAN"
          : worker.role === "SLAYER"
          ? "SLAYER"
          : worker.role === "HEALER"
          ? "HEALER"
          : worker.role === "VALIDATOR"
          ? "VALIDATOR"
          : "WORKER";

      this.heartbeatTracker.register(workerId, subType, this.staleThresholdMs / 3);

      if (worker.status === "FAILED") {
        failed.push(workerId);
        const count = (this.failureCounts.get(workerId) || 0) + 1;
        this.failureCounts.set(workerId, count);

        const recoveryAttempt = this.heartbeatTracker.attemptRecovery(workerId, now);

        if (count >= 3 || recoveryAttempt.quarantined) {
          // Repeated failure: Quarantine and create system case
          quarantined.push(workerId);
          this.worldState.updateWorkerHeartbeat(workerId, "QUARANTINED");
          this.heartbeatTracker.quarantine(workerId);

          await this.caseManager.createCase({
            title: `[Watchdog] Agent/Worker ${workerId} quarantined due to repeated failures`,
            description: `Agent ${workerId} failed ${count} consecutive health checks. Quarantined for supervisor triage.`,
            floorId: "system_kernel",
            targetWorker: workerId,
            category: "WORKER_STALL",
            severity: "HIGH",
            detectorId: "factory_watchdog",
            symptoms: [`Agent ${workerId} repeated failure count: ${count}`, recoveryAttempt.reason],
            observedState: { worker, failureCount: count },
          });

          await this.eventBus.publish("AGENT_QUARANTINED", {
            agentId: workerId,
            failureCount: count,
            timestamp: new Date().toISOString(),
          });
        } else if (recoveryAttempt.allowed) {
          // Auto-recover worker
          recovered.push(workerId);
          this.worldState.updateWorkerHeartbeat(workerId, "HEALTHY");
          this.heartbeatTracker.markRecovered(workerId);

          await this.eventBus.publish("AGENT_RECOVERED", {
            agentId: workerId,
            recoveryAttempt: count,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (elapsed > this.staleThresholdMs && worker.status !== "QUARANTINED") {
        stale.push(workerId);
        this.worldState.updateWorkerHeartbeat(workerId, "DEGRADED");
      } else if (worker.status === "HEALTHY") {
        healthy.push(workerId);
        this.failureCounts.delete(workerId);
        this.heartbeatTracker.recordHeartbeat(workerId);
      }
    }

    // 2. Evaluate direct HeartbeatTracker records
    const directHealth = this.heartbeatTracker.evaluateHealth(now);
    for (const f of directHealth.failed) {
      if (!failed.includes(f.componentId) && !quarantined.includes(f.componentId)) {
        failed.push(f.componentId);
      }
    }

    // 3. Reclaim durable mission work before releasing orphan leases.
    if (this.workManager && this.missionManager) {
      const activeMissions = await this.missionManager.getActiveMissions();
      for (const mission of activeMissions) {
        const recovered = await this.workManager.reclaimExpired(mission.missionId, "factory_watchdog");
        reclaimed.push(...recovered.map((task) => task.taskId));
      }
    }

    // 4. Inspect any remaining expired leases that are not attached to durable mission work.
    if (this.leaseManager) {
      const expiredLeases = await this.leaseManager.getRecoverableTasks();
      for (const lease of expiredLeases) {
        reclaimed.push(lease.taskId);
        await this.leaseManager.release(lease.taskId, lease.ownerAgentId);
        await this.eventBus.publish("LEASE_RECLAIMED", {
          taskId: lease.taskId,
          previousOwner: lease.ownerAgentId,
        });
      }
    }

    // 5. Sweep active mission budgets
    let missionBreaches: { missionId: string; breachReason: string }[] | undefined;
    if (this.missionManager && typeof (this.missionManager as any).checkActiveMissionBudgets === "function") {
      const breaches = await (this.missionManager as any).checkActiveMissionBudgets();
      missionBreaches = breaches || [];
    }

    const report: WatchdogHealthReport = {
      healthyWorkers: Array.from(new Set(healthy)),
      staleWorkers: Array.from(new Set(stale)),
      failedWorkers: Array.from(new Set(failed)),
      recoveredWorkers: Array.from(new Set(recovered)),
      quarantinedWorkers: Array.from(new Set(quarantined)),
      reclaimedTasks: Array.from(new Set(reclaimed)),
      monitoredAgents: {
        overseerOnline,
        activeGuardiansCount,
        activeSlayersCount,
        activeHealersCount,
      },
      missionBreaches,
      timestamp: new Date().toISOString(),
    };

    await this.eventBus.publish("WATCHDOG_HEALTH_SWEEP", report as any);
    return report;
  }
}
