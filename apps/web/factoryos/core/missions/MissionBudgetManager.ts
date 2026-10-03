/**
 * FactoryOS Frontier v2 — Mission Budget Projection
 *
 * Treasury owns economic admission. This class remains a post-consumption
 * compatibility/projection check for Mission lifecycle policy and must not
 * authorize spend before an execution attempt.
 */

import type { Mission } from "../contracts/MissionContracts";

export interface BudgetCheckResult {
  readonly exceeded: boolean;
  readonly reason?: string;
  readonly metrics: {
    readonly tokensConsumed: number;
    readonly costUsd: number;
    readonly durationMs: number;
    readonly parallelTasks: number;
  };
}

export class MissionBudgetManager {
  static evaluateBudget(
    mission: Mission,
    incrementalUsage?: { tokens?: number; costUsd?: number; durationMs?: number },
    currentActiveParallelTasks: number = 0
  ): BudgetCheckResult {
    const budget = mission.budget;

    const tokensConsumed = budget.tokensConsumed + (incrementalUsage?.tokens || 0);
    const costUsd = budget.costUsd + (incrementalUsage?.costUsd || 0);

    const elapsedMs = Date.now() - new Date(mission.createdAt).getTime();
    const durationMs = Math.max(budget.durationMs + (incrementalUsage?.durationMs || 0), elapsedMs);

    let exceeded = false;
    let reason: string | undefined;

    if (budget.maxTokens && tokensConsumed > budget.maxTokens) {
      exceeded = true;
      reason = `Token budget exceeded (${tokensConsumed}/${budget.maxTokens})`;
    } else if (budget.maxCostUsd && costUsd > budget.maxCostUsd) {
      exceeded = true;
      reason = `Cost budget exceeded ($${costUsd.toFixed(4)}/$${budget.maxCostUsd.toFixed(4)})`;
    } else if (budget.maxDurationMs && durationMs > budget.maxDurationMs) {
      exceeded = true;
      reason = `Duration budget exceeded (${Math.round(durationMs / 1000)}s/${Math.round(budget.maxDurationMs / 1000)}s)`;
    } else if (budget.maxParallelTasks && currentActiveParallelTasks > budget.maxParallelTasks) {
      exceeded = true;
      reason = `Parallel task limit exceeded (${currentActiveParallelTasks}/${budget.maxParallelTasks})`;
    }

    return {
      exceeded,
      reason,
      metrics: {
        tokensConsumed,
        costUsd,
        durationMs,
        parallelTasks: currentActiveParallelTasks,
      },
    };
  }
}
