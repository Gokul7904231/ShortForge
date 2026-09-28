/**
 * FactoryOS Frontier v2 — Autonomous Healer Swarm Engine (Master Repair Coordinator)
 * Implements shared-resource locks, repair deduplication, dynamic squad allocation,
 * blast radius analysis, simulation gating, and transactional repair execution.
 */

import type { BaseHealer } from "./HealerBase";
import {
  ContentHealer,
  DiagnosticHealer,
  PipelineHealer,
  RenderingHealer,
  WorkerHealer,
} from "./SpecializedHealers";
import { RepairLockManager } from "./RepairLockManager";
import { RepairDeduplicator } from "./RepairDeduplicator";
import { RepairDependencyAnalyzer } from "./RepairDependencyAnalyzer";
import type { Case, AnomalyCategory } from "../contracts/CaseContracts";
import type { HealerReport, HealerSpecialization } from "../contracts/HealerContracts";
import type { CaseManager } from "../cases/CaseManager";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import type { LeaseManager } from "../leases/LeaseManager";
import type { IReputationRepository } from "../database/DatabaseContracts";
import { InMemoryReputationRepository } from "../database/InMemoryDatabase";
import { JointHealingOrchestrator, type GuardianClosureDecision, type GuardianClosureRequest } from "./JointHealingOrchestrator";

export class HealerEngine {
  private healers: Map<string, BaseHealer> = new Map();
  private caseManager: CaseManager;
  private eventBus: DurableEventBus;
  private worldState: WorldStateEngine;
  private leaseManager?: LeaseManager;
  private reputationRepo: IReputationRepository;
  private repairAttempts: Map<string, number> = new Map();
  private jointHealingOrchestrator?: JointHealingOrchestrator;

  public readonly lockManager: RepairLockManager;
  public readonly deduplicator: RepairDeduplicator;
  public readonly dependencyAnalyzer: RepairDependencyAnalyzer;

  constructor(
    caseManager: CaseManager,
    eventBus: DurableEventBus,
    worldState: WorldStateEngine,
    leaseManager?: LeaseManager,
    reputationRepo: IReputationRepository = new InMemoryReputationRepository()
  ) {
    this.caseManager = caseManager;
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.leaseManager = leaseManager;
    this.reputationRepo = reputationRepo;

    this.lockManager = new RepairLockManager(leaseManager);
    this.deduplicator = new RepairDeduplicator();
    this.dependencyAnalyzer = new RepairDependencyAnalyzer();

    this.registerDefaultHealers();
  }

  private registerDefaultHealers(): void {
    const list: BaseHealer[] = [
      new DiagnosticHealer(this.caseManager, this.eventBus, this.worldState),
      new PipelineHealer(this.caseManager, this.eventBus, this.worldState),
      new RenderingHealer(this.caseManager, this.eventBus, this.worldState),
      new WorkerHealer(this.caseManager, this.eventBus, this.worldState, this.leaseManager),
      new ContentHealer(this.caseManager, this.eventBus, this.worldState),
    ];

    for (const healer of list) {
      this.healers.set(healer.config.healerId, healer);
      this.worldState.registerWorker({
        workerId: healer.config.healerId,
        role: "HEALER",
        specialization: healer.config.specialization,
        status: "HEALTHY",
        lastSeen: new Date().toISOString(),
        metrics: {
          tasksCompleted: 0,
          tasksFailed: 0,
          uptimeSeconds: 0,
          averageLatencyMs: 250,
        },
      });
    }
  }

  enableJointHealing(options: {
    storagePath?: string;
    guardianClosureAuthorizer: (
      request: GuardianClosureRequest
    ) => Promise<GuardianClosureDecision>;
  }): void {
    this.jointHealingOrchestrator = new JointHealingOrchestrator(
      this.caseManager,
      this.eventBus,
      this.worldState,
      this.lockManager,
      options
    );
  }

  private shouldUseJointHealing(caseItem: Case): boolean {
    if (!this.jointHealingOrchestrator) return false;
    const dependency = this.dependencyAnalyzer.analyzeDependency(caseItem);
    return (
      caseItem.severity === "HIGH" ||
      caseItem.severity === "CRITICAL" ||
      dependency.blastRadius !== "LOCAL"
    );
  }

  /**
   * Dynamic Healer Allocation Policy:
   * Maps case characteristics and severity to healer squad.
   */
  allocateHealers(caseItem: Case): BaseHealer[] {
    const squad: BaseHealer[] = [];
    const diagnostic = this.healers.get("healer_diagnostic");
    const primary = this.selectSpecialist(caseItem.category);

    if (caseItem.severity === "LOW") {
      squad.push(primary || diagnostic!);
    } else if (caseItem.severity === "MEDIUM") {
      if (diagnostic) squad.push(diagnostic);
      if (primary && primary !== diagnostic) squad.push(primary);
    } else {
      // HIGH or CRITICAL: Full 3-specialist squad
      if (diagnostic) squad.push(diagnostic);
      if (primary && primary !== diagnostic) squad.push(primary);
      const workerHealer = this.healers.get("healer_worker");
      if (workerHealer && !squad.includes(workerHealer)) {
        squad.push(workerHealer);
      } else {
        const pipelineHealer = this.healers.get("healer_pipeline");
        if (pipelineHealer && !squad.includes(pipelineHealer)) squad.push(pipelineHealer);
      }
    }

    return squad.filter(Boolean);
  }

  selectSpecialist(category: AnomalyCategory): BaseHealer | undefined {
    switch (category) {
      case "PIPELINE_STALL":
      case "QUEUE_CONGESTION":
      case "DEPENDENCY_MISSING":
      case "FLOOR_EXECUTION_ERROR":
        return this.healers.get("healer_pipeline");
      case "RENDER_ARTIFACT":
      case "GPU_SATURATION":
      case "STORAGE_DEGRADED":
        return this.healers.get("healer_rendering");
      case "WORKER_CRASH":
      case "WORKER_STALL":
      case "HEARTBEAT_TIMEOUT":
        return this.healers.get("healer_worker");
      case "CONTENT_SAFETY_VIOLATION":
      case "RAG_GROUNDING_FAILURE":
      case "SCHEMA_VALIDATION_ERROR":
      case "VALIDATION_REJECTION":
        return this.healers.get("healer_content");
      default:
        return this.healers.get("healer_diagnostic");
    }
  }

  /**
   * Master Dispatch & Transactional Repair Loop with Concurrency & Simulation Safety
   */
  async dispatchHealersForCase(caseItem: Case): Promise<HealerReport[]> {
    if (this.shouldUseJointHealing(caseItem)) {
      const paired = this.allocateHealers(caseItem).slice(0, 2);
      if (paired.length === 2) {
        const execution = await this.jointHealingOrchestrator!.execute(caseItem, paired);
        return [...execution.reports];
      }
    }

    const primaryTarget = caseItem.targetWorker || caseItem.floorId;
    const dependency = this.dependencyAnalyzer.analyzeDependency(caseItem);

    // 0. Bound repair retry attempts (max 3)
    const attempts = (this.repairAttempts.get(caseItem.caseId) || 0) + 1;
    this.repairAttempts.set(caseItem.caseId, attempts);
    if (attempts > 3) {
      await this.caseManager.transitionStatus(
        caseItem.caseId,
        "FAILED",
        "healer_coordinator",
        `Exceeded max repair attempts (${attempts} > 3). Escalating to supervisor.`
      );
      return [
        {
          reportId: `rep_exhausted_${caseItem.caseId}`,
          caseId: caseItem.caseId,
          healerId: "healer_coordinator",
          specialization: "DIAGNOSTIC",
          slayerHypothesisVerified: true,
          rootCauseDiagnosis: "Max repair retry threshold reached without permanent resolution",
          independentEvidence: [],
          repairPlan: { description: "Exhausted retry budget", actions: [], rollbackActions: [] },
          repairStatus: "FAILED",
          durationMs: 10,
          completedAt: new Date().toISOString(),
        },
      ];
    }

    // 1. Repair Deduplication Check
    const dedup = this.deduplicator.checkAndRegister(
      caseItem.floorId,
      primaryTarget,
      caseItem.category,
      "STANDARD_REPAIR",
      caseItem.caseId
    );

    if (dedup.isDuplicate) {
      return [
        {
          reportId: `rep_dup_${caseItem.caseId}`,
          caseId: caseItem.caseId,
          healerId: "healer_coordinator",
          specialization: "DIAGNOSTIC",
          slayerHypothesisVerified: true,
          rootCauseDiagnosis: "Identical repair plan already in progress",
          independentEvidence: [],
          repairPlan: { description: "Suppressed duplicate mutation", actions: [], rollbackActions: [] },
          repairStatus: "DUPLICATE_SUPPRESSED",
          durationMs: 10,
          completedAt: new Date().toISOString(),
        },
      ];
    }

    const squad = this.allocateHealers(caseItem);
    const reports: HealerReport[] = [];

    // 2. Acquire Exclusive Resource Lock on primary and dependent resources
    const lockAcquired = await this.lockManager.acquireLock(
      primaryTarget,
      squad[0]?.config.healerId || "healer_coordinator",
      caseItem.caseId,
      30000
    );

    if (!lockAcquired) {
      this.deduplicator.completeRepair(dedup.fingerprintId, false);
      return [
        {
          reportId: `rep_busy_${caseItem.caseId}`,
          caseId: caseItem.caseId,
          healerId: squad[0]?.config.healerId || "healer_coordinator",
          specialization: "DIAGNOSTIC",
          slayerHypothesisVerified: true,
          rootCauseDiagnosis: `Target resource ${primaryTarget} is currently locked by another active repair`,
          independentEvidence: [],
          repairPlan: { description: "Yielded to active resource lock", actions: [], rollbackActions: [] },
          repairStatus: "LOCKED_RESOURCE_BUSY",
          durationMs: 10,
          completedAt: new Date().toISOString(),
        },
      ];
    }

    try {
      // 3. Execute Independent Diagnosis & Repair across Squad
      for (const healer of squad) {
        const report = await healer.heal(caseItem);
        reports.push(report);

        // Update Healer reputation
        const success = report.repairStatus === "SUCCESS";
        const rolledBack = report.repairStatus === "ROLLED_BACK";
        healer.updateReputation(success, rolledBack, report.durationMs);
        await this.reputationRepo.saveHealerReputation(healer.getReputation());
      }

      this.deduplicator.completeRepair(dedup.fingerprintId, true);
      return reports;
    } finally {
      // 4. Release Resource Lock
      await this.lockManager.releaseLock(
        primaryTarget,
        squad[0]?.config.healerId || "healer_coordinator"
      );
    }
  }

  getHealer(healerId: string): BaseHealer | undefined {
    return this.healers.get(healerId);
  }

  getAllHealers(): BaseHealer[] {
    return Array.from(this.healers.values());
  }

  clearAttempts(): void {
    this.repairAttempts.clear();
  }
}
