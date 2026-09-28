import type {
  ExecutionRouteDecision,
  ExecutionState,
  ExecutionStepContract,
  ExecutionTransition,
} from "./AgentExecutionContracts";
import type { AgentExecutionStateStore } from "./AgentExecutionStateStore";

type ExecutionFact = boolean | string | number;

export class AgentExecutionRouter {
  private readonly steps = new Map<string, ExecutionStepContract>();
  private readonly transitions: ExecutionTransition[] = [];

  constructor(private readonly stateStore: AgentExecutionStateStore) {}

  registerStep(step: ExecutionStepContract): void {
    if (this.steps.has(step.stepId)) {
      throw new Error("execution_step_already_registered:" + step.stepId);
    }

    if (step.allowedTools.some((toolId) => !toolId.trim())) {
      throw new Error("execution_step_contains_empty_tool_id:" + step.stepId);
    }

    if (step.requiredCapabilities.some((capability) => !capability.trim())) {
      throw new Error(
        "execution_step_contains_empty_capability:" + step.stepId
      );
    }

    if (step.retryPolicy.maxAttempts < 1) {
      throw new Error(
        "execution_step_invalid_max_attempts:" + step.stepId
      );
    }

    if (step.idempotency === "REQUIRED" && step.sideEffect === "NONE") {
      throw new Error(
        "idempotency_required_without_side_effect:" + step.stepId
      );
    }

    this.steps.set(step.stepId, step);
  }

  registerTransition(transition: ExecutionTransition): void {
    if (!this.steps.has(transition.fromStepId)) {
      throw new Error(
        "execution_transition_unknown_source:" + transition.fromStepId
      );
    }

    if (!this.steps.has(transition.toStepId)) {
      throw new Error(
        "execution_transition_unknown_target:" + transition.toStepId
      );
    }

    this.transitions.push(transition);
  }

  getStep(stepId: string): ExecutionStepContract | undefined {
    return this.steps.get(stepId);
  }

  getAvailableTools(stepId: string): readonly string[] {
    return this.steps.get(stepId)?.allowedTools || [];
  }

  getRequiredCapabilities(stepId: string): readonly string[] {
    return this.steps.get(stepId)?.requiredCapabilities || [];
  }

  start(state: ExecutionState): ExecutionState {
    const step = this.steps.get(state.stepId);

    if (!step) {
      throw new Error("execution_step_not_registered:" + state.stepId);
    }

    const missingPreconditions = step.preconditions.filter(
      (precondition) => state.facts[precondition] !== true,
    );

    if (missingPreconditions.length > 0) {
      throw new Error(
        "execution_preconditions_missing:" +
          missingPreconditions.join(","),
      );
    }

    if (step.idempotency === "REQUIRED" && !state.idempotencyKey) {
      throw new Error(
        "execution_idempotency_key_required:" + state.stepId,
      );
    }

    const next: ExecutionState = {
      ...state,
      status: "RUNNING",
      sideEffectStatus:
        step.sideEffect === "NONE" ? "NOT_STARTED" : "IN_FLIGHT",
      updatedAt: new Date().toISOString(),
    };

    this.stateStore.save(next);
    return next;
  }

  recoverAfterRestart(): ExecutionState[] {
    const recovered: ExecutionState[] = [];

    for (const state of this.stateStore.listOpen()) {
      if (state.sideEffectStatus !== "IN_FLIGHT") continue;

      const recoveredState: ExecutionState = {
        ...state,
        status: "UNKNOWN",
        sideEffectStatus: "UNKNOWN",
        stateVersion: state.stateVersion + 1,
        lastError: "process_restart_during_side_effect",
        updatedAt: new Date().toISOString(),
      };

      this.stateStore.save(recoveredState);
      recovered.push(recoveredState);
    }

    return recovered;
  }

  recordOutcome(
    state: ExecutionState,
    outcome: {
      readonly status: ExecutionState["status"];
      readonly sideEffectStatus: ExecutionState["sideEffectStatus"];
      readonly lastOutcome?: string;
      readonly lastError?: string;
      readonly evidenceRefs: readonly string[];
      readonly artifactRefs: readonly string[];
      readonly factsPatch?: Readonly<Record<string, ExecutionFact>>;
    },
  ): ExecutionRouteDecision {
    const currentStep = this.steps.get(state.stepId);

    if (!currentStep) {
      throw new Error("execution_step_not_registered:" + state.stepId);
    }

    const nextFacts: Record<string, ExecutionFact> = {
      ...state.facts,
      ...(outcome.factsPatch || {}),
    };

    if (outcome.status === "SUCCEEDED") {
      for (const postcondition of currentStep.postconditions) {
        nextFacts[postcondition] = true;
      }
    }

    const nextState: ExecutionState = {
      ...state,
      ...outcome,
      facts: nextFacts,
      stateVersion: state.stateVersion + 1,
      updatedAt: new Date().toISOString(),
    };

    this.stateStore.save(nextState);

    const transition = this.transitions.find(
      (candidate) =>
        candidate.fromStepId === state.stepId &&
        candidate.on === outcome.status,
    );

    if (!transition) {
      if (
        outcome.status === "SUCCEEDED" ||
        outcome.status === "FAILED" ||
        outcome.status === "CANCELLED"
      ) {
        return {
          allowed: true,
          reason: "execution_terminal",
          currentStepId: state.stepId,
        };
      }

      return {
        allowed: false,
        reason: "no_legal_transition_for_outcome",
        currentStepId: state.stepId,
      };
    }

    if (outcome.status === "FAILED" || outcome.status === "UNKNOWN") {
      const attemptsUsed = state.stepAttempt + 1;
      if (attemptsUsed >= currentStep.retryPolicy.maxAttempts) {
        return {
          allowed: false,
          reason: "retry_budget_exhausted",
          currentStepId: state.stepId,
        };
      }

      if (!currentStep.retryPolicy.retryOn.includes(
        outcome.status === "UNKNOWN" ? "UNKNOWN" : "FAILED",
      )) {
        return {
          allowed: false,
          reason: "outcome_not_retryable_for_step",
          currentStepId: state.stepId,
        };
      }

      if (
        currentStep.idempotency === "REQUIRED" &&
        !currentStep.retryPolicy.sameIdempotencyKey
      ) {
        return {
          allowed: false,
          reason: "retry_requires_same_idempotency_key",
          currentStepId: state.stepId,
        };
      }
    }

    const nextStep = this.steps.get(transition.toStepId);

    if (!nextStep) {
      return {
        allowed: false,
        reason: "transition_target_missing",
        currentStepId: state.stepId,
      };
    }

    const missingNextPreconditions = nextStep.preconditions.filter(
      (precondition) => nextFacts[precondition] !== true,
    );

    if (missingNextPreconditions.length > 0) {
      return {
        allowed: false,
        reason:
          "next_step_preconditions_missing:" +
          missingNextPreconditions.join(","),
        currentStepId: state.stepId,
      };
    }

    const advanced: ExecutionState = {
      ...nextState,
      stepId: nextStep.stepId,
      phase: nextStep.phase,
      stepAttempt:
        outcome.status === "UNKNOWN" || outcome.status === "FAILED"
          ? state.stepAttempt + 1
          : 0,
      status: "READY",
      sideEffectStatus: "NOT_STARTED",
      updatedAt: new Date().toISOString(),
    };

    this.stateStore.save(advanced);

    return {
      allowed: true,
      reason: "transition_allowed",
      currentStepId: state.stepId,
      nextStepId: nextStep.stepId,
      nextPhase: nextStep.phase,
      transition,
    };
  }
}
