/**
 * Treasury Economic Promotion Gate
 *
 * Read-only promotion eligibility over:
 *   1. a prior verified shadow recommendation; and
 *   2. later verification-backed outcomes.
 *
 * A CANARY_ELIGIBLE result is evidence for Human/Overseer policy review.
 * It is never a Treasury permit and never changes live routing automatically.
 */
import { createHash } from "node:crypto";
import type { TreasuryEconomicReadSource } from "./TreasuryEconomicIntelligence";
import {
  TreasuryEconomicCalibration,
  type TreasuryRouteCalibrationObservation,
} from "./TreasuryEconomicCalibration";
import type { TreasuryShadowRouteEvaluation } from "./TreasuryShadowRouteEvaluator";

export type TreasuryPromotionStatus =
  | "CANARY_ELIGIBLE"
  | "INELIGIBLE"
  | "INSUFFICIENT_EVIDENCE";

export interface TreasuryEconomicPromotionRequest {
  readonly accountId: string;
  readonly shadowEvaluation: TreasuryShadowRouteEvaluation;
  readonly now?: Date;
  readonly postOutcomeWindowMs?: number;
  readonly minPostSamples?: number;
  readonly minVerificationSuccessRate?: number;
  readonly maxLatencyRegressionPct?: number;
  readonly minRealizedCostSavingsPct?: number;
  readonly maxSavingsDeviationPp?: number;
}

export interface TreasuryEconomicPromotionEvidence {
  readonly baselineRoute: {
    readonly providerId: string;
    readonly modelId?: string;
    readonly samples: number;
    readonly confidence: "LOW" | "MEDIUM" | "HIGH";
    readonly verificationSuccessRate: number;
    readonly costPer1kTokensUsd?: number;
    readonly p90LatencyMs?: number;
  };
  readonly alternativeRoute: {
    readonly providerId: string;
    readonly modelId?: string;
    readonly samples: number;
    readonly confidence: "LOW" | "MEDIUM" | "HIGH";
    readonly verificationSuccessRate: number;
    readonly costPer1kTokensUsd?: number;
    readonly p90LatencyMs?: number;
  };
  readonly expectedCostSavingsPct?: number;
  readonly realizedCostSavingsPct: number;
  readonly realizedLatencyDeltaPct: number;
  readonly minRequiredVerificationSuccessRate: number;
  readonly maxAllowedLatencyRegressionPct: number;
  readonly minRequiredCostSavingsPct: number;
  readonly minRequiredSamples: number;
}

export interface TreasuryEconomicPromotionDecision {
  readonly status: TreasuryPromotionStatus;
  readonly canaryEligible: boolean;
  readonly canAuthorizeSpend: false;
  readonly requiresHumanOrOverseerReview: true;
  readonly generatedAt: string;
  readonly postOutcomeWindowStart: string;
  readonly postOutcomeWindowEnd: string;
  readonly accountId: string;
  readonly workloadType: string;
  readonly recommendationRoute?: {
    readonly providerId: string;
    readonly modelId?: string;
  };
  readonly expectedCostSavingsPct?: number;
  readonly realizedCostSavingsPct?: number;
  readonly realizedLatencyDeltaPct?: number;
  readonly evidence?: TreasuryEconomicPromotionEvidence;
  readonly reasons: readonly string[];
  readonly evidenceDigest: string;
}

function sameRoute(
  observation: TreasuryRouteCalibrationObservation,
  providerId: string,
  modelId?: string,
): boolean {
  return (
    observation.providerId === providerId &&
    (observation.modelId ?? "") === (modelId ?? "")
  );
}

function savingsPct(
  baseline: number | undefined,
  alternative: number | undefined,
): number | undefined {
  if (
    baseline === undefined ||
    alternative === undefined ||
    baseline <= 0
  ) {
    return undefined;
  }
  return ((baseline - alternative) / baseline) * 100;
}

function deltaPct(
  baseline: number | undefined,
  alternative: number | undefined,
): number | undefined {
  if (
    baseline === undefined ||
    alternative === undefined ||
    baseline <= 0
  ) {
    return undefined;
  }
  return ((alternative - baseline) / baseline) * 100;
}

function digest(value: unknown): string {
  return (
    "sha256:" +
    createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex")
  );
}

export class TreasuryEconomicPromotionGate {
  constructor(private readonly source: TreasuryEconomicReadSource) {}

  async evaluate(
    request: TreasuryEconomicPromotionRequest,
  ): Promise<TreasuryEconomicPromotionDecision> {
    const now = request.now ?? new Date();
    const recommendation = request.shadowEvaluation.recommendation;
    const baseline = request.shadowEvaluation.baseline;
    const postOutcomeWindowMs = Math.max(
      60 * 60 * 1000,
      request.postOutcomeWindowMs ?? 7 * 24 * 60 * 60 * 1000,
    );
    const postStart = new Date(
      now.getTime() - postOutcomeWindowMs,
    );
    const minSamples = Math.max(
      10,
      Math.floor(request.minPostSamples ?? 30),
    );
    const minVerificationSuccessRate = Math.min(
      1,
      Math.max(0, request.minVerificationSuccessRate ?? 0.95),
    );
    const maxLatencyRegressionPct = Math.max(
      0,
      request.maxLatencyRegressionPct ?? 10,
    );
    const minRealizedCostSavingsPct = Math.max(
      0,
      request.minRealizedCostSavingsPct ?? 10,
    );
    const maxSavingsDeviationPp = Math.max(
      0,
      request.maxSavingsDeviationPp ?? 20,
    );

    const reasons: string[] = [];
    const shadowGeneratedAt = new Date(
      request.shadowEvaluation.generatedAt,
    );

    if (
      !Number.isFinite(shadowGeneratedAt.getTime()) ||
      postStart.getTime() <= shadowGeneratedAt.getTime()
    ) {
      reasons.push(
        "The post-outcome window does not begin strictly after the shadow recommendation timestamp.",
      );
      reasons.push(
        "Promotion remains blocked until later outcomes can be isolated from the shadow observation window.",
      );
      return this.ineligible(
        request,
        now,
        postStart,
        recommendation,
        reasons,
        undefined,
      );
    }

    if (
      !recommendation ||
      !baseline ||
      !baseline.eligible ||
      recommendation.confidence !== "HIGH"
    ) {
      reasons.push(
        "No high-confidence eligible shadow recommendation with an eligible baseline route is available.",
      );
      const decision: TreasuryEconomicPromotionDecision = {
        status: "INSUFFICIENT_EVIDENCE",
        canaryEligible: false,
        canAuthorizeSpend: false,
        requiresHumanOrOverseerReview: true,
        generatedAt: now.toISOString(),
        postOutcomeWindowStart: postStart.toISOString(),
        postOutcomeWindowEnd: now.toISOString(),
        accountId: request.accountId,
        workloadType: request.shadowEvaluation.workloadType,
        recommendationRoute: recommendation
          ? {
              providerId: recommendation.providerId,
              modelId: recommendation.modelId,
            }
          : undefined,
        reasons,
        evidenceDigest: digest({
          accountId: request.accountId,
          generatedAt: now.toISOString(),
          reasons,
        }),
      };
      return decision;
    }

    const calibration = new TreasuryEconomicCalibration(this.source);
    const post = await calibration.calibrate(request.accountId, {
      windowMs: postOutcomeWindowMs,
      notBefore: postStart,
      notAfter: now,
    });

    const baselinePost = post.observations.find((observation) =>
      sameRoute(
        observation,
        baseline.providerId,
        baseline.modelId,
      ),
    );
    const alternativePost = post.observations.find((observation) =>
      sameRoute(
        observation,
        recommendation.providerId,
        recommendation.modelId,
      ),
    );

    if (!baselinePost || !alternativePost) {
      reasons.push(
        "Later verification-backed outcomes do not contain both the baseline and recommended route.",
      );
      reasons.push(
        "Promotion remains blocked until the counterfactual can be evaluated against actual later outcomes.",
      );
      return this.ineligible(
        request,
        now,
        postStart,
        recommendation,
        reasons,
        undefined,
      );
    }

    const realizedCostSavingsPct = savingsPct(
      baselinePost.costPer1kTokensUsd,
      alternativePost.costPer1kTokensUsd,
    );
    const realizedLatencyDeltaPct =
      deltaPct(
        baselinePost.p90LatencyMs,
        alternativePost.p90LatencyMs,
      ) ?? Infinity;

    const evidence: TreasuryEconomicPromotionEvidence = {
      baselineRoute: {
        providerId: baselinePost.providerId,
        modelId: baselinePost.modelId,
        samples: baselinePost.samples,
        confidence: baselinePost.confidence,
        verificationSuccessRate:
          baselinePost.verificationSuccessRate,
        costPer1kTokensUsd:
          baselinePost.costPer1kTokensUsd,
        p90LatencyMs: baselinePost.p90LatencyMs,
      },
      alternativeRoute: {
        providerId: alternativePost.providerId,
        modelId: alternativePost.modelId,
        samples: alternativePost.samples,
        confidence: alternativePost.confidence,
        verificationSuccessRate:
          alternativePost.verificationSuccessRate,
        costPer1kTokensUsd:
          alternativePost.costPer1kTokensUsd,
        p90LatencyMs: alternativePost.p90LatencyMs,
      },
      expectedCostSavingsPct:
        recommendation.expectedCostSavingsPct,
      realizedCostSavingsPct: realizedCostSavingsPct ?? -Infinity,
      realizedLatencyDeltaPct,
      minRequiredVerificationSuccessRate:
        minVerificationSuccessRate,
      maxAllowedLatencyRegressionPct,
      minRequiredCostSavingsPct:
        minRealizedCostSavingsPct,
      minRequiredSamples: minSamples,
    };

    if (
      baselinePost.samples < minSamples ||
      alternativePost.samples < minSamples
    ) {
      reasons.push(
        `Insufficient post-outcome samples: baseline=${baselinePost.samples}, alternative=${alternativePost.samples}, required=${minSamples}.`,
      );
    }

    if (
      baselinePost.confidence === "LOW" ||
      alternativePost.confidence === "LOW"
    ) {
      reasons.push(
        "Post-outcome confidence is LOW for at least one route.",
      );
    }

    if (
      baselinePost.verificationSuccessRate <
        minVerificationSuccessRate ||
      alternativePost.verificationSuccessRate <
        minVerificationSuccessRate
    ) {
      reasons.push(
        "Post-outcome verification success rate is below the promotion threshold.",
      );
    }

    if (realizedCostSavingsPct === undefined) {
      reasons.push(
        "Realized cost per 1k measured tokens is unavailable for the baseline or alternative.",
      );
    } else if (
      realizedCostSavingsPct < minRealizedCostSavingsPct
    ) {
      reasons.push(
        `Realized savings ${realizedCostSavingsPct.toFixed(2)}% is below the ${minRealizedCostSavingsPct.toFixed(2)}% minimum.`,
      );
    }

    if (realizedLatencyDeltaPct === Infinity) {
      reasons.push(
        "P90 latency evidence is unavailable for the baseline or alternative.",
      );
    } else if (
      realizedLatencyDeltaPct > maxLatencyRegressionPct
    ) {
      reasons.push(
        `Latency regression ${realizedLatencyDeltaPct.toFixed(2)}% exceeds the ${maxLatencyRegressionPct.toFixed(2)}% maximum.`,
      );
    }

    if (
      recommendation.expectedCostSavingsPct !== undefined &&
      realizedCostSavingsPct !== undefined &&
      Math.abs(
        realizedCostSavingsPct -
          recommendation.expectedCostSavingsPct,
      ) > maxSavingsDeviationPp
    ) {
      reasons.push(
        `Realized savings deviate ${Math.abs(
          realizedCostSavingsPct -
            recommendation.expectedCostSavingsPct,
        ).toFixed(2)} percentage points from the shadow expectation.`,
      );
    }

    const eligible = reasons.length === 0;
    if (eligible) {
      reasons.push(
        "Later verified outcomes confirm the shadow recommendation strongly enough for canary review.",
      );
    }

    const status: TreasuryPromotionStatus = eligible
      ? "CANARY_ELIGIBLE"
      : reasons.some((reason) =>
          /Insufficient post-outcome|unavailable|LOW|does not contain|No prior/.test(
            reason,
          ),
        )
        ? "INSUFFICIENT_EVIDENCE"
        : "INELIGIBLE";

    const decision: TreasuryEconomicPromotionDecision = {
      status,
      canaryEligible: eligible,
      canAuthorizeSpend: false,
      requiresHumanOrOverseerReview: true,
      generatedAt: now.toISOString(),
      postOutcomeWindowStart: postStart.toISOString(),
      postOutcomeWindowEnd: now.toISOString(),
      accountId: request.accountId,
      workloadType: request.shadowEvaluation.workloadType,
      recommendationRoute: {
        providerId: recommendation.providerId,
        modelId: recommendation.modelId,
      },
      expectedCostSavingsPct:
        recommendation.expectedCostSavingsPct,
      realizedCostSavingsPct,
      realizedLatencyDeltaPct:
        Number.isFinite(realizedLatencyDeltaPct)
          ? realizedLatencyDeltaPct
          : undefined,
      evidence,
      reasons,
      evidenceDigest: digest({
        accountId: request.accountId,
        workloadType: request.shadowEvaluation.workloadType,
        recommendation,
        baseline,
        evidence,
        postOutcomeWindowStart: postStart.toISOString(),
        postOutcomeWindowEnd: now.toISOString(),
        status,
      }),
    };

    return decision;
  }

  private ineligible(
    request: TreasuryEconomicPromotionRequest,
    now: Date,
    postStart: Date,
    recommendation: NonNullable<
      TreasuryShadowRouteEvaluation["recommendation"]
    >,
    reasons: readonly string[],
    evidence:
      | TreasuryEconomicPromotionEvidence
      | undefined,
  ): TreasuryEconomicPromotionDecision {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      canaryEligible: false,
      canAuthorizeSpend: false,
      requiresHumanOrOverseerReview: true,
      generatedAt: now.toISOString(),
      postOutcomeWindowStart: postStart.toISOString(),
      postOutcomeWindowEnd: now.toISOString(),
      accountId: request.accountId,
      workloadType: request.shadowEvaluation.workloadType,
      recommendationRoute: {
        providerId: recommendation.providerId,
        modelId: recommendation.modelId,
      },
      expectedCostSavingsPct:
        recommendation.expectedCostSavingsPct,
      evidence,
      reasons,
      evidenceDigest: digest({
        accountId: request.accountId,
        recommendation,
        reasons,
        evidence,
      }),
    };
  }
}
