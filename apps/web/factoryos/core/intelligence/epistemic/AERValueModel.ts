import type {
  EpistemicCognitiveMode,
  EpistemicState,
  ValueEstimateSource,
} from "./EpistemicContracts";

export interface CognitiveOptionProfile {
  readonly mode: EpistemicCognitiveMode;
  readonly resolutionProbability: number;
  readonly costUnits: number;
  readonly latencyMs: number;
  readonly latencyP95Ms?: number;
  readonly latencySafetyMarginMs?: number;
  readonly estimatedCostUsd?: number;
  readonly failureProbability?: number;
  readonly failurePenalty?: number;
  readonly source: Exclude<ValueEstimateSource, "UNAVAILABLE">;
}

export interface AERValuePolicy {
  readonly baseline: CognitiveOptionProfile;
  readonly ascalon: CognitiveOptionProfile;
  readonly resolutionUtilityBySeverity?: Readonly<Record<EpistemicState["impact"]["severity"], number>>;
  readonly unresolvedPenaltyBySeverity?: Readonly<Record<EpistemicState["impact"]["severity"], number>>;
  readonly costWeight?: number;
  readonly costUsdWeight?: number;
  readonly latencyWeight?: number;
  readonly minimumNetValue?: number;
  readonly allowUncalibratedEscalation?: boolean;
}

export interface AERValueAssessment {
  readonly expectedValue: number;
  readonly estimatedLatencyMs: number;
  readonly expectedBenefit: number;
  readonly expectedCost: number;
  readonly incrementalCostUnits: number;
  readonly incrementalLatencyMs: number;
  readonly baselineExpectedUtility: number;
  readonly ascalonExpectedUtility: number;
  readonly uncertaintyBurden: number;
  readonly baselineMode: EpistemicCognitiveMode;
  readonly baselineResolutionProbability: number;
  readonly ascalonResolutionProbability: number;
  readonly incrementalResolutionProbability: number;
  readonly source: ValueEstimateSource;
  readonly shouldInvokeAscalon: boolean;
  readonly reason: string;
}

const DEFAULT_RESOLUTION_UTILITY: Readonly<Record<EpistemicState["impact"]["severity"], number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 4,
  CRITICAL: 8,
};

const DEFAULT_UNRESOLVED_PENALTY: Readonly<Record<EpistemicState["impact"]["severity"], number>> = {
  LOW: 0.25,
  MEDIUM: 0.75,
  HIGH: 2,
  CRITICAL: 5,
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * Decision-theoretic VOI model comparing a baseline action with Ascalon.
 *
 * EU(action) =
 *   P(resolve) * U(resolve)
 *   - P(unresolved) * U(unresolved)
 *   - operational cost
 *   - expected failure penalty
 *
 * AER uses the incremental EU of Ascalon over the baseline for routing.
 */
export function evaluateAscalonValue(
  state: Pick<EpistemicState, "unknown" | "contradictions" | "hypotheses" | "impact">,
  policy: AERValuePolicy,
): AERValueAssessment {
  const clamp = (value: number) =>
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const nonNegative = (value: number) =>
    Math.max(0, Number.isFinite(value) ? value : 0);

  const baselineP = clamp(policy.baseline.resolutionProbability);
  const ascalonP = clamp(policy.ascalon.resolutionProbability);
  const materialUnknown = state.unknown.some((item) => item.material);
  const materialConflict = state.contradictions.some((item) => item.material);
  const activeHypothesisCount = state.hypotheses.filter(
    (item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED",
  ).length;

  const uncertaintyBurden = Math.min(
    1,
    (materialUnknown ? 0.45 : 0) +
      (materialConflict ? 0.35 : 0) +
      (activeHypothesisCount > 1 ? 0.55 : 0),
  );

  const resolutionUtility =
    policy.resolutionUtilityBySeverity?.[state.impact.severity] ??
    DEFAULT_RESOLUTION_UTILITY[state.impact.severity];
  const unresolvedPenalty =
    policy.unresolvedPenaltyBySeverity?.[state.impact.severity] ??
    DEFAULT_UNRESOLVED_PENALTY[state.impact.severity];

  const baselineFailureP = clamp(policy.baseline.failureProbability ?? 0);
  const ascalonFailureP = clamp(policy.ascalon.failureProbability ?? 0);

  const baselineExpectedUtility =
    baselineP * resolutionUtility -
    (1 - baselineP) * unresolvedPenalty -
    baselineFailureP * nonNegative(policy.baseline.failurePenalty ?? unresolvedPenalty);

  const ascalonExpectedUtility =
    ascalonP * resolutionUtility -
    (1 - ascalonP) * unresolvedPenalty -
    ascalonFailureP * nonNegative(policy.ascalon.failurePenalty ?? unresolvedPenalty);

  const incrementalCostUnits = Math.max(
    0,
    nonNegative(policy.ascalon.costUnits) - nonNegative(policy.baseline.costUnits),
  );

  const incrementalCostUsd =
    policy.ascalon.estimatedCostUsd !== undefined &&
    policy.baseline.estimatedCostUsd !== undefined
      ? Math.max(
          0,
          nonNegative(policy.ascalon.estimatedCostUsd) -
            nonNegative(policy.baseline.estimatedCostUsd),
        )
      : undefined;

  const baselineLatencyMs = nonNegative(
    policy.baseline.latencyP95Ms ?? policy.baseline.latencyMs,
  );
  const ascalonLatencyMs = nonNegative(
    policy.ascalon.latencyP95Ms ?? policy.ascalon.latencyMs,
  );
  const incrementalLatencyMs = Math.max(
    0,
    ascalonLatencyMs - baselineLatencyMs,
  );

  const computeCost =
    incrementalCostUsd !== undefined
      ? incrementalCostUsd * Math.max(0, policy.costUsdWeight ?? 1)
      : incrementalCostUnits * Math.max(0, policy.costWeight ?? 0.1);
  const latencyCost =
    (incrementalLatencyMs / 1000) *
    Math.max(0, policy.latencyWeight ?? 0.01);

  const expectedBenefit = ascalonExpectedUtility - baselineExpectedUtility;
  const expectedCost = computeCost + latencyCost;
  const expectedValue = expectedBenefit - expectedCost;
  const threshold = policy.minimumNetValue ?? 0;
  const source: ValueEstimateSource =
    policy.baseline.source === "OBSERVED_CALIBRATION" &&
    policy.ascalon.source === "OBSERVED_CALIBRATION"
      ? "OBSERVED_CALIBRATION"
      : "CONFIGURED_PRIOR";

  const calibrationAllowed =
    source === "OBSERVED_CALIBRATION" ||
    policy.allowUncalibratedEscalation === true;

  return {
    expectedValue,
    estimatedLatencyMs: ascalonLatencyMs,
    expectedBenefit,
    expectedCost,
    incrementalCostUnits,
    incrementalLatencyMs,
    baselineExpectedUtility,
    ascalonExpectedUtility,
    uncertaintyBurden,
    baselineMode: policy.baseline.mode,
    baselineResolutionProbability: baselineP,
    ascalonResolutionProbability: ascalonP,
    incrementalResolutionProbability: Math.max(0, ascalonP - baselineP),
    source,
    shouldInvokeAscalon:
      uncertaintyBurden > 0 &&
      expectedValue >= threshold &&
      calibrationAllowed,
    reason:
      uncertaintyBurden === 0
        ? "No material epistemic uncertainty remains."
        : !calibrationAllowed
          ? "Value model uses uncalibrated priors; production Ascalon escalation is blocked."
          : expectedValue < threshold
            ? "Ascalon has no positive incremental utility after priced compute and latency."
            : "Ascalon has positive incremental expected utility over the configured baseline.",
  };
}
