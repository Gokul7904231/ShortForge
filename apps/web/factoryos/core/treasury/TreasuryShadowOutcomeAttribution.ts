/**
 * Treasury Verified Shadow Outcome Attribution
 *
 * Read-only cohort attribution for shadow route promotion review.
 * It consumes verification-backed Treasury calibration only.
 * It cannot execute, reserve, settle, release, freeze, or mutate pricing.
 */

import { createHash } from "node:crypto";
import type { TreasuryEconomicReadSource } from "./TreasuryEconomicIntelligence";
import type { TreasuryRouteCalibrationObservation } from "./TreasuryEconomicCalibration";
import { TreasuryEconomicCalibration } from "./TreasuryEconomicCalibration";

export interface TreasuryShadowOutcomeAttributionRequest {
  readonly accountId: string;
  readonly workloadType: string;
  readonly capability?: string;
  readonly baselineProviderId: string;
  readonly baselineModelId?: string;
  readonly candidateProviderId: string;
  readonly candidateModelId?: string;
  readonly windowMs?: number;
  readonly eventLimit?: number;
  readonly now?: Date;
}

export interface TreasuryShadowOutcomeCohort {
  readonly providerId: string;
  readonly modelId?: string;
  readonly workloadType: string;
  readonly capability?: string;
  readonly samples: number;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
  readonly totalCostUsd: number;
  readonly totalTokens: number;
  readonly costPer1kTokensUsd?: number;
  readonly averageLatencyMs?: number;
  readonly p90LatencyMs?: number;
  readonly verificationSuccessRate: number;
  readonly verifiedSamples: number;
}

export interface TreasuryShadowOutcomeAttribution {
  readonly evidenceId: string;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly cohortKey: string;
  readonly baseline?: TreasuryShadowOutcomeCohort;
  readonly candidate?: TreasuryShadowOutcomeCohort;
  readonly matched: boolean;
  readonly evidenceQuality: "INSUFFICIENT" | "USABLE" | "STRONG";
  readonly realizedCostSavingsPct?: number;
  readonly realizedLatencyDeltaPct?: number;
  readonly verificationDelta: number;
}

function toCohort(
  observation: TreasuryRouteCalibrationObservation | undefined,
): TreasuryShadowOutcomeCohort | undefined {
  if (!observation) return undefined;
  return {
    providerId: observation.providerId,
    modelId: observation.modelId,
    workloadType: observation.workloadType,
    capability: observation.capability,
    samples: observation.samples,
    confidence: observation.confidence,
    totalCostUsd: observation.totalCostUsd,
    totalTokens: observation.totalTokens,
    costPer1kTokensUsd: observation.costPer1kTokensUsd,
    averageLatencyMs: observation.averageLatencyMs,
    p90LatencyMs: observation.p90LatencyMs,
    verificationSuccessRate: observation.verificationSuccessRate,
    verifiedSamples: observation.verifiedSamples,
  };
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

function percentDelta(
  baseline: number | undefined,
  candidate: number | undefined,
): number | undefined {
  if (
    baseline === undefined ||
    candidate === undefined ||
    baseline <= 0
  ) {
    return undefined;
  }
  return ((candidate - baseline) / baseline) * 100;
}

function savingsPercent(
  baseline: number | undefined,
  candidate: number | undefined,
): number | undefined {
  const delta = percentDelta(baseline, candidate);
  return delta === undefined ? undefined : -delta;
}

export class TreasuryShadowOutcomeAttribution {
  constructor(
    private readonly source: TreasuryEconomicReadSource,
  ) {}

  async evaluate(
    request: TreasuryShadowOutcomeAttributionRequest,
  ): Promise<TreasuryShadowOutcomeAttribution> {
    const calibration = new TreasuryEconomicCalibration(this.source);
    const snapshot = await calibration.calibrate(request.accountId, {
      windowMs: request.windowMs ?? 14 * 24 * 60 * 60 * 1000,
      eventLimit: request.eventLimit ?? 10_000,
      now: request.now,
    });

    const matching = snapshot.observations.filter(
      (observation) =>
        observation.workloadType === request.workloadType &&
        (!request.capability ||
          observation.capability === request.capability),
    );

    const baselineObservation = matching.find((observation) =>
      sameRoute(
        observation,
        request.baselineProviderId,
        request.baselineModelId,
      ),
    );
    const candidateObservation = matching.find((observation) =>
      sameRoute(
        observation,
        request.candidateProviderId,
        request.candidateModelId,
      ),
    );

    const baseline = toCohort(baselineObservation);
    const candidate = toCohort(candidateObservation);
    const cohortKey = [
      request.workloadType,
      request.capability ?? "",
      request.baselineProviderId,
      request.baselineModelId ?? "",
      request.candidateProviderId,
      request.candidateModelId ?? "",
      snapshot.windowStart,
      snapshot.windowEnd,
    ].join("|");

    const evidenceId =
      "treasury-promotion-" +
      createHash("sha256")
        .update(cohortKey)
        .digest("hex")
        .slice(0, 24);

    const matched = Boolean(
      baseline &&
        candidate &&
        baseline.workloadType === candidate.workloadType &&
        (baseline.capability ?? "") === (candidate.capability ?? ""),
    );

    const usableSamples = Math.min(
      baseline?.samples ?? 0,
      candidate?.samples ?? 0,
    );

    const evidenceQuality: TreasuryShadowOutcomeAttribution["evidenceQuality"] =
      !matched || usableSamples < 5
        ? "INSUFFICIENT"
        : baseline?.confidence === "HIGH" &&
            candidate?.confidence === "HIGH" &&
            usableSamples >= 30
          ? "STRONG"
          : "USABLE";

    const realizedCostSavingsPct = savingsPercent(
      baseline?.costPer1kTokensUsd,
      candidate?.costPer1kTokensUsd,
    );
    const realizedLatencyDeltaPct = percentDelta(
      baseline?.p90LatencyMs,
      candidate?.p90LatencyMs,
    );
    const verificationDelta =
      (candidate?.verificationSuccessRate ?? 0) -
      (baseline?.verificationSuccessRate ?? 0);

    return {
      evidenceId,
      generatedAt: snapshot.generatedAt,
      windowStart: snapshot.windowStart,
      windowEnd: snapshot.windowEnd,
      cohortKey,
      baseline,
      candidate,
      matched,
      evidenceQuality,
      realizedCostSavingsPct,
      realizedLatencyDeltaPct,
      verificationDelta,
    };
  }
}
