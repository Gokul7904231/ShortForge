import type {
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
  readonly specialistAvailable?: boolean;
  readonly humanEscalationAvailable?: boolean;
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
    const deadlineMs = Math.max(
      1,
      options.deadlineMs ?? this.controller.getBudget().maxEpistemicTimeMs,
    );
    const materialUnknown = state.unknown.some((item) => item.material);
    const materialConflict = state.contradictions.some((item) => item.material);
    const multipleHypotheses =
      state.hypotheses.filter((item) => item.status !== "ELIMINATED").length > 1;

    if (!materialUnknown && !materialConflict && !multipleHypotheses) {
      return {
        mode: "DETERMINISTIC",
        reason: "No material epistemic uncertainty remains.",
        deadlineMs,
      };
    }

    if (state.impact.severity === "CRITICAL" && options.humanEscalationAvailable) {
      return {
        mode: "HUMAN",
        reason: "Critical-impact epistemic uncertainty requires governed human resolution.",
        deadlineMs,
      };
    }

    if (options.microAvailable && this.controller.canUseMicro(usage) && !multipleHypotheses) {
      return {
        mode: "MICRO",
        reason: "Material uncertainty exists but does not require multi-hypothesis deep cognition.",
        deadlineMs,
      };
    }

    if (options.deepAvailable && this.controller.canUseDeep(usage)) {
      return {
        mode: "DEEP",
        reason: "Multiple viable hypotheses or material unresolved uncertainty require deep cognition.",
        deadlineMs,
      };
    }

    if (options.specialistAvailable) {
      return {
        mode: "SPECIALIST",
        reason: "Local cognitive budgets/capabilities are insufficient; specialist reasoning is required.",
        deadlineMs,
      };
    }

    return {
      mode: "HUMAN",
      reason: "Required cognitive capability is unavailable or budget-exhausted; escalate rather than guess.",
      deadlineMs,
    };
  }
}
