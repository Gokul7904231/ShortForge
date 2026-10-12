import { createHash } from "node:crypto";
import type { TreasuryLedgerEvent } from "./TreasuryContracts";

export interface VerifiedRouteOutcome {
  readonly outcomeId: string;
  readonly routeId: string;
  readonly cohortId: string;
  readonly workloadType: string;
  readonly capabilityClass: string;
  readonly observedAt: string;
  readonly realizedCostUsd: number;
  readonly latencyMs: number;
  readonly verification: {
    readonly status: "VERIFIED" | "UNVERIFIED";
    readonly success: boolean;
    readonly f07ReceiptId?: string;
  };
  readonly evidenceRef?: string;
}

export interface TreasuryPromotionThresholds {
  readonly minSamplesPerCohort?: number;
  readonly highConfidenceSamples?: number;
  readonly minimumVerificationSuccessRate?: number;
  readonly maximumVerificationRegression?: number;
  readonly maximumP90LatencyRegressionPct?: number;
  readonly minimumCostSavingsPct?: number;
}

export interface TreasuryPromotionEligibilityRequest {
  readonly recommendationId: string;
  readonly recommendationIssuedAt: string;
  readonly evaluatedAt: string;
  readonly workloadType: string;
  readonly capabilityClass: string;
  readonly baseline: { readonly routeId: string; readonly cohortId: string };
  readonly candidate: { readonly routeId: string; readonly cohortId: string };
  readonly outcomes: readonly VerifiedRouteOutcome[];
  readonly thresholds?: TreasuryPromotionThresholds;
}

export interface TreasuryPromotionCohortMetrics {
  readonly routeId: string;
  readonly cohortId: string;
  readonly sampleCount: number;
  readonly meanRealizedCostUsd?: number;
  readonly p90LatencyMs?: number;
  readonly verificationSuccessRate?: number;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
  readonly qualifyingOutcomeIds: readonly string[];
  readonly f07ReceiptIds: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface TreasuryPromotionEligibilityArtifact {
  readonly schemaVersion: "shortforge.treasury.promotion-eligibility.v1";
  readonly recommendationId: string;
  readonly generatedAt: string;
  readonly recommendationIssuedAt: string;
  readonly decision: "ELIGIBLE_FOR_HUMAN_REVIEW" | "NOT_ELIGIBLE";
  readonly reasonCodes: readonly string[];
  readonly thresholds: Required<TreasuryPromotionThresholds>;
  readonly baseline: TreasuryPromotionCohortMetrics;
  readonly candidate: TreasuryPromotionCohortMetrics;
  readonly comparison: {
    readonly realizedCostSavingsPct?: number;
    readonly p90LatencyRegressionPct?: number;
    readonly verificationSuccessDelta?: number;
    readonly costEligible: boolean;
    readonly latencyEligible: boolean;
    readonly verificationEligible: boolean;
    readonly sampleEligible: boolean;
  };
  readonly excludedOutcomeCount: number;
  readonly qualifyingEvidenceRefs: readonly string[];
  readonly authority: {
    readonly readOnly: true;
    readonly canAuthorizeSpend: false;
    readonly canChangeRoutingPolicy: false;
    readonly canExecuteProvider: false;
    readonly canMutateTreasury: false;
    readonly requiresHumanOverseerReview: true;
  };
  readonly artifactDigest: string;
}

const DEFAULT_THRESHOLDS: Required<TreasuryPromotionThresholds> = {
  minSamplesPerCohort: 30,
  highConfidenceSamples: 100,
  minimumVerificationSuccessRate: 0.95,
  maximumVerificationRegression: 0.01,
  maximumP90LatencyRegressionPct: 10,
  minimumCostSavingsPct: 5,
};

function canonicalTime(value: string): number | undefined {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function confidenceFor(
  samples: number,
  thresholds: Required<TreasuryPromotionThresholds>,
): "LOW" | "MEDIUM" | "HIGH" {
  if (samples < thresholds.minSamplesPerCohort) return "LOW";
  return samples >= thresholds.highConfidenceSamples ? "HIGH" : "MEDIUM";
}

function percentile90(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)];
}

function summarize(
  routeId: string,
  cohortId: string,
  outcomes: readonly VerifiedRouteOutcome[],
  thresholds: Required<TreasuryPromotionThresholds>,
): TreasuryPromotionCohortMetrics {
  const ordered = [...outcomes].sort((a, b) => a.outcomeId.localeCompare(b.outcomeId));
  const costs = ordered.map((outcome) => outcome.realizedCostUsd);
  const latencies = ordered.map((outcome) => outcome.latencyMs);
  const successCount = ordered.filter((outcome) => outcome.verification.success).length;
  return {
    routeId,
    cohortId,
    sampleCount: ordered.length,
    meanRealizedCostUsd:
      costs.length > 0 ? costs.reduce((sum, value) => sum + value, 0) / costs.length : undefined,
    p90LatencyMs: percentile90(latencies),
    verificationSuccessRate:
      ordered.length > 0 ? successCount / ordered.length : undefined,
    confidence: confidenceFor(outcomes.length, thresholds),
    qualifyingOutcomeIds: ordered.map((outcome) => outcome.outcomeId),
    f07ReceiptIds: ordered.map((outcome) => outcome.verification.f07ReceiptId!),
    evidenceRefs: ordered
      .map((outcome) => outcome.evidenceRef)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort(),
  };
}

/**
 * Pure, side-effect-free comparison of later F07-receipted outcomes.
 * This artifact only classifies eligibility for human review. It does not
 * authorize spend, mutate Treasury, execute providers, or change live routing.
 */
export function evaluateTreasuryPromotionEligibility(
  request: TreasuryPromotionEligibilityRequest,
): TreasuryPromotionEligibilityArtifact {
  if (!request || typeof request !== "object" || !Array.isArray(request.outcomes)) {
    throw new Error("Invalid Treasury promotion evaluation request");
  }
  const issuedAt = canonicalTime(request.recommendationIssuedAt);
  const evaluatedAt = canonicalTime(request.evaluatedAt);
  if (
    !request.recommendationId ||
    !request.baseline ||
    typeof request.baseline !== "object" ||
    !request.candidate ||
    typeof request.candidate !== "object" ||
    !request.workloadType ||
    !request.capabilityClass ||
    issuedAt === undefined ||
    evaluatedAt === undefined ||
    evaluatedAt < issuedAt ||
    !request.baseline.routeId ||
    !request.baseline.cohortId ||
    !request.candidate.routeId ||
    !request.candidate.cohortId ||
    request.baseline.routeId === request.candidate.routeId ||
    request.baseline.cohortId === request.candidate.cohortId
  ) {
    throw new Error("Invalid Treasury promotion evaluation identity or time window");
  }

  const thresholds: Required<TreasuryPromotionThresholds> = {
    ...DEFAULT_THRESHOLDS,
    ...request.thresholds,
  };
  if (
    !Number.isInteger(thresholds.minSamplesPerCohort) ||
    thresholds.minSamplesPerCohort < 1 ||
    !Number.isInteger(thresholds.highConfidenceSamples) ||
    thresholds.highConfidenceSamples < thresholds.minSamplesPerCohort ||
    !Number.isFinite(thresholds.minimumVerificationSuccessRate) ||
    thresholds.minimumVerificationSuccessRate < 0 ||
    thresholds.minimumVerificationSuccessRate > 1 ||
    !Number.isFinite(thresholds.maximumVerificationRegression) ||
    thresholds.maximumVerificationRegression < 0 ||
    thresholds.maximumVerificationRegression > 1 ||
    !Number.isFinite(thresholds.maximumP90LatencyRegressionPct) ||
    thresholds.maximumP90LatencyRegressionPct < 0 ||
    !Number.isFinite(thresholds.minimumCostSavingsPct) ||
    thresholds.minimumCostSavingsPct < 0
  ) {
    throw new Error("Invalid Treasury promotion eligibility thresholds");
  }

  let excludedOutcomeCount = 0;
  const preliminarilyEligible: VerifiedRouteOutcome[] = [];

  for (const rawOutcome of request.outcomes as readonly unknown[]) {
    if (!rawOutcome || typeof rawOutcome !== "object") {
      excludedOutcomeCount += 1;
      continue;
    }
    const outcome = rawOutcome as VerifiedRouteOutcome;
    const verification = outcome.verification;
    const hasVerificationObject =
      verification !== null && typeof verification === "object";
    const observedAt = canonicalTime(outcome.observedAt);
    const routeMatches =
      (outcome.routeId === request.baseline.routeId && outcome.cohortId === request.baseline.cohortId) ||
      (outcome.routeId === request.candidate.routeId && outcome.cohortId === request.candidate.cohortId);
    const basicEligible =
      routeMatches &&
      outcome.workloadType === request.workloadType &&
      outcome.capabilityClass === request.capabilityClass &&
      observedAt !== undefined &&
      observedAt > issuedAt &&
      observedAt <= evaluatedAt &&
      hasVerificationObject &&
      verification.status === "VERIFIED" &&
      typeof verification.f07ReceiptId === "string" &&
      verification.f07ReceiptId.length > 0 &&
      typeof verification.success === "boolean" &&
      validNonNegativeFinite(outcome.realizedCostUsd) &&
      validNonNegativeFinite(outcome.latencyMs) &&
      typeof outcome.outcomeId === "string" &&
      outcome.outcomeId.length > 0;

    if (!basicEligible) {
      excludedOutcomeCount += 1;
      continue;
    }
    preliminarilyEligible.push(outcome);
  }

  // Fail closed on every member of a duplicate group. Keeping whichever record
  // appeared first would make eligibility depend on caller-controlled array order.
  const outcomeIdCounts = new Map<string, number>();
  const receiptIdCounts = new Map<string, number>();
  for (const outcome of preliminarilyEligible) {
    outcomeIdCounts.set(outcome.outcomeId, (outcomeIdCounts.get(outcome.outcomeId) ?? 0) + 1);
    const receiptId = outcome.verification.f07ReceiptId!;
    receiptIdCounts.set(receiptId, (receiptIdCounts.get(receiptId) ?? 0) + 1);
  }

  const baselineOutcomes: VerifiedRouteOutcome[] = [];
  const candidateOutcomes: VerifiedRouteOutcome[] = [];
  for (const outcome of preliminarilyEligible) {
    const receiptId = outcome.verification.f07ReceiptId!;
    if ((outcomeIdCounts.get(outcome.outcomeId) ?? 0) > 1 || (receiptIdCounts.get(receiptId) ?? 0) > 1) {
      excludedOutcomeCount += 1;
      continue;
    }
    if (outcome.routeId === request.baseline.routeId && outcome.cohortId === request.baseline.cohortId) {
      baselineOutcomes.push(outcome);
    } else {
      candidateOutcomes.push(outcome);
    }
  }

  const baseline = summarize(request.baseline.routeId, request.baseline.cohortId, baselineOutcomes, thresholds);
  const candidate = summarize(request.candidate.routeId, request.candidate.cohortId, candidateOutcomes, thresholds);
  const sampleEligible =
    baseline.sampleCount >= thresholds.minSamplesPerCohort &&
    candidate.sampleCount >= thresholds.minSamplesPerCohort &&
    baseline.confidence !== "LOW" &&
    candidate.confidence !== "LOW";

  const realizedCostSavingsPct =
    baseline.meanRealizedCostUsd !== undefined &&
    candidate.meanRealizedCostUsd !== undefined &&
    baseline.meanRealizedCostUsd > 0
      ? ((baseline.meanRealizedCostUsd - candidate.meanRealizedCostUsd) / baseline.meanRealizedCostUsd) * 100
      : undefined;
  const p90LatencyRegressionPct =
    baseline.p90LatencyMs !== undefined &&
    candidate.p90LatencyMs !== undefined &&
    baseline.p90LatencyMs > 0
      ? ((candidate.p90LatencyMs - baseline.p90LatencyMs) / baseline.p90LatencyMs) * 100
      : undefined;
  const verificationSuccessDelta =
    baseline.verificationSuccessRate !== undefined && candidate.verificationSuccessRate !== undefined
      ? candidate.verificationSuccessRate - baseline.verificationSuccessRate
      : undefined;

  const costEligible =
    realizedCostSavingsPct !== undefined &&
    realizedCostSavingsPct >= thresholds.minimumCostSavingsPct;
  const latencyEligible =
    p90LatencyRegressionPct !== undefined &&
    p90LatencyRegressionPct <= thresholds.maximumP90LatencyRegressionPct;
  const verificationEligible =
    baseline.verificationSuccessRate !== undefined &&
    candidate.verificationSuccessRate !== undefined &&
    candidate.verificationSuccessRate >= thresholds.minimumVerificationSuccessRate &&
    verificationSuccessDelta !== undefined &&
    verificationSuccessDelta >= -thresholds.maximumVerificationRegression;

  const reasonCodes: string[] = [];
  if (!sampleEligible) reasonCodes.push("INSUFFICIENT_VERIFIED_SAMPLES_OR_CONFIDENCE");
  if (!costEligible) reasonCodes.push("SAVINGS_THRESHOLD_NOT_MET_OR_COST_UNMEASURED");
  if (!latencyEligible) reasonCodes.push("P90_LATENCY_GATE_FAILED_OR_BASELINE_UNMEASURED");
  if (!verificationEligible) reasonCodes.push("VERIFICATION_NON_INFERIORITY_GATE_FAILED");
  const decision: "ELIGIBLE_FOR_HUMAN_REVIEW" | "NOT_ELIGIBLE" =
    sampleEligible && costEligible && latencyEligible && verificationEligible
      ? "ELIGIBLE_FOR_HUMAN_REVIEW"
      : "NOT_ELIGIBLE";

  const core = {
    schemaVersion: "shortforge.treasury.promotion-eligibility.v1" as const,
    recommendationId: request.recommendationId,
    generatedAt: new Date(evaluatedAt).toISOString(),
    recommendationIssuedAt: new Date(issuedAt).toISOString(),
    decision,
    reasonCodes,
    thresholds,
    baseline,
    candidate,
    comparison: {
      realizedCostSavingsPct,
      p90LatencyRegressionPct,
      verificationSuccessDelta,
      costEligible,
      latencyEligible,
      verificationEligible,
      sampleEligible,
    },
    excludedOutcomeCount,
    qualifyingEvidenceRefs: [...new Set([...baseline.evidenceRefs, ...candidate.evidenceRefs])].sort(),
    authority: {
      readOnly: true as const,
      canAuthorizeSpend: false as const,
      canChangeRoutingPolicy: false as const,
      canExecuteProvider: false as const,
      canMutateTreasury: false as const,
      requiresHumanOverseerReview: true as const,
    },
  };
  const artifactDigest = createHash("sha256")
    .update(JSON.stringify(core), "utf8")
    .digest("hex");
  return { ...core, artifactDigest };
}

export interface TreasuryPromotionOutcomeReadSource {
  /**
   * Read-only ledger seam. Implementations must return canonical Treasury ledger
   * events and must not expose a TreasuryService mutation handle.
   */
  listRecentEvents(accountId?: string, limit?: number): Promise<TreasuryLedgerEvent[]>;
}

export interface TreasuryPromotionLedgerEvaluationRequest
  extends Omit<TreasuryPromotionEligibilityRequest, "outcomes"> {
  readonly accountId: string;
  readonly eventLimit?: number;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Builds promotion evidence only from canonical Treasury RESOURCE_CONSUMED
 * events explicitly tagged to this recommendation and experiment cohort.
 *
 * Callers must place these non-secret tags on the selected resource request:
 * treasuryPromotionRecommendationId, treasuryPromotionRouteId,
 * treasuryPromotionCohortId, treasuryPromotionWorkloadType and
 * treasuryPromotionCapabilityClass. The event must also carry the real
 * verificationReceiptId, verified result, measured amount/duration and
 * executionEvidenceId. Missing fields become excluded outcomes (fail closed).
 *
 * This adapter is read-only and never mutates routing, creates canaries,
 * calls providers, reserves spend or changes Treasury policy.
 */
export async function evaluateTreasuryPromotionFromLedger(
  source: TreasuryPromotionOutcomeReadSource,
  request: TreasuryPromotionLedgerEvaluationRequest,
): Promise<TreasuryPromotionEligibilityArtifact> {
  if (!nonEmptyString(request.accountId)) {
    throw new Error("Treasury promotion ledger evaluation requires an accountId");
  }
  const eventLimit = Math.min(
    10_000,
    Math.max(1, Math.floor(request.eventLimit ?? 2_500)),
  );
  const events = await source.listRecentEvents(request.accountId, eventLimit);
  const outcomes: VerifiedRouteOutcome[] = [];

  for (const event of events) {
    if (event.eventType !== "RESOURCE_CONSUMED") continue;
    const payload =
      event.payload && typeof event.payload === "object"
        ? event.payload as Record<string, unknown>
        : {};
    const requests = Array.isArray(payload.resourceRequest)
      ? payload.resourceRequest
      : [];
    const resource =
      requests[0] && typeof requests[0] === "object"
        ? requests[0] as Record<string, unknown>
        : {};
    const metadata =
      resource.metadata && typeof resource.metadata === "object"
        ? resource.metadata as Record<string, unknown>
        : {};
    const recommendationId =
      nonEmptyString(metadata.treasuryPromotionRecommendationId) ??
      nonEmptyString(payload.treasuryPromotionRecommendationId);
    if (recommendationId !== request.recommendationId) continue;

    const f07ReceiptId = nonEmptyString(payload.verificationReceiptId);
    const evidenceRef = nonEmptyString(payload.executionEvidenceId);
    const actualCostUsd =
      typeof event.amountUsd === "number" ? event.amountUsd : Number.NaN;
    const actualLatencyMs =
      typeof payload.actualDurationMs === "number"
        ? payload.actualDurationMs
        : Number.NaN;

    outcomes.push({
      outcomeId: nonEmptyString(event.eventId) ?? "",
      routeId: nonEmptyString(metadata.treasuryPromotionRouteId) ?? "",
      cohortId: nonEmptyString(metadata.treasuryPromotionCohortId) ?? "",
      workloadType:
        nonEmptyString(metadata.treasuryPromotionWorkloadType) ?? "",
      capabilityClass:
        nonEmptyString(metadata.treasuryPromotionCapabilityClass) ?? "",
      observedAt: nonEmptyString(event.occurredAt) ?? "",
      realizedCostUsd: actualCostUsd,
      latencyMs: actualLatencyMs,
      verification: {
        status: f07ReceiptId ? "VERIFIED" : "UNVERIFIED",
        success: payload.verified === true,
        f07ReceiptId,
      },
      evidenceRef,
    });
  }

  return evaluateTreasuryPromotionEligibility({
    ...request,
    outcomes,
  });
}

