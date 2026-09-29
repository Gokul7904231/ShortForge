import type { EpistemicContext } from "./EpistemicContracts";

export interface AscalonInvocationAdmission {
  readonly admitted: boolean;
  readonly reason: string;
  readonly contextFingerprint: string;
  readonly expectedValue: number;
  readonly estimatedCostUnits: number;
}

/**
 * Deterministic pre-call gate for Ascalon.
 *
 * This gate only decides whether an Ascalon inference call is admissible.
 * It does not invoke the model and cannot grant runtime authority.
 */
export class AscalonInvocationGate {
  public evaluate(input: {
    readonly context: EpistemicContext;
    readonly nowMs?: number;
  }): AscalonInvocationAdmission {
    const { context } = input;
    const nowMs = input.nowMs ?? Date.now();
    const { cognitiveRecommendation: recommendation } = context;

    if (!recommendation.shouldInvokeAscalon) {
      return {
        admitted: false,
        reason: "aer_policy_does_not_request_ascalon",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    if (recommendation.mode !== "DEEP") {
      return {
        admitted: false,
        reason: "ascalon_requires_deep_cognitive_mode",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    if (context.redactionState !== "CLEAN") {
      return {
        admitted: false,
        reason: "context_redaction_not_clean",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    const expiresAtMs = Date.parse(context.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      return {
        admitted: false,
        reason: "epistemic_context_expired_or_invalid",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    if (recommendation.budget.maxCallsRemaining <= 0) {
      return {
        admitted: false,
        reason: "ascalon_call_budget_exhausted",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    if (
      recommendation.budget.maxTimeMs < recommendation.estimatedLatencyMs ||
      recommendation.estimatedLatencyMs > recommendation.deadlineMs
    ) {
      return {
        admitted: false,
        reason: "ascalon_latency_budget_insufficient",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    if (recommendation.budget.maxCostUnits < recommendation.estimatedCostUnits) {
      return {
        admitted: false,
        reason: "ascalon_cost_budget_insufficient",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    if (context.authorityClass !== "MODEL_ADVISORY") {
      return {
        admitted: false,
        reason: "invalid_ascalon_authority_class",
        contextFingerprint: context.contextFingerprint,
        expectedValue: recommendation.expectedValue,
        estimatedCostUnits: recommendation.estimatedCostUnits,
      };
    }

    return {
      admitted: true,
      reason: "aer_policy_admitted_bounded_ascalon_call",
      contextFingerprint: context.contextFingerprint,
      expectedValue: recommendation.expectedValue,
      estimatedCostUnits: recommendation.estimatedCostUnits,
    };
  }
}
