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
  readonly source: Exclude<ValueEstimateSource, "UNAVAILABLE">;
}

export interface AERValuePolicy {
  readonly baseline: CognitiveOptionProfile;
  readonly ascalon: CognitiveOptionProfile;
  readonly resolutionUtilityBySeverity?: Readonly<Record<EpistemicState["impact"]["severity"], number>>;
  readonly unresolvedPenaltyBySeverity?: Readonly<Record<EpistemicState["impact"]["severity"], number>>;
  readonly costWeight?: number;
  readonly latencyWeight?: number;
  readonly minimumNetValue?: number;
  readonly allowUncalibratedEscalation?: boolean;
}

export interface AERValueAssessment {
  readonly expectedValue: number;
  readonly estimatedLatencyMs: number;
  readonly expectedBenefit: number;
  readonly expectedCost: number;
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
 * AER uses a binary expected-utility delta as its first decision-theoretic VOI
 * model. The model is only meaningful when resolution probabilities are
 * calibrated or explicitly declared priors.
 *
 * EU(option) = P(resolve) * U(resolve)
 *              - P(unresolved) * penalty
 *              - priced runtime cost
 *
 * Net value is the incremental expected utility of Ascalon over the baseline.
 */
export function evaluateAscalonValue(
  state: Pick<EpistemicState, "unknown" | "contradictions" | "hypotheses" | "impact">,
  policy: AERValuePolicy,
): AERValueAssessment {
  const baselineP = clampUnit(policy.baseline.resolutionProbability);
  const ascalonP = clampUnit(policy.ascalon.resolutionProbability);

  const materialUnknown = state.unknown.some((item) => item.material);
  const materialConflict = state.contradictions.some((item) => item.material);
  const activeHypothesisCount = state.hypotheses.filter(
    (item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED",
  ).length;

  // Structural burden is intentionally not called a probability.
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

  const incrementalResolutionProbability = Math.max(0, ascalonP - baselineP);

  const expectedBenefit =
    uncertaintyBurden *
    incrementalResolutionProbability *
    (resolutionUtility + unresolvedPenalty);

  const weightedComputeCost =
    Math.max(0, policy.ascalon.costUnits) * Math.max(0, policy.costWeight ?? 0.1);
  const weightedLatencyCost =
    (Math.max(0, policy.ascalon.latencyMs) / 1000) *
    Math.max(0, policy.latencyWeight ?? 0.01);
  const expectedCost = uncertaintyBurden * (weightedComputeCost + weightedLatencyCost);

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
    estimatedLatencyMs: Math.max(0, policy.ascalon.latencyMs),
    expectedBenefit,
    expectedCost,
    uncertaintyBurden,
    baselineMode: policy.baseline.mode,
    baselineResolutionProbability: baselineP,
    ascalonResolutionProbability: ascalonP,
    incrementalResolutionProbability,
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
            ? "Expected utility gain does not justify the priced Ascalon cost."
            : "Ascalon has positive incremental expected utility over the configured baseline.",
  };
}
