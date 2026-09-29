import type {
  AscalonInvocationReason,
  AscalonInvocationBudget,
  CognitiveRecommendation,
  EpistemicBudget,
  EpistemicState,
  EpistemicUsage,
} from "./EpistemicContracts";
import { EpistemicBudgetController } from "./EpistemicBudget";

export interface CognitiveRoutingOptions {
  readonly deadlineMs?: number;
  readonly microAvailable?: boolean;
  readonly deepAvailable?: boolean;
  readonly ascalonAvailable?: boolean;
  readonly specialistAvailable?: boolean;
  readonly humanEscalationAvailable?: boolean;
  readonly ascalonEstimatedCostUnits?: number;
  readonly minimumAscalonExpectedValue?: number;
}

function severityValue(severity: EpistemicState["impact"]["severity"]): number {
  switch (severity) {
    case "CRITICAL":
      return 0.4;
    case "HIGH":
      return 0.2;
    case "MEDIUM":
      return 0.1;
    case "LOW":
    default:
      return 0;
  }
}

/**
 * AER expected value is deliberately a policy/routing signal.
 * It is not a probability, confidence score, truth score, or authority signal.
 */
export function estimateAscalonExpectedValue(
  state: Pick<EpistemicState, "unknown" | "contradictions" | "hypotheses" | "impact">,
): number {
  const materialUnknown = state.unknown.some((item) => item.material);
  const materialConflict = state.contradictions.some((item) => item.material);
  const multipleHypotheses =
    state.hypotheses.filter((item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED").length > 1;

  if (!materialUnknown && !materialConflict && !multipleHypotheses) return 0;

  return Math.min(
    1,
    (materialUnknown ? 0.35 : 0) +
      (materialConflict ? 0.3 : 0) +
      (multipleHypotheses ? 0.55 : 0) +
      severityValue(state.impact.severity),
  );
}

function deepReasonCode(
  state: Pick<EpistemicState, "unknown" | "contradictions" | "hypotheses" | "impact">,
): AscalonInvocationReason {
  const multipleHypotheses =
    state.hypotheses.filter((item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED").length > 1;
  const materialConflict = state.contradictions.some((item) => item.material);

  if (state.impact.severity === "CRITICAL" || state.impact.severity === "HIGH") {
    return "HIGH_IMPACT_UNRESOLVED";
  }
  if (materialConflict) return "MATERIAL_CONTRADICTION";
  if (multipleHypotheses) return "MULTIPLE_VIABLE_HYPOTHESES";
  return "MATERIAL_UNCERTAINTY";
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
      state.hypotheses.filter((item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED").length > 1;
    const expectedValue = estimateAscalonExpectedValue(state);
    const minimumExpectedValue = Math.min(
      1,
      Math.max(0, options.minimumAscalonExpectedValue ?? 0.5),
    );
    const estimatedCostUnits = Math.max(
      0,
      options.ascalonEstimatedCostUnits ?? 5,
    );
    const ascalonAvailable =
      options.ascalonAvailable ?? options.deepAvailable ?? false;
    const remainingBudget: AscalonInvocationBudget = {
      maxTimeMs: Math.max(0, budget.maxEpistemicTimeMs - usage.elapsedMs),
      maxCallsRemaining: Math.max(0, budget.maxDeepCalls - usage.deepCalls),
      maxCostUnits: Math.max(0, budget.maxCostUnits - usage.costUnits),
    };

    if (!materialUnknown && !materialConflict && !multipleHypotheses) {
      return {
        mode: "DETERMINISTIC",
        reason: "No material epistemic uncertainty remains.",
        reasonCode: "NO_MATERIAL_UNCERTAINTY",
        deadlineMs,
        expectedValue,
        shouldInvokeAscalon: false,
        estimatedCostUnits,
        budget: remainingBudget,
      };
    }

    if (state.impact.severity === "CRITICAL" && options.humanEscalationAvailable) {
      return {
        mode: "HUMAN",
        reason: "Critical-impact epistemic uncertainty requires governed human resolution.",
        reasonCode: "HUMAN_ESCALATION_REQUIRED",
        deadlineMs,
        expectedValue,
        shouldInvokeAscalon: false,
        estimatedCostUnits,
        budget: remainingBudget,
      };
    }

    const canAffordAscalon =
      remainingBudget.maxCallsRemaining > 0 &&
      remainingBudget.maxCostUnits >= estimatedCostUnits;
    const ascalonValueJustifiesCost = expectedValue >= minimumExpectedValue;
    const deepAvailableByPolicy =
      ascalonAvailable &&
      this.controller.canUseDeep(usage) &&
      canAffordAscalon &&
      ascalonValueJustifiesCost;

    if (deepAvailableByPolicy) {
      return {
        mode: "DEEP",
        reason: "Epistemic value justifies bounded deep Ascalon cognition within the remaining cost/time budget.",
        reasonCode: deepReasonCode(state),
        deadlineMs,
        expectedValue,
        shouldInvokeAscalon: true,
        estimatedCostUnits,
        budget: remainingBudget,
      };
    }

    if (ascalonAvailable && expectedValue >= minimumExpectedValue && !canAffordAscalon) {
      const reasonCode: AscalonInvocationReason =
        remainingBudget.maxCallsRemaining <= 0 || remainingBudget.maxCostUnits < estimatedCostUnits
          ? "ASALCON_BUDGET_EXHAUSTED"
          : "ASALCON_UNAVAILABLE";

      if (options.specialistAvailable) {
        return {
          mode: "SPECIALIST",
          reason: "Ascalon escalation is justified but its local budget is unavailable; route to a bounded specialist instead.",
          reasonCode,
          deadlineMs,
          expectedValue,
          shouldInvokeAscalon: false,
          estimatedCostUnits,
          budget: remainingBudget,
        };
      }
    }

    if (
      options.microAvailable &&
      this.controller.canUseMicro(usage) &&
      !multipleHypotheses &&
      expectedValue < minimumExpectedValue
    ) {
      return {
        mode: "MICRO",
        reason: "Material uncertainty exists, but the policy estimates that cheap micro cognition is sufficient for the current epistemic value.",
        reasonCode: "MICRO_SUFFICIENT",
        deadlineMs,
        expectedValue,
        shouldInvokeAscalon: false,
        estimatedCostUnits,
        budget: remainingBudget,
      };
    }

    if (!ascalonAvailable && expectedValue >= minimumExpectedValue) {
      if (options.specialistAvailable) {
        return {
          mode: "SPECIALIST",
          reason: "Deep cognition is justified but Ascalon is unavailable; use a bounded specialist rather than guessing.",
          reasonCode: "ASALCON_UNAVAILABLE",
          deadlineMs,
          expectedValue,
          shouldInvokeAscalon: false,
          estimatedCostUnits,
          budget: remainingBudget,
        };
      }
    }

    if (options.specialistAvailable) {
      return {
        mode: "SPECIALIST",
        reason: expectedValue < minimumExpectedValue
          ? "No deep invocation is justified by the current expected value; a specialist may provide bounded evidence."
          : "Required cognitive capability is unavailable within the current AER policy.",
        reasonCode: expectedValue < minimumExpectedValue
          ? "EXPECTED_VALUE_BELOW_THRESHOLD"
          : "ASALCON_UNAVAILABLE",
        deadlineMs,
        expectedValue,
        shouldInvokeAscalon: false,
        estimatedCostUnits,
        budget: remainingBudget,
      };
    }

    return {
      mode: "HUMAN",
      reason: "Required cognitive capability is unavailable or budget-exhausted; escalate rather than guess.",
      reasonCode: expectedValue < minimumExpectedValue
        ? "EXPECTED_VALUE_BELOW_THRESHOLD"
        : "ASALCON_UNAVAILABLE",
      deadlineMs,
      expectedValue,
      shouldInvokeAscalon: false,
      estimatedCostUnits,
      budget: remainingBudget,
    };
  }
}
