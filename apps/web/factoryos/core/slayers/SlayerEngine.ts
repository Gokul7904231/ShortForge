/**
 * FactoryOS Frontier v2 — Autonomous Slayer Swarm Engine (Master Coordinator)
 * Coordinates continuous background detective patrols, zone leases, cross-floor anomaly clustering,
 * reputation persistence, and dynamic health monitoring.
 */

import type { BaseSlayer } from "./SlayerBase";
import {
  ComputeSlayer,
  GeneralPatrolSlayer,
  PipelineSlayer,
  QualitySlayer,
  RenderingSlayer,
  SecuritySlayer,
} from "./SpecializedSlayers";
import { SlayerCorrelationEngine } from "./SlayerCorrelationEngine";
import type { CaseManager } from "../cases/CaseManager";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import type { LeaseManager } from "../leases/LeaseManager";
import type { IReputationRepository } from "../database/DatabaseContracts";
import { InMemoryReputationRepository } from "../database/InMemoryDatabase";
import type { SlayerHealth, SlayerCluster } from "../contracts/SlayerContracts";
import { SlayerPrimeEngine } from "./prime/SlayerPrimeEngine";

export class SlayerEngine {
  private slayers: Map<string, BaseSlayer> = new Map();
  private caseManager: CaseManager;
  private eventBus: DurableEventBus;
  private worldState: WorldStateEngine;
  private leaseManager?: LeaseManager;
  private reputationRepo: IReputationRepository;
  public readonly correlationEngine: SlayerCorrelationEngine;
  public readonly prime: SlayerPrimeEngine;

  private isRunning: boolean = false;
  private isPatrolling: boolean = false;
  private patrolTimer: NodeJS.Timeout | null = null;
  private patrolIntervalMs: number;

  constructor(
    caseManager: CaseManager,
    eventBus: DurableEventBus,
    worldState: WorldStateEngine,
    reputationRepo: IReputationRepository = new InMemoryReputationRepository(),
    patrolIntervalMs: number = 2000,
    leaseManager?: LeaseManager
  ) {
    this.caseManager = caseManager;
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.reputationRepo = reputationRepo;
    this.patrolIntervalMs = patrolIntervalMs;
    this.leaseManager = leaseManager;
    this.correlationEngine = new SlayerCorrelationEngine();
    this.prime = new SlayerPrimeEngine(eventBus, leaseManager);

    this.registerDefaultSlayers();

    this.worldState.subscribe((state) => {
      if (this.isRunning && !this.isPatrolling) {
        const hasIssue = state && Object.values(state.floors).some((f) => f.status !== "ONLINE");
        if (hasIssue) {
          this.runPatrolCycle().catch(() => {});
        }
      }
    });
  }

  private registerDefaultSlayers(): void {
    const slayers: BaseSlayer[] = [
      new GeneralPatrolSlayer(this.caseManager, this.eventBus, this.leaseManager),
      new ComputeSlayer(this.caseManager, this.eventBus, this.leaseManager),
      new PipelineSlayer(this.caseManager, this.eventBus, this.leaseManager),
      new RenderingSlayer(this.caseManager, this.eventBus, this.leaseManager),
      new QualitySlayer(this.caseManager, this.eventBus, this.leaseManager),
      new SecuritySlayer(this.caseManager, this.eventBus, this.leaseManager),
    ];

    for (const slayer of slayers) {
      this.slayers.set(slayer.config.agentId, slayer);
      this.worldState.registerWorker({
        workerId: slayer.config.agentId,
        role: "SLAYER",
        specialization: slayer.config.specialization,
        status: "HEALTHY",
        lastSeen: new Date().toISOString(),
        metrics: {
          tasksCompleted: 0,
          tasksFailed: 0,
          uptimeSeconds: 0,
          averageLatencyMs: 50,
        },
      });
    }
  }

  getSlayer(agentId: string): BaseSlayer | undefined {
    return this.slayers.get(agentId);
  }

  getAllSlayers(): BaseSlayer[] {
    return Array.from(this.slayers.values());
  }

  getAllSlayerHealth(): SlayerHealth[] {
    return Array.from(this.slayers.values()).map((s) => s.getHealth());
  }

  getPrime(): SlayerPrimeEngine {
    return this.prime;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.prime.start();

    // Load persisted reputations and reacquire zone leases
    for (const slayer of this.slayers.values()) {
      const saved = await this.reputationRepo.getSlayerReputation(slayer.config.agentId);
      if (saved) {
        slayer.getReputation().xp = saved.xp;
        slayer.getReputation().trustScore = saved.trustScore;
        slayer.getReputation().validAnomalies = saved.validAnomalies;
        slayer.getReputation().falsePositives = saved.falsePositives;
      }
      await slayer.ensureZoneOwnership();
    }

    this.patrolTimer = setInterval(() => {
      this.runPatrolCycle().catch(() => {});
    }, this.patrolIntervalMs);

    await this.runPatrolCycle();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.prime.stop();
    if (this.patrolTimer) {
      clearInterval(this.patrolTimer);
      this.patrolTimer = null;
    }

    // Persist reputations on shutdown
    for (const slayer of this.slayers.values()) {
      await this.reputationRepo.saveSlayerReputation(slayer.getReputation());
    }
  }

  /**
   * The Master Slayer Swarm Patrol Cycle:
   * Continuous, non-blocking execution across all specialized detectives.
   */
  async runPatrolCycle(): Promise<void> {
    if (this.isPatrolling) return;
    this.isPatrolling = true;

    try {
      const currentState = this.worldState.getState();

      // 1. Inspect specialized domains concurrently; failures are isolated per Slayer.
      await Promise.allSettled(
        Array.from(this.slayers.values()).map(async (slayer) => {
          this.worldState.updateWorkerHeartbeat(slayer.config.agentId, "HEALTHY");
          await slayer.patrolAndInvestigate(currentState);
        })
      );

      // 2. Cross-Floor Anomaly Correlation
      const allCases = await this.caseManager.getAllCases();
      if (allCases.length >= 2) {
        const clusters = this.correlationEngine.correlateCases(allCases);
        for (const cluster of clusters) {
          await this.eventBus.publish("SLAYER_ANOMALY_CORRELATED", {
            clusterId: cluster.clusterId,
            correlationType: cluster.correlationType,
            affectedFloorIds: cluster.affectedFloorIds,
            memberCaseIds: cluster.memberCaseIds,
            rootCauseHypothesis: cluster.rootCauseHypothesis,
            confidence: cluster.confidence,
          });
        }
      }
    } finally {
      this.isPatrolling = false;
    }
  }

  async updateSlayerReputation(agentId: string, verified: boolean, isFalsePositive: boolean = false): Promise<void> {
    const slayer = this.slayers.get(agentId);
    if (slayer) {
      slayer.updateReputation(verified, isFalsePositive);
      await this.reputationRepo.saveSlayerReputation(slayer.getReputation());
    }
  }
}
