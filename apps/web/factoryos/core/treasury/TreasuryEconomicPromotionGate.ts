/**
 * Treasury Economic Promotion Gate
 *
 * Evidence gate only. Passing means a route change is eligible for governed
 * human/Overseer review. It never changes live routing or Treasury state.
 */

import type { TreasuryShadowOutcomeAttribution } from "./TreasuryShadowOutcomeAttribution";

export type TreasuryPromotionEvidenceStatus =
  | "INSUFFICIENT_EVIDENCE"
  | "REJECTED"
  | "READY_FOR_REVIEW";

export interface TreasuryEconomicPromotionCriteria {
  readonly minSamples: number;
  readonly minCostSavingsPct: number;
  readonly minVerificationSuccessRate: number;
  readonly maxVerificationRegression: number;
  readonly maxLatencyRegressionPct: number;
  readonly minEvidenceQuality: "USABLE" | "STRONG";
}

export interface TreasuryEconomicPromotionEvidence {
  readonly status: TreasuryPromotionEvidenceStatus;
  readonly evidenceId: string;
  readonly reasons: readonly string[];
  readonly cohortSamples: number;
  readonly baselineVerificationSuccessRate?: number;
  readonly candidateVerificationSuccessRate?: number;
  readonly realizedCostSavingsPct?: number;
  readonly realizedLatencyDeltaPct?: number;
  readonly verificationDelta: number;
  readonly requiresHumanReview: true;
}

const qualityRank = {
  INSUFFICIENT: 0,
  USABLE: 1,
  STRONG: 2,
} as const;

export class TreasuryEconomicPromotionGate {
  evaluate(
    attribution: TreasuryShadowOutcomeAttribution,
    criteria: TreasuryEconomicPromotionCriteria,
  ): TreasuryEconomicPromotionEvidence {
    const reasons: string[] = [];
    const baseline = attribution.baseline;
    const candidate = attribution.candidate;
    const samples = Math.min(
      baseline?.samples ?? 0,
      candidate?.samples ?? 0,
    );

    if (
      qualityRank[attribution.evidenceQuality] <
      qualityRank[criteria.minEvidenceQuality]
    ) {
      reasons.push("evidence_quality_insufficient");
    }

    if (samples < criteria.minSamples) {
      reasons.push("paired_cohort_sample_size_insufficient");
    }

    if (
      attribution.realizedCostSavingsPct === undefined ||
      attribution.realizedCostSavingsPct < criteria.minCostSavingsPct
    ) {
      reasons.push("realized_cost_savings_not_demonstrated");
    }

    if (
      baseline?.verificationSuccessRate === undefined ||
      candidate?.verificationSuccessRate === undefined
    ) {
      reasons.push("verification_evidence_missing");
    } else {
      if (
        candidate.verificationSuccessRate <
        criteria.minVerificationSuccessRate
      ) {
        reasons.push("candidate_verification_rate_below_floor");
      }

      if (
        attribution.verificationDelta <
        -Math.abs(criteria.maxVerificationRegression)
      ) {
        reasons.push("candidate_verification_non_inferiority_failed");
      }
    }

    if (
      attribution.realizedLatencyDeltaPct !== undefined &&
      attribution.realizedLatencyDeltaPct >
        criteria.maxLatencyRegressionPct
    ) {
      reasons.push("candidate_latency_regression_exceeds_limit");
    } else if (attribution.realizedLatencyDeltaPct === undefined) {
      reasons.push("latency_evidence_missing");
    }

    const status =
      !attribution.matched || samples < criteria.minSamples
        ? "INSUFFICIENT_EVIDENCE"
        : reasons.length > 0
          ? "REJECTED"
          : "READY_FOR_REVIEW";

    return {
      status,
      evidenceId: attribution.evidenceId,
      reasons,
      cohortSamples: samples,
      baselineVerificationSuccessRate:
        baseline?.verificationSuccessRate,
      candidateVerificationSuccessRate:
        candidate?.verificationSuccessRate,
      realizedCostSavingsPct:
        attribution.realizedCostSavingsPct,
      realizedLatencyDeltaPct:
        attribution.realizedLatencyDeltaPct,
      verificationDelta: attribution.verificationDelta,
      requiresHumanReview: true,
    };
  }
}
