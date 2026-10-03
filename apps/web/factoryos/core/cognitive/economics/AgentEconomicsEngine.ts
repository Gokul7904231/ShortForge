/**
 * FactoryOS Frontier v2 — Agent Economics & Adaptive Model Router
 *
 * Advisory only. Treasury owns authoritative pricing, reservations and settlement.
 * This component may estimate for selection heuristics but must never authorize spend.
 */

import type { ModelRouteDecision, ModelTier } from "../CognitiveContracts";

export interface EconomicMetrics {
  totalTokensConsumed: number;
  totalCostUsd: number;
  totalInvocations: number;
  averageLatencyMs: number;
  deterministicBypassCount: number;
}

export class AgentEconomicsEngine {
  private metrics: EconomicMetrics = {
    totalTokensConsumed: 0,
    totalCostUsd: 0,
    totalInvocations: 0,
    averageLatencyMs: 0,
    deterministicBypassCount: 0,
  };

  /**
   * Selects the lowest-cost model tier capable of fulfilling the task requirements.
   */
  routeTask(
    taskDescription: string,
    context: {
      isDeterministicRuleAvailable?: boolean;
      severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      isAmbiguous?: boolean;
      isMultiAgentRequired?: boolean;
    }
  ): ModelRouteDecision {
    // 1. Tier 0: Deterministic
    if (context.isDeterministicRuleAvailable) {
      return {
        taskDescription,
        selectedTier: "DETERMINISTIC",
        estimatedTokens: 0,
        estimatedCost: 0,
        estimatedLatencyMs: 5,
        rationale: "Known deterministic rule matches task parameters exactly. Zero token cost.",
      };
    }

    // 2. Tier 4: Multi-Agent Swarm (Critical / Cascading)
    if (context.severity === "CRITICAL" || context.isMultiAgentRequired) {
      return {
        taskDescription,
        selectedTier: "MULTI_AGENT_SWARM",
        estimatedTokens: 12000,
        estimatedCost: 0.024,
        estimatedLatencyMs: 2500,
        rationale: "Critical emergency requires full multi-agent swarm parallel investigation and cross-verification.",
      };
    }

    // 3. Tier 3: Recursive RLM (Ambiguous with external research needed)
    if (context.isAmbiguous) {
      return {
        taskDescription,
        selectedTier: "RECURSIVE_RLM",
        estimatedTokens: 5000,
        estimatedCost: 0.01,
        estimatedLatencyMs: 1200,
        rationale: "Ambiguous symptoms require RLM bounded recursive investigation and evidence dereferencing.",
      };
    }

    // 4. Tier 2: Large Reasoner (High Severity)
    if (context.severity === "HIGH") {
      return {
        taskDescription,
        selectedTier: "LARGE_REASONER",
        estimatedTokens: 2500,
        estimatedCost: 0.005,
        estimatedLatencyMs: 800,
        rationale: "High severity case requires deep reasoning and hypothesis formulation.",
      };
    }

    // 5. Tier 1: Small/Fast model (Standard triage/formatting)
    return {
      taskDescription,
      selectedTier: "SMALL_FAST",
      estimatedTokens: 600,
      estimatedCost: 0.0006,
      estimatedLatencyMs: 150,
      rationale: "Routine low/medium operational triage executed on fast, lightweight model tier.",
    };
  }

  recordExecution(
    tier: ModelTier,
    tokens: number,
    latencyMs: number,
    actualCostUsd?: number,
  ): void {
    this.metrics.totalInvocations += 1;
    this.metrics.totalTokensConsumed += tokens;

    if (tier === "DETERMINISTIC") {
      this.metrics.deterministicBypassCount += 1;
    }

    // Authoritative cost comes from Treasury settlement. Keep the local metric
    // at zero when no measured Treasury amount is supplied.
    const cost = Number.isFinite(actualCostUsd)
      ? Math.max(0, Number(actualCostUsd))
      : 0;
    this.metrics.totalCostUsd += cost;

    this.metrics.averageLatencyMs =
      (this.metrics.averageLatencyMs * (this.metrics.totalInvocations - 1) + latencyMs) /
      this.metrics.totalInvocations;
  }

  getMetrics(): EconomicMetrics {
    return structuredClone(this.metrics);
  }

  clear(): void {
    this.metrics = {
      totalTokensConsumed: 0,
      totalCostUsd: 0,
      totalInvocations: 0,
      averageLatencyMs: 0,
      deterministicBypassCount: 0,
    };
  }
}
