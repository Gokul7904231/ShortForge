/**
 * FactoryOS v1 — Base Healer Agent
 */

import { randomUUID } from "node:crypto";
import type { Case, CaseEvidence } from "../contracts/CaseContracts";
import type {
  HealerReport,
  HealerReputation,
  HealerSpecialization,
  RepairAction,
} from "../contracts/HealerContracts";
import { TransactionalRepairGate } from "./TransactionalRepairGate";
import type { CaseManager } from "../cases/CaseManager";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";

export interface HealerDiagnosis {
  readonly healerId: string;
  readonly verified: boolean;
  readonly diagnosis: string;
  readonly independentEvidence: CaseEvidence[];
  readonly repairPlan: {
    readonly description: string;
    readonly actions: RepairAction[];
    readonly rollbackActions: RepairAction[];
  };
  readonly diagnosedAt: string;
}

export interface HealerAgentConfig {
  readonly healerId: string;
  readonly name: string;
  readonly specialization: HealerSpecialization;
}

export abstract class BaseHealer {
  readonly config: HealerAgentConfig;
  protected caseManager: CaseManager;
  protected eventBus: DurableEventBus;
  protected worldState: WorldStateEngine;
  protected repairGate: TransactionalRepairGate;
  protected reputation: HealerReputation;

  constructor(
    config: HealerAgentConfig,
    caseManager: CaseManager,
    eventBus: DurableEventBus,
    worldState: WorldStateEngine
  ) {
    this.config = config;
    this.caseManager = caseManager;
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.repairGate = new TransactionalRepairGate();
    this.reputation = {
      healerId: config.healerId,
      specialization: config.specialization,
      xp: 100,
      trustScore: 0.95,
      repairsAttempted: 0,
      repairsSucceeded: 0,
      rollbacksExecuted: 0,
      verificationPassRate: 0.95,
      averageRepairTimeMs: 250,
      lastUpdated: new Date().toISOString(),
    };
  }

  getReputation(): HealerReputation {
    return structuredClone(this.reputation);
  }

  updateReputation(success: boolean, rolledBack: boolean = false, durationMs: number = 200): void {
    this.reputation.repairsAttempted += 1;
    if (success) {
      this.reputation.xp += 50;
      this.reputation.repairsSucceeded += 1;
      this.reputation.trustScore = Math.min(1.0, this.reputation.trustScore + 0.01);
    } else {
      if (rolledBack) {
        this.reputation.rollbacksExecuted += 1;
      }
      this.reputation.trustScore = Math.max(0.1, this.reputation.trustScore - 0.03);
    }
    this.reputation.verificationPassRate =
      this.reputation.repairsSucceeded / Math.max(1, this.reputation.repairsAttempted);
    this.reputation.averageRepairTimeMs =
      (this.reputation.averageRepairTimeMs * (this.reputation.repairsAttempted - 1) + durationMs) /
      this.reputation.repairsAttempted;
    this.reputation.lastUpdated = new Date().toISOString();
  }

  /**
   * Independent Hypothesis Verification:
   * Healer independently verifies the Slayer's hypothesis before undertaking repair.
   */
  abstract verifyHypothesisIndependently(caseItem: Case): Promise<{
    verified: boolean;
    diagnosis: string;
    independentEvidence: CaseEvidence[];
  }>;

  /**
   * Constructs the transactional repair plan.
   */
  abstract createRepairPlan(caseItem: Case): {
    description: string;
    actions: RepairAction[];
    rollbackActions: RepairAction[];
  };

  /**
   * Applies the specific repair action.
   */
  abstract executeAction(action: RepairAction): Promise<boolean>;

  /**
   * Reverses / rolls back the specific repair action.
   */
  abstract rollbackAction(action: RepairAction): Promise<boolean>;

  /**
   * Wave-3 reasoning-only phase.
   * Runs independently from mutation so paired healers can reason in parallel
   * without concurrently changing physical state.
   */
  async diagnose(caseItem: Case): Promise<HealerDiagnosis> {
    const verification = await this.verifyHypothesisIndependently(caseItem);
    const repairPlan = this.createRepairPlan(caseItem);

    await this.eventBus.publish("HEALER_DIAGNOSIS_COMPLETED", {
      healerId: this.config.healerId,
      caseId: caseItem.caseId,
      verified: verification.verified,
      evidenceIds: verification.independentEvidence.map((e) => e.evidenceId),
      actionIds: repairPlan.actions.map((a) => a.actionId),
    });

    return {
      healerId: this.config.healerId,
      verified: verification.verified,
      diagnosis: verification.diagnosis,
      independentEvidence: verification.independentEvidence,
      repairPlan,
      diagnosedAt: new Date().toISOString(),
    };
  }

  /**
   * Full autonomous healing workflow.
   */
  async heal(caseItem: Case): Promise<HealerReport> {
    const startTime = Date.now();
    const reportId = `healrep_${randomUUID().replace(/-/g, "").substring(0, 12)}`;

    await this.eventBus.publish("HEALER_STARTED", {
      healerId: this.config.healerId,
      caseId: caseItem.caseId,
      specialization: this.config.specialization,
    });

    // 1. Independent Verification
    const verification = await this.verifyHypothesisIndependently(caseItem);

    for (const ev of verification.independentEvidence) {
      await this.caseManager.addEvidence(caseItem.caseId, ev, this.config.healerId);
    }

    if (verification.verified) {
      await this.caseManager.setRootCause(caseItem.caseId, verification.diagnosis, this.config.healerId);
    }

    // 2. Prepare Repair Plan
    const plan = this.createRepairPlan(caseItem);

    await this.caseManager.transitionStatus(
      caseItem.caseId,
      "HEALING",
      this.config.healerId,
      `Executing repair: ${plan.description}`
    );

    await this.eventBus.publish("REPAIR_STARTED", {
      caseId: caseItem.caseId,
      healerId: this.config.healerId,
      planDescription: plan.description,
    });

    // 3. Execute Transactional Plan via Safety Gate
    const execution = await this.repairGate.executePlan(
      plan.actions,
      plan.rollbackActions,
      (action) => this.executeAction(action),
      (action) => this.rollbackAction(action)
    );

    const durationMs = Date.now() - startTime;
    const repairStatus = execution.success
      ? "SUCCESS"
      : execution.executedActions.length > 0
      ? "ROLLED_BACK"
      : "FAILED";

    this.updateReputation(execution.success, repairStatus === "ROLLED_BACK", durationMs);

    const report: HealerReport = {
      reportId,
      caseId: caseItem.caseId,
      healerId: this.config.healerId,
      specialization: this.config.specialization,
      slayerHypothesisVerified: verification.verified,
      rootCauseDiagnosis: verification.diagnosis,
      independentEvidence: verification.independentEvidence,
      repairPlan: {
        description: plan.description,
        actions: execution.executedActions,
        rollbackActions: plan.rollbackActions,
      },
      repairStatus,
      durationMs,
      completedAt: new Date().toISOString(),
      notes: execution.error,
    };

    await this.eventBus.publish("REPAIR_COMPLETED", {
      reportId,
      caseId: caseItem.caseId,
      healerId: this.config.healerId,
      repairStatus,
      durationMs,
    });

    if (execution.success) {
      await this.caseManager.transitionStatus(
        caseItem.caseId,
        "VERIFYING",
        this.config.healerId,
        "Repair executed successfully, dispatched for independent validation"
      );
    } else {
      await this.caseManager.transitionStatus(
        caseItem.caseId,
        repairStatus === "ROLLED_BACK" ? "ROLLED_BACK" : "FAILED",
        this.config.healerId,
        `Repair failed: ${execution.error}`
      );
    }

    return report;
  }
}
