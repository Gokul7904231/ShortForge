import { createHash } from "node:crypto";
import type {
  AscalonInvocationReason,
  AscalonInvocationBudget,
  CognitiveRecommendation,
  EpistemicBudget,
  EpistemicState,
  EpistemicUsage,
} from "./EpistemicContracts";
import { EpistemicBudgetController } from "./EpistemicBudget";
import {
  evaluateAscalonValue,
  type AERValuePolicy,
  type AERValueAssessment,
} from "./AERValueModel";

export interface CognitiveRoutingOptions {
  readonly deadlineMs?: number;
  readonly microAvailable?: boolean;
  readonly deepAvailable?: boolean;
  readonly ascalonAvailable?: boolean;
  readonly specialistAvailable?: boolean;
  readonly humanEscalationAvailable?: boolean;
  readonly ascalonEstimatedCostUnits?: number;
  readonly ascalonEstimatedLatencyMs?: number;
  readonly ascalonLatencySafetyMarginMs?: number;
  readonly ascalonCapabilityAvailable?: boolean;
  readonly minimumAscalonExpectedValue?: number;
  readonly valuePolicy?: AERValuePolicy;
}

function zeroValueAssessment(
  baselineMode: CognitiveRecommendation["mode"],
): AERValueAssessment {
  return {
    expectedValue: 0,
    expectedBenefit: 0,
    expectedCost: 0,
    incrementalCostUnits: 0,
    incrementalLatencyMs: 0,
    baselineExpectedUtility: 0,
    ascalonExpectedUtility: 0,
    estimatedLatencyMs: 0,
    uncertaintyBurden: 0,
    baselineMode,
    baselineResolutionProbability: 0,
    ascalonResolutionProbability: 0,
    incrementalResolutionProbability: 0,
    source: "UNAVAILABLE",
    shouldInvokeAscalon: false,
    reason: "AER value model is not configured.",
  };
}

function recommendation(
  mode: CognitiveRecommendation["mode"],
  reason: string,
  reasonCode: AscalonInvocationReason,
  deadlineMs: number,
  assessment: AERValueAssessment,
  shouldInvokeAscalon: boolean,
  estimatedCostUnits: number,
  budget: AscalonInvocationBudget,
): CognitiveRecommendation {
  return {
    mode,
    reason,
    reasonCode,
    deadlineMs,
    expectedValue: assessment.expectedValue,
    shouldInvokeAscalon,
    estimatedCostUnits,
    estimatedLatencyMs: assessment.estimatedLatencyMs,
    expectedBenefit: assessment.expectedBenefit,
    expectedCost: assessment.expectedCost,
    incrementalCostUnits: assessment.incrementalCostUnits,
    incrementalLatencyMs: assessment.incrementalLatencyMs,
    uncertaintyBurden: assessment.uncertaintyBurden,
    baselineMode: assessment.baselineMode,
    expectedValueSource: assessment.source,
    decisionId: "aer_decision_" +
      createHash("sha256")
        .update(
          JSON.stringify({
            mode,
            reasonCode,
            deadlineMs,
            expectedValue: assessment.expectedValue,
            baselineMode: assessment.baselineMode,
          }),
          "utf8",
        )
        .digest("hex")
        .slice(0, 24),
    policyVersion: "aer-voi-v2",
    counterfactuals: [
      {
        mode: assessment.baselineMode,
        expectedUtility: assessment.baselineExpectedUtility,
        expectedResolutionProbability: assessment.baselineResolutionProbability,
        expectedCost: 0,
        expectedLatencyMs: Math.max(
          0,
          assessment.estimatedLatencyMs - assessment.incrementalLatencyMs,
        ),
        source: assessment.source,
      },
      {
        mode: "DEEP",
        expectedUtility: assessment.ascalonExpectedUtility,
        expectedResolutionProbability: assessment.ascalonResolutionProbability,
        expectedCost: assessment.expectedCost,
        expectedLatencyMs: assessment.estimatedLatencyMs,
        source: assessment.source,
      },
    ],
    budget,
  };
}

export class CognitiveRouter {
  private readonly controller: EpistemicBudgetController;

  constructor(budget: EpistemicBudget) {
    this.controller = new EpistemicBudgetController(budget);
  }

  public recommend(
    state: Pick<EpistemicState, "unknown" | "contradictions" | "hypotheses" | "impact">,
    usage: EpistemicUsage,
    options: CognitiveRoutingOptions = {},
  ): CognitiveRecommendation {
    const budget = this.controller.getBudget();
    const deadlineMs = Math.max(
      1,
      options.deadlineMs ?? budget.maxEpistemicTimeMs,
    );
    const materialUnknown = state.unknown.some((item) => item.material);
    const materialConflict = state.contradictions.some((item) => item.material);
    const multipleHypotheses =
      state.hypotheses.filter(
        (item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED",
      ).length > 1;

    const estimatedCostUnits = Math.max(
      0,
      options.ascalonEstimatedCostUnits ?? options.valuePolicy?.ascalon.costUnits ?? 5,
    );
    const estimatedLatencyMs = Math.max(
      1,
      options.ascalonEstimatedLatencyMs ?? options.valuePolicy?.ascalon.latencyMs ?? 1000,
    );

    const remainingBudget: AscalonInvocationBudget = {
      maxTimeMs: Math.max(0, budget.maxEpistemicTimeMs - usage.elapsedMs),
      maxCallsRemaining: Math.max(0, budget.maxDeepCalls - usage.deepCalls),
      maxCostUnits: Math.max(0, budget.maxCostUnits - usage.costUnits),
    };

    const valueAssessment = options.valuePolicy
      ? evaluateAscalonValue(state, {
          ...options.valuePolicy,
          ascalon: {
            ...options.valuePolicy.ascalon,
            costUnits: estimatedCostUnits,
            latencyMs: estimatedLatencyMs,
          },
          minimumNetValue: options.minimumAscalonExpectedValue ?? options.valuePolicy.minimumNetValue,
        })
      : zeroValueAssessment(
          options.microAvailable && !multipleHypotheses ? "MICRO" : "DETERMINISTIC",
        );

    if (!materialUnknown && !materialConflict && !multipleHypotheses) {
      return recommendation(
        "DETERMINISTIC",
        "No material epistemic uncertainty remains.",
        "NO_MATERIAL_UNCERTAINTY",
        deadlineMs,
        valueAssessment,
        false,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    if (state.impact.severity === "CRITICAL" && options.humanEscalationAvailable) {
      return recommendation(
        "HUMAN",
        "Critical-impact epistemic uncertainty requires governed human resolution.",
        "HUMAN_ESCALATION_REQUIRED",
        deadlineMs,
        valueAssessment,
        false,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    // ascalonCapabilityAvailable is the canonical capability signal.
    // ascalonAvailable/deepAvailable remain compatibility aliases during migration.
    const ascalonAvailable =
      options.ascalonCapabilityAvailable ??
      options.ascalonAvailable ??
      options.deepAvailable ??
      false;
    const latencySafetyMarginMs = Math.max(
      0,
      options.ascalonLatencySafetyMarginMs ??
        options.valuePolicy?.ascalon.latencySafetyMarginMs ??
        250,
    );
    const requiredLatencyMs = estimatedLatencyMs + latencySafetyMarginMs;
    const hasTimeBudget =
      remainingBudget.maxTimeMs >= requiredLatencyMs &&
      requiredLatencyMs <= deadlineMs;
    const hasCallBudget = remainingBudget.maxCallsRemaining > 0;
    const hasCostBudget = remainingBudget.maxCostUnits >= estimatedCostUnits;

    if (ascalonAvailable && valueAssessment.shouldInvokeAscalon) {
      if (!hasTimeBudget) {
        return recommendation(
          "SPECIALIST",
          "Ascalon value is positive but its estimated latency does not fit the remaining epistemic deadline.",
          "ASCALON_LATENCY_BUDGET_EXHAUSTED",
          deadlineMs,
          valueAssessment,
          false,
          estimatedCostUnits,
          remainingBudget,
        );
      }

      if (!hasCallBudget || !hasCostBudget) {
        const reasonCode: AscalonInvocationReason = "ASCALON_BUDGET_EXHAUSTED";
        return recommendation(
          options.specialistAvailable ? "SPECIALIST" : "HUMAN",
          options.specialistAvailable
            ? "Ascalon value is positive but its call/cost budget is unavailable; route to a bounded specialist."
            : "Ascalon value is positive but its call/cost budget is unavailable; escalate rather than exceed budget.",
          reasonCode,
          deadlineMs,
          valueAssessment,
          false,
          estimatedCostUnits,
          remainingBudget,
        );
      }

      return recommendation(
        "DEEP",
        valueAssessment.reason,
        multipleHypotheses
          ? "MULTIPLE_VIABLE_HYPOTHESES"
          : materialConflict
            ? "MATERIAL_CONTRADICTION"
            : "MATERIAL_UNCERTAINTY",
        deadlineMs,
        valueAssessment,
        true,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    // A value model can say that deep cognition would be useful while calibration
    // policy blocks actual invocation. Preserve that fact for shadow evaluation.
    if (
      ascalonAvailable &&
      valueAssessment.expectedValue > (options.valuePolicy?.minimumNetValue ?? 0) &&
      valueAssessment.source !== "OBSERVED_CALIBRATION"
    ) {
      return recommendation(
        "DEEP",
        valueAssessment.reason,
        "VALUE_MODEL_UNCONFIGURED",
        deadlineMs,
        valueAssessment,
        false,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    if (
      options.microAvailable &&
      this.controller.canUseMicro(usage) &&
      !multipleHypotheses
    ) {
      return recommendation(
        "MICRO",
        valueAssessment.expectedValue < 0
          ? "Cheap micro cognition is preferred because deep cognition has negative expected utility."
          : "Cheap micro cognition is preferred before deep escalation.",
        "MICRO_SUFFICIENT",
        deadlineMs,
        valueAssessment,
        false,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    if (valueAssessment.source === "UNAVAILABLE") {
      if (options.specialistAvailable) {
        return recommendation(
          "SPECIALIST",
          "AER value policy is not configured; use a bounded specialist rather than implicitly invoking Ascalon.",
          "VALUE_MODEL_UNCONFIGURED",
          deadlineMs,
          valueAssessment,
          false,
          estimatedCostUnits,
          remainingBudget,
        );
      }

      return recommendation(
        "HUMAN",
        "AER value policy is not configured; escalate rather than implicitly invoking Ascalon.",
        "VALUE_MODEL_UNCONFIGURED",
        deadlineMs,
        valueAssessment,
        false,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    if (options.specialistAvailable) {
      return recommendation(
        "SPECIALIST",
        valueAssessment.reason,
        valueAssessment.expectedValue < 0
          ? "EXPECTED_VALUE_BELOW_THRESHOLD"
          : "ASCALON_UNAVAILABLE",
        deadlineMs,
        valueAssessment,
        false,
        estimatedCostUnits,
        remainingBudget,
      );
    }

    return recommendation(
      "HUMAN",
      "No admissible low-cost cognitive route remains; escalate rather than guess.",
      valueAssessment.expectedValue < 0
        ? "EXPECTED_VALUE_BELOW_THRESHOLD"
        : "ASCALON_UNAVAILABLE",
      deadlineMs,
      valueAssessment,
      false,
      estimatedCostUnits,
      remainingBudget,
    );
  }
}
