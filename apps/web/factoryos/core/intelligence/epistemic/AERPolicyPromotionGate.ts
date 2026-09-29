import type { AERMetricSnapshot } from "./AERMetrics";

export interface AERPolicyEvaluationEvidence {
  readonly policyVersion: string;
  readonly sampleCount: number;
  readonly resolvedRateLower95: number;
  readonly resolvedRateUpper95: number;
  readonly falseReassuranceRateUpper95: number;
  readonly costUsdPerResolvedUncertainty: number | null;
  readonly p95LatencyMs: number;
  readonly authorityViolationCount: number;
}

export interface AERPolicyPromotionCriteria {
  readonly minSamples: number;
  readonly maxFalseReassuranceUpper95: number;
  readonly maxLatencyRegressionMs: number;
  readonly minCostSavingsUsd: number;
  readonly maxResolutionLowerBoundRegression: number;
}

/**
 * Promotion is an evidence gate, never an automatic mutator.
 *
 * It answers only whether a candidate has enough evidence to enter a human/
 * governance-controlled promotion workflow.
 */
export class AERPolicyPromotionGate {
  public evaluate(input: {
    readonly baseline: AERPolicyEvaluationEvidence;
    readonly candidate: AERPolicyEvaluationEvidence;
    readonly criteria: AERPolicyPromotionCriteria;
  }): {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  } {
    const { baseline, candidate, criteria } = input;
    const reasons: string[] = [];

    if (baseline.sampleCount < criteria.minSamples) {
      reasons.push("baseline_sample_size_insufficient");
    }
    if (candidate.sampleCount < criteria.minSamples) {
      reasons.push("candidate_sample_size_insufficient");
    }
    if (candidate.authorityViolationCount > 0) {
      reasons.push("candidate_authority_violations_present");
    }
    if (
      candidate.falseReassuranceRateUpper95 >
      criteria.maxFalseReassuranceUpper95
    ) {
      reasons.push("candidate_false_reassurance_bound_exceeds_limit");
    }
    if (
      candidate.resolvedRateLower95 <
      baseline.resolvedRateLower95 - criteria.maxResolutionLowerBoundRegression
    ) {
      reasons.push("candidate_resolution_non_inferiority_failed");
    }

    const baselineCost = baseline.costUsdPerResolvedUncertainty;
    const candidateCost = candidate.costUsdPerResolvedUncertainty;
    if (
      baselineCost !== null &&
      candidateCost !== null &&
      candidateCost > baselineCost - criteria.minCostSavingsUsd
    ) {
      reasons.push("minimum_cost_savings_not_demonstrated");
    }

    if (
      candidate.p95LatencyMs >
      baseline.p95LatencyMs + criteria.maxLatencyRegressionMs
    ) {
      reasons.push("latency_regression_exceeds_limit");
    }

    return {
      eligible: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Converts the recorder snapshot into the evidence fields required by the
   * promotion gate. Rate bounds must come from the calibration layer.
   */
  public static fromSnapshot(
    snapshot: AERMetricSnapshot,
    input: {
      readonly policyVersion: string;
      readonly resolvedRateLower95: number;
      readonly resolvedRateUpper95: number;
      readonly falseReassuranceRateUpper95: number;
      readonly authorityViolationCount?: number;
    },
  ): AERPolicyEvaluationEvidence {
    return {
      policyVersion: input.policyVersion,
      sampleCount: snapshot.uncertaintyEpisodeCount,
      resolvedRateLower95: input.resolvedRateLower95,
      resolvedRateUpper95: input.resolvedRateUpper95,
      falseReassuranceRateUpper95: input.falseReassuranceRateUpper95,
      costUsdPerResolvedUncertainty:
        snapshot.actualCostUsdPerResolvedUncertainty,
      p95LatencyMs: snapshot.p95AscalonLatencyMs,
      authorityViolationCount: Math.max(
        0,
        input.authorityViolationCount ?? 0,
      ),
    };
  }
}
