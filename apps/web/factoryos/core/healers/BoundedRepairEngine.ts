/**
 * FactoryOS v3 — Bounded Repair Engine
 * Assimilates Video-Use / Archify bounded repair semantics:
 * 1. Bounded repair loop: strictly limits attempts to a configured budget (default: 2).
 * 2. Last-Known-Good baseline preservation: never overwrites verified state with unverified candidates.
 * 3. Reverts to last-known-good state when repair budget is exhausted.
 */

import { randomUUID } from "node:crypto";
import type { StructuredFinding } from "../verification/StructuredFindings";

export interface RepairAttemptResult<TState = unknown> {
  readonly attemptIndex: number;
  readonly success: boolean;
  readonly resultingState?: TState;
  readonly remainingFindings: StructuredFinding[];
  readonly error?: string;
}

export interface BoundedRepairSummary<TState = unknown> {
  readonly repairSessionId: string;
  readonly resolved: boolean;
  readonly totalAttempts: number;
  readonly maxBudget: number;
  readonly finalState: TState;
  readonly isRestoredToLastKnownGood: boolean;
  readonly history: Array<{
    readonly attempt: number;
    readonly appliedAction: string;
    readonly success: boolean;
    readonly remainingIssueCount: number;
  }>;
}

export class BoundedRepairEngine {
  /**
   * Executes bounded iterative repair loop on an artifact or state.
   */
  public static async executeBoundedRepair<TState>(options: {
    initialState: TState;
    lastKnownGoodState: TState;
    findings: StructuredFinding[];
    maxBudget?: number;
    repairFn: (currentState: TState, finding: StructuredFinding) => Promise<TState>;
    validateFn: (candidateState: TState) => Promise<{ valid: boolean; remainingFindings: StructuredFinding[] }>;
  }): Promise<BoundedRepairSummary<TState>> {
    const maxBudget = options.maxBudget ?? 2;
    const repairSessionId = `repair_${randomUUID().substring(0, 8)}`;
    let currentState = structuredClone(options.initialState);
    let currentFindings = [...options.findings];
    const history: BoundedRepairSummary<TState>["history"] = [];

    for (let attempt = 1; attempt <= maxBudget; attempt++) {
      if (currentFindings.length === 0) {
        break;
      }

      const targetFinding = currentFindings[0];
      const actionName = targetFinding.supportedRepairs[0]?.description || targetFinding.rule;

      try {
        const candidateState = await options.repairFn(currentState, targetFinding);
        const validation = await options.validateFn(candidateState);

        history.push({
          attempt,
          appliedAction: actionName,
          success: validation.valid,
          remainingIssueCount: validation.remainingFindings.length,
        });

        if (validation.valid) {
          return {
            repairSessionId,
            resolved: true,
            totalAttempts: attempt,
            maxBudget,
            finalState: candidateState,
            isRestoredToLastKnownGood: false,
            history,
          };
        }

        currentState = candidateState;
        currentFindings = validation.remainingFindings;
      } catch (err: any) {
        history.push({
          attempt,
          appliedAction: actionName,
          success: false,
          remainingIssueCount: currentFindings.length,
        });
      }
    }

    // Budget exhausted without resolution: Revert strictly to Last-Known-Good baseline
    return {
      repairSessionId,
      resolved: false,
      totalAttempts: maxBudget,
      maxBudget,
      finalState: structuredClone(options.lastKnownGoodState),
      isRestoredToLastKnownGood: true,
      history,
    };
  }
}
