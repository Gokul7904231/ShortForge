/**
 * FactoryOS Frontier v3 — Legacy Cost Governor Compatibility Facade
 *
 * Treasury is the only production economic authority. CostGovernor remains only
 * as a compatibility/advisory surface for callers that have not migrated yet.
 */

import { CostGovernorMode, CostGovernorPolicy } from "../contracts/PolicyContracts";

export class CostGovernor {
  private static policy: CostGovernorPolicy = {
    mode: "FREE_FIRST",
    paidFallbackAllowed: false,
    maxDailySpendUsd: 0.0,
    maxMonthlySpendUsd: 0.0,
    evaluationBudgetUsd: 0.0,
    currentDailySpendUsd: 0.0,
    currentMonthlySpendUsd: 0.0,
    currentEvalSpendUsd: 0.0,
  };

  static getPolicy(): CostGovernorPolicy {
    return { ...this.policy };
  }

  static setPolicy(newPolicy: Partial<CostGovernorPolicy>): CostGovernorPolicy {
    this.policy = {
      ...this.policy,
      ...newPolicy,
    };
    return { ...this.policy };
  }

  static resetSpend(): void {
    this.policy.currentDailySpendUsd = 0.0;
    this.policy.currentMonthlySpendUsd = 0.0;
    this.policy.currentEvalSpendUsd = 0.0;
  }

  /**
   * Evaluates whether a proposed provider invocation is allowed under current cost policy
   */
  static evaluateInvocation(
    isPaidProvider: boolean,
    estimatedCostUsd: number,
    isEvaluation: boolean = false
  ): {
    allowed: boolean;
    requiresApproval: boolean;
    reason: string;
  } {
    // Production execution is governed by Treasury. The legacy governor
    // must never authorize spend on its own.
    if (process.env.NODE_ENV === "production") {
      return {
        allowed: false,
        requiresApproval: true,
        reason:
          "[CostGovernor] Production economic admission is Treasury-owned; caller must use TreasuryEconomicAdmission.",
      };
    }

    // Non-production compatibility behavior.
    if (!isPaidProvider || estimatedCostUsd === 0) {
      return { allowed: true, requiresApproval: false, reason: "Zero-cost free/local provider approved." };
    }

    // 2. If FREE_FIRST mode and paid fallback is disabled, block and require approval
    if (this.policy.mode === "FREE_FIRST" && !this.policy.paidFallbackAllowed) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `[CostGovernor] Execution in FREE_FIRST mode requires approval before invoking paid provider (est. $${estimatedCostUsd.toFixed(4)}).`,
      };
    }

    // 3. Evaluation budget check
    if (isEvaluation) {
      if (this.policy.currentEvalSpendUsd + estimatedCostUsd > this.policy.evaluationBudgetUsd) {
        return {
          allowed: false,
          requiresApproval: true,
          reason: `[CostGovernor] Evaluation budget exceeded ($${this.policy.currentEvalSpendUsd.toFixed(2)} / $${this.policy.evaluationBudgetUsd.toFixed(2)}).`,
        };
      }
    }

    // 4. Daily budget check
    if (this.policy.currentDailySpendUsd + estimatedCostUsd > this.policy.maxDailySpendUsd && this.policy.maxDailySpendUsd > 0) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `[CostGovernor] Daily budget cap exceeded ($${this.policy.currentDailySpendUsd.toFixed(2)} / $${this.policy.maxDailySpendUsd.toFixed(2)}).`,
      };
    }

    return { allowed: true, requiresApproval: false, reason: "Paid execution permitted under active budget policy." };
  }

  /**
   * Compatibility telemetry only. Production source of truth is Treasury settlement.
   */
  static recordSpend(costUsd: number, isEvaluation: boolean = false): void {
    if (costUsd <= 0) return;
    this.policy.currentDailySpendUsd += costUsd;
    this.policy.currentMonthlySpendUsd += costUsd;
    if (isEvaluation) {
      this.policy.currentEvalSpendUsd += costUsd;
    }
  }
}
