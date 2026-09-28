import type {
  ExecutionRouteDecision,
  ExecutionState,
  ExecutionStepContract,
  ExecutionTransition,
} from "./AgentExecutionContracts";
import type { AgentExecutionStateStore } from "./AgentExecutionStateStore";

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

  start(state: ExecutionState): ExecutionState {
    const step = this.steps.get(state.stepId);

    if (!step) {
      throw new Error("execution_step_not_registered:" + state.stepId);
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

  recordOutcome(
    state: ExecutionState,
    outcome: Pick<
      ExecutionState,
      | "status"
      | "sideEffectStatus"
      | "lastOutcome"
      | "lastError"
      | "evidenceRefs"
      | "artifactRefs"
    >
  ): ExecutionRouteDecision {
    const currentStep = this.steps.get(state.stepId);

    if (!currentStep) {
      throw new Error("execution_step_not_registered:" + state.stepId);
    }

    const nextState: ExecutionState = {
      ...state,
      ...outcome,
      stateVersion: state.stateVersion + 1,
      updatedAt: new Date().toISOString(),
    };

    this.stateStore.save(nextState);

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

    const transition = this.transitions.find(
      (candidate) =>
        candidate.fromStepId === state.stepId &&
        candidate.on === outcome.status
    );

    if (!transition) {
      return {
        allowed: false,
        reason: "no_legal_transition_for_outcome",
        currentStepId: state.stepId,
      };
    }

    const nextStep = this.steps.get(transition.toStepId);

    if (!nextStep) {
      return {
        allowed: false,
        reason: "transition_target_missing",
        currentStepId: state.stepId,
      };
    }

    if (
      currentStep.sideEffect !== "NONE" &&
      outcome.status === "UNKNOWN" &&
      currentStep.idempotency !== "REQUIRED"
    ) {
      return {
        allowed: false,
        reason: "unknown_side_effect_requires_idempotency",
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
