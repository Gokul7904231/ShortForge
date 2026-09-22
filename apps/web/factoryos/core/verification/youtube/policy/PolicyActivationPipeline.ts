/**
 * FactoryOS YouTube Monetization Guardian — Policy Activation Pipeline
 * Implements candidate validation, diff analysis, activation, and freshness tracking.
 * Invariant: Candidate Policy != Active Policy until explicitly validated and activated.
 */

import { PolicyRuleDefinition, PolicyGateId } from "./YouTubePolicyIR";
import { PolicySnapshot } from "./YouTubePolicySnapshot";

export type PolicyFreshnessState = "VALID" | "EXPIRING" | "STALE" | "INVALID" | "UNAVAILABLE";

export interface SnapshotFreshnessReport {
  readonly state: PolicyFreshnessState;
  readonly ageHours: number;
  readonly maxFreshnessHours: number;
  readonly warningThresholdHours: number;
  readonly requiresRefresh: boolean;
  readonly explanation: string;
}

export class PolicyActivationPipeline {
  public static readonly DEFAULT_MAX_FRESHNESS_HOURS = 336; // 14 days
  public static readonly WARNING_FRESHNESS_HOURS = 168;    // 7 days

  /**
   * Assesses freshness of a policy snapshot against current evaluation time.
   */
  public static evaluateFreshness(
    snapshot: PolicySnapshot,
    evaluationTimeIso?: string,
    maxFreshnessHours: number = PolicyActivationPipeline.DEFAULT_MAX_FRESHNESS_HOURS
  ): SnapshotFreshnessReport {
    if (!snapshot || !snapshot.retrievedAt) {
      return {
        state: "UNAVAILABLE",
        ageHours: Infinity,
        maxFreshnessHours,
        warningThresholdHours: PolicyActivationPipeline.WARNING_FRESHNESS_HOURS,
        requiresRefresh: true,
        explanation: "Policy snapshot or retrieval timestamp is missing",
      };
    }

    const evalTime = evaluationTimeIso ? new Date(evaluationTimeIso).getTime() : Date.now();
    const retrievedTime = new Date(snapshot.retrievedAt).getTime();
    const ageMs = evalTime - retrievedTime;
    const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));

    if (ageHours > maxFreshnessHours) {
      return {
        state: "STALE",
        ageHours,
        maxFreshnessHours,
        warningThresholdHours: PolicyActivationPipeline.WARNING_FRESHNESS_HOURS,
        requiresRefresh: true,
        explanation: `Policy snapshot retrieved ${ageHours.toFixed(1)}h ago exceeds max freshness SLA of ${maxFreshnessHours}h`,
      };
    }

    if (ageHours > PolicyActivationPipeline.WARNING_FRESHNESS_HOURS) {
      return {
        state: "EXPIRING",
        ageHours,
        maxFreshnessHours,
        warningThresholdHours: PolicyActivationPipeline.WARNING_FRESHNESS_HOURS,
        requiresRefresh: true,
        explanation: `Policy snapshot age (${ageHours.toFixed(1)}h) approaching freshness boundary`,
      };
    }

    return {
      state: "VALID",
      ageHours,
      maxFreshnessHours,
      warningThresholdHours: PolicyActivationPipeline.WARNING_FRESHNESS_HOURS,
      requiresRefresh: false,
      explanation: `Policy snapshot is current (${ageHours.toFixed(1)}h old)`,
    };
  }

  /**
   * Validates candidate rules prior to activation:
   * 1. Schema integrity: all mandatory fields present
   * 2. Rule ID uniqueness
   * 3. Date parseability
   * 4. Gate ID coverage
   */
  public static validateCandidateRules(rules: readonly PolicyRuleDefinition[]): {
    readonly valid: boolean;
    readonly errors: readonly string[];
  } {
    const errors: string[] = [];
    const seenRuleIds = new Set<string>();

    if (!rules || rules.length === 0) {
      return { valid: false, errors: ["Candidate ruleset is empty"] };
    }

    for (const rule of rules) {
      if (!rule.ruleId || rule.ruleId.trim() === "") {
        errors.push("Rule encountered with empty ruleId");
      } else if (seenRuleIds.has(rule.ruleId)) {
        errors.push(`Duplicate ruleId: '${rule.ruleId}'`);
      } else {
        seenRuleIds.add(rule.ruleId);
      }

      if (!rule.gateId) {
        errors.push(`Rule '${rule.ruleId}' missing gateId`);
      }

      if (!rule.effectiveFrom || isNaN(new Date(rule.effectiveFrom).getTime())) {
        errors.push(`Rule '${rule.ruleId}' has invalid effectiveFrom date: '${rule.effectiveFrom}'`);
      }

      if (rule.effectiveTo && isNaN(new Date(rule.effectiveTo).getTime())) {
        errors.push(`Rule '${rule.ruleId}' has invalid effectiveTo date: '${rule.effectiveTo}'`);
      }

      if (!rule.policyEffect) {
        errors.push(`Rule '${rule.ruleId}' missing policyEffect`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: Object.freeze(errors),
    };
  }
}
