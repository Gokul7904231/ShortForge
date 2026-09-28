/**
 * FactoryOS Frontier v2 — Phase 6: Healer Swarm Concurrency & Repair Safety Contracts
 * Defines autonomous root-cause verification, dynamic dispatch, shared-resource locking,
 * repair deduplication, and transactional repair schemas.
 */

import type { Case, CaseEvidence, CaseHypothesis } from "./CaseContracts";

export type HealerSpecialization =
  | "DIAGNOSTIC"
  | "GPU_COMPUTE"
  | "DATABASE"
  | "PIPELINE"
  | "RENDERING"
  | "WORKER"
  | "API"
  | "CONTENT"
  | "DEPLOYMENT";

export interface HealerReputation {
  readonly healerId: string;
  readonly specialization: HealerSpecialization;
  xp: number;
  trustScore: number; // 0.0 to 1.0
  repairsAttempted: number;
  repairsSucceeded: number;
  rollbacksExecuted: number;
  verificationPassRate: number; // 0.0 to 1.0
  averageRepairTimeMs: number;
  lastUpdated: string;
}

export interface RepairAction {
  readonly actionId: string;
  readonly actionType: string;
  readonly target: string;
  readonly parameters: Record<string, unknown>;
  readonly executedAt?: string;
  readonly status: "PENDING" | "APPLIED" | "FAILED" | "ROLLED_BACK";
  readonly output?: Record<string, unknown>;
}

export interface HealerReport {
  readonly reportId: string;
  readonly caseId: string;
  readonly healerId: string;
  readonly specialization: HealerSpecialization;
  
  // Independent Verification of Slayer Hypothesis
  readonly slayerHypothesisVerified: boolean;
  readonly rootCauseDiagnosis: string;
  readonly independentEvidence: CaseEvidence[];
  
  // Repair Execution
  readonly repairPlan: {
    readonly description: string;
    readonly actions: RepairAction[];
    readonly rollbackActions: RepairAction[];
  };
  readonly repairStatus: "SUCCESS" | "FAILED" | "ROLLED_BACK" | "ESCALATED" | "LOCKED_RESOURCE_BUSY" | "DUPLICATE_SUPPRESSED";
  readonly durationMs: number;
  readonly completedAt: string;
  readonly notes?: string;
}

export interface ResourceLock {
  readonly resourceId: string;
  readonly ownerHealerId: string;
  readonly caseId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  /**
   * Wave-1 fencing metadata. Optional for legacy lock callers; new joint-healing
   * callers should use MutationLease with mandatory fencingEpoch/sessionId.
   */
  readonly sessionId?: string;
  readonly fencingEpoch?: number;
  readonly capabilityGrant?: string;
  readonly actionScope?: readonly string[];
}

export interface RepairFingerprint {
  readonly fingerprintId: string;
  readonly floorId: string;
  readonly target: string;
  readonly category: string;
  readonly actionType: string;
  readonly caseId: string;
  readonly status: "IN_PROGRESS" | "APPLIED" | "FAILED";
}

export interface RepairDependency {
  readonly primaryResourceId: string;
  readonly dependentResourceIds: string[];
  readonly affectedFloorIds: string[];
  readonly blastRadius: "LOCAL" | "CROSS_FLOOR" | "GLOBAL";
}
