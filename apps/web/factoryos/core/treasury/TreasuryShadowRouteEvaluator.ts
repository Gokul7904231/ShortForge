/**
 * Treasury Shadow Route Evaluator
 *
 * Counterfactual-only route comparison. It consumes calibrated verified
 * observations and never calls a provider or Treasury mutation API.
 */

import type {
  TreasuryEconomicReadSource,
} from "./TreasuryEconomicIntelligence";
import {
  TreasuryEconomicCalibration,
  type TreasuryRouteCalibrationObservation,
} from "./TreasuryEconomicCalibration";

export interface TreasuryShadowRouteRequest {
  readonly accountId: string;
  readonly workloadType: string;
  readonly capability?: string;
  readonly baselineProviderId?: string;
  readonly baselineModelId?: string;
  readonly requiredVerificationSuccessRate?: number;
  readonly maxLatencyMs?: number;
  readonly minSamples?: number;
}

export interface TreasuryShadowRouteCandidate {
  readonly providerId: string;
  readonly modelId?: string;
  readonly samples: number;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
  readonly costPer1kTokensUsd?: number;
  readonly averageLatencyMs?: number;
  readonly p90LatencyMs?: number;
  readonly verificationSuccessRate: number;
  readonly qualityEligible: boolean;
  readonly latencyEligible: boolean;
  readonly eligible: boolean;
}

export interface TreasuryShadowRouteEvaluation {
  readonly generatedAt: string;
  readonly workloadType: string;
  readonly baseline?: TreasuryShadowRouteCandidate;
  readonly alternatives: readonly TreasuryShadowRouteCandidate[];
  readonly recommendation?:
    | {
        readonly providerId: string;
        readonly modelId?: string;
        readonly expectedCostSavingsPct?: number;
        readonly expectedLatencyDeltaPct?: number;
        readonly rationale: string;
        readonly confidence: "LOW" | "MEDIUM" | "HIGH";
      }
    | undefined;
}

function toCandidate(
  observation: TreasuryRouteCalibrationObservation,
  request: TreasuryShadowRouteRequest,
): TreasuryShadowRouteCandidate {
  const requiredQuality = Math.min(
    1,
    Math.max(0, request.requiredVerificationSuccessRate ?? 0.9),
  );
  const minSamples = Math.max(1, request.minSamples ?? 5);
  const qualityEligible =
    observation.verificationSuccessRate >= requiredQuality;
  const latencyEligible =
    request.maxLatencyMs === undefined
      ? true
      : observation.p90LatencyMs !== undefined &&
        observation.p90LatencyMs <= request.maxLatencyMs;

  return {
    providerId: observation.providerId,
    modelId: observation.modelId,
    samples: observation.samples,
    confidence: observation.confidence,
    costPer1kTokensUsd: observation.costPer1kTokensUsd,
    averageLatencyMs: observation.averageLatencyMs,
    p90LatencyMs: observation.p90LatencyMs,
    verificationSuccessRate: observation.verificationSuccessRate,
    qualityEligible,
    latencyEligible,
    eligible:
      observation.samples >= minSamples &&
      observation.confidence !== "LOW" &&
      qualityEligible &&
      latencyEligible,
  };
}

function sameRoute(
  candidate: TreasuryShadowRouteCandidate,
  providerId?: string,
  modelId?: string,
): boolean {
  return (
    candidate.providerId === providerId &&
    (candidate.modelId ?? "") === (modelId ?? "")
  );
}

function savingsPct(
  baseline?: number,
  alternative?: number,
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
  baseline?: number,
  alternative?: number,
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

export class TreasuryShadowRouteEvaluator {
  constructor(private readonly calibration: TreasuryEconomicCalibration) {}

  async evaluate(
    request: TreasuryShadowRouteRequest,
    options: { windowMs?: number; eventLimit?: number; now?: Date } = {},
  ): Promise<TreasuryShadowRouteEvaluation> {
    const snapshot = await this.calibration.calibrate(
      request.accountId,
      options,
    );

    const matching = snapshot.observations.filter(
      (observation) =>
        observation.workloadType === request.workloadType &&
        (!request.capability || observation.capability === request.capability),
    );

    const candidates = matching
      .map((observation) => toCandidate(observation, request))
      .sort(
        (a, b) =>
          (a.costPer1kTokensUsd ?? Infinity) -
          (b.costPer1kTokensUsd ?? Infinity),
      );

    const baseline =
      candidates.find((candidate) =>
        sameRoute(
          candidate,
          request.baselineProviderId,
          request.baselineModelId,
        ),
      ) ?? candidates.find((candidate) => candidate.eligible);

    const alternatives = candidates.filter(
      (candidate) =>
        !sameRoute(
          candidate,
          baseline?.providerId,
          baseline?.modelId,
        ),
    );

    const bestAlternative = alternatives.find((candidate) => candidate.eligible);
    const costSavings = savingsPct(
      baseline?.costPer1kTokensUsd,
      bestAlternative?.costPer1kTokensUsd,
    );
    const latencyDelta = deltaPct(
      baseline?.p90LatencyMs,
      bestAlternative?.p90LatencyMs,
    );

    const recommendation =
      baseline?.eligible &&
      bestAlternative?.eligible &&
      bestAlternative.confidence !== "LOW" &&
      costSavings !== undefined &&
      costSavings >= 10
        ? {
            providerId: bestAlternative.providerId,
            modelId: bestAlternative.modelId,
            expectedCostSavingsPct: costSavings,
            expectedLatencyDeltaPct: latencyDelta,
            rationale:
              "Verified Treasury evidence indicates a materially cheaper qualified route. This is a shadow recommendation only; live selection and Treasury admission remain separate authorities.",
            confidence: bestAlternative.confidence,
          }
        : undefined;

    return {
      generatedAt: snapshot.generatedAt,
      workloadType: request.workloadType,
      baseline,
      alternatives,
      recommendation,
    };
  }
}

export function createTreasuryShadowRouteEvaluator(
  source: TreasuryEconomicReadSource,
): TreasuryShadowRouteEvaluator {
  return new TreasuryShadowRouteEvaluator(
    new TreasuryEconomicCalibration(source),
  );
}
