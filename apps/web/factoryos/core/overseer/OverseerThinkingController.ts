/**
 * FactoryOS v1 — Overseer Multi-Mode Thinking Controller
 * Dynamically selects reasoning depth: REFLEX, DELIBERATE, or DEEP based on uncertainty, severity, and risk.
 */

import type { GoalDefinition, ThinkingMode } from "../contracts/OverseerThinkingContracts";
import type { Case } from "../contracts/CaseContracts";
import type { WorldState } from "../contracts/WorldStateContracts";
import { IntelligenceGateway } from "../intelligence/IntelligenceGateway";
import { ContextCapsule } from "../intelligence/context/ContextCapsuleContracts";

export interface ThinkingAssessment {
  readonly mode: ThinkingMode;
  readonly rationale: string;
  readonly maxPlanningDepth: number;
  readonly tokenBudget: number;
  readonly timeoutMs: number;
  readonly parallelWorkersAllowed: number;
  readonly contextCapsule?: ContextCapsule;
}

export class OverseerThinkingController {
  private gateway?: IntelligenceGateway;

  constructor(gateway?: IntelligenceGateway) {
    this.gateway = gateway;
  }

  async compileContextForAssessment(
    taskId: string,
    query: string,
    assessment: ThinkingAssessment
  ): Promise<ContextCapsule | null> {
    if (!this.gateway) return null;
    return this.gateway.compileContextForQuery({
      taskId,
      query,
      tokenBudget: assessment.tokenBudget,
    });
  }

  assessCommand(command: string, worldState: WorldState): ThinkingAssessment {
    const lower = command.toLowerCase();

    // 1. Physical WorldState Risk & Degraded Infrastructure Triggers
    const floorList = Object.values(worldState.floors || {});
    const workerList = Object.values(worldState.workers || {});
    const errorFloors = floorList.filter((f) => f.status === "ERROR" || f.status === "OFFLINE");
    const failedWorkers = workerList.filter(
      (w) => w.status === "FAILED" || w.status === "QUARANTINED" || w.status === "DEGRADED"
    );
    const hasActiveRepairs = (worldState.activeRepairs || []).length > 0;
    const hasMultipleCases = (worldState.activeCaseIds || []).length >= 2;
    const isFactoryHalted = worldState.factoryStatus === "HALTED" || worldState.factoryStatus === "ATTENTION_REQUIRED";
    const isLowConfidence = typeof worldState.systemConfidence === "number" && worldState.systemConfidence < 0.65;
    const hasResourceFailure = worldState.resources && (!worldState.resources.networkOnline || !worldState.resources.driveAvailable);

    // Critical system-aware DEEP governance: factory failure, degraded state, or cascading repairs
    if (isFactoryHalted || errorFloors.length > 0 || failedWorkers.length >= 2 || hasActiveRepairs || hasResourceFailure) {
      const issues: string[] = [];
      if (isFactoryHalted) issues.push(`factoryStatus=${worldState.factoryStatus}`);
      if (errorFloors.length > 0) issues.push(`${errorFloors.length} floor(s) in error`);
      if (failedWorkers.length > 0) issues.push(`${failedWorkers.length} failed worker(s)`);
      if (hasActiveRepairs) issues.push(`${worldState.activeRepairs.length} active repair(s)`);
      if (hasResourceFailure) issues.push("resource failure detected");

      return {
        mode: "DEEP",
        rationale: `Critical system state requires DEEP governance: ${issues.join(", ")}. Blast radius assessment active.`,
        maxPlanningDepth: 5,
        tokenBudget: 15000,
        timeoutMs: 300000,
        parallelWorkersAllowed: 4,
      };
    }

    // High complexity directive or multi-agent autonomous mission
    if (
      lower.includes("operate the factory") ||
      lower.includes("autonomous") ||
      lower.includes("full pipeline") ||
      lower.includes("deep") ||
      lower.includes("recover from crash") ||
      isLowConfidence
    ) {
      return {
        mode: "DEEP",
        rationale: `Autonomous end-to-end orchestration directive with multi-floor dependency propagation. Confidence: ${worldState.systemConfidence ?? 1.0}`,
        maxPlanningDepth: 5,
        tokenBudget: 15000,
        timeoutMs: 300000,
        parallelWorkersAllowed: 4,
      };
    }

    // Structured operational tasks or moderate system anomaly
    if (
      lower.includes("produce") ||
      lower.includes("generate") ||
      lower.includes("heal") ||
      lower.includes("investigate") ||
      lower.includes("plan") ||
      hasMultipleCases ||
      failedWorkers.length === 1
    ) {
      return {
        mode: "DELIBERATE",
        rationale: `Structured operational workflow requiring multi-step verification. Active cases: ${worldState.activeCaseIds?.length || 0}, Failed workers: ${failedWorkers.length}.`,
        maxPlanningDepth: 3,
        tokenBudget: 4000,
        timeoutMs: 60000,
        parallelWorkersAllowed: 2,
      };
    }

    // Default fast reflex: simple read queries on healthy operational state
    return {
      mode: "REFLEX",
      rationale: `Direct operation / status inspection on healthy factory state (status: ${worldState.factoryStatus || "OPERATIONAL"}).`,
      maxPlanningDepth: 1,
      tokenBudget: 500,
      timeoutMs: 5000,
      parallelWorkersAllowed: 1,
    };
  }

  assessCase(caseItem: Case, worldState: WorldState): ThinkingAssessment {
    const isFactoryDegraded = worldState.factoryStatus !== "OPERATIONAL";

    if (
      caseItem.severity === "CRITICAL" ||
      caseItem.category === "POLICY_VIOLATION" ||
      caseItem.linkedCaseIds.length > 2 ||
      isFactoryDegraded
    ) {
      return {
        mode: "DEEP",
        rationale: `Critical severity anomaly or cascading failure on floor ${caseItem.floorId} (factoryStatus: ${worldState.factoryStatus}). Multi-agent coordination mandated.`,
        maxPlanningDepth: 4,
        tokenBudget: 10000,
        timeoutMs: 120000,
        parallelWorkersAllowed: 4,
      };
    }

    if (caseItem.severity === "HIGH" || caseItem.severity === "MEDIUM") {
      return {
        mode: "DELIBERATE",
        rationale: `Medium/High severity case requires structured triage, independent diagnostic verification, and transactional repair.`,
        maxPlanningDepth: 2,
        tokenBudget: 3000,
        timeoutMs: 45000,
        parallelWorkersAllowed: 2,
      };
    }

    return {
      mode: "REFLEX",
      rationale: "Low-severity isolated anomaly handled via deterministic reflex repair rule.",
      maxPlanningDepth: 1,
      tokenBudget: 500,
      timeoutMs: 5000,
      parallelWorkersAllowed: 1,
    };
  }
}
