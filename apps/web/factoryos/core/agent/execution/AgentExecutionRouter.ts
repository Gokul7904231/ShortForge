import type {
  ExecutionRouteDecision,
  ExecutionState,
  ExecutionStepContract,
  ExecutionTransition,
} from "./AgentExecutionContracts";
import {
  executionStateFingerprint,
  type AgentExecutionApprovalStore,
  type AgentExecutionApprovalRequest,
  type CreateAgentApprovalInput,
} from "./AgentExecutionApprovalStore";
import type { AgentExecutionStateStore } from "./AgentExecutionStateStore";

type ExecutionFact = boolean | string | number;

export interface HumanApprovalInput {
  readonly requestedByAgent: string;
  readonly reason: string;
  readonly expiresAt: string;
}

export interface HumanApprovalResumeDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly state: ExecutionState;
  readonly approval?: AgentExecutionApprovalRequest;
}

export class AgentExecutionRouter {
  private readonly steps = new Map<string, ExecutionStepContract>();
  private readonly transitions: ExecutionTransition[] = [];

  constructor(
    private readonly stateStore: AgentExecutionStateStore,
    private readonly approvalStore?: AgentExecutionApprovalStore,
  ) {}

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

  getWaitingForApproval(): ExecutionState[] {
    return this.stateStore
      .listOpen()
      .filter((state) => state.status === "WAITING" && state.approvalId)
      .map((state) => structuredClone(state));
  }

  start(state: ExecutionState): ExecutionState {
    const step = this.steps.get(state.stepId);

    if (!step) {
      throw new Error("execution_step_not_registered:" + state.stepId);
    }

    if (state.status !== "READY") {
      throw new Error(
        "execution_step_not_ready:" + state.stepId + ":" + state.status,
      );
    }

    if (
      state.humanApprovalState === "PENDING" ||
      state.humanApprovalState === "REJECTED"
    ) {
      throw new Error(
        "human_approval_not_satisfied:" + state.stepId,
      );
    }

    if (
      step.humanApproval === "ALWAYS" &&
      state.humanApprovalState !== "APPROVED"
    ) {
      throw new Error(
        "human_approval_required_before_start:" + state.stepId,
      );
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

  requestHumanApproval(
    state: ExecutionState,
    input: HumanApprovalInput,
  ): {
    readonly state: ExecutionState;
    readonly approval: AgentExecutionApprovalRequest;
  } {
    if (!this.approvalStore) {
      throw new Error("approval_store_not_configured");
    }

    const step = this.steps.get(state.stepId);

    if (!step) {
      throw new Error("execution_step_not_registered:" + state.stepId);
    }

    if (step.humanApproval === "NONE") {
      throw new Error("human_approval_not_required:" + state.stepId);
    }

    if (state.status !== "READY") {
      throw new Error(
        "human_approval_requires_ready_state:" +
          state.stepId +
          ":" +
          state.status,
      );
    }

    if (!input.requestedByAgent.trim() || !input.reason.trim()) {
      throw new Error("human_approval_request_missing_reason_or_requester");
    }

    if (new Date(input.expiresAt).getTime() <= Date.now()) {
      throw new Error("human_approval_expiry_must_be_in_future");
    }

    const waitingState: ExecutionState = {
      ...state,
      status: "WAITING",
      humanApprovalState: "PENDING",
      stateVersion: state.stateVersion + 1,
      lastOutcome: "human_approval_requested",
      updatedAt: new Date().toISOString(),
    };

    const approvalInput: CreateAgentApprovalInput = {
      executionId: waitingState.executionId,
      missionId: waitingState.missionId,
      runId: waitingState.runId,
      floorId: waitingState.floorId,
      stepId: waitingState.stepId,
      requestedByAgent: input.requestedByAgent,
      reason: input.reason,
      riskLevel: step.riskLevel,
      requestedStateVersion: waitingState.stateVersion,
      executionStateFingerprint: executionStateFingerprint(waitingState),
      expiresAt: input.expiresAt,
    };

    const approval = this.approvalStore.create(approvalInput);
    const persisted: ExecutionState = {
      ...waitingState,
      approvalId: approval.approvalId,
    };

    this.stateStore.save(persisted);
    return {
      state: structuredClone(persisted),
      approval: structuredClone(approval),
    };
  }

  resolveHumanApproval(
    approvalId: string,
    decision: "APPROVED" | "REJECTED" | "CANCELLED",
    resolvedByUserId: string,
    resolutionReason?: string,
    now = new Date(),
  ): AgentExecutionApprovalRequest {
    if (!this.approvalStore) {
      throw new Error("approval_store_not_configured");
    }

    if (!resolvedByUserId.trim()) {
      throw new Error("approval_resolver_identity_required");
    }

    return this.approvalStore.resolve(
      approvalId,
      decision,
      resolvedByUserId,
      resolutionReason,
      now,
    );
  }

  resumeAfterApproval(
    state: ExecutionState,
  ): HumanApprovalResumeDecision {
    if (!this.approvalStore) {
      return {
        allowed: false,
        reason: "approval_store_not_configured",
        state: structuredClone(state),
      };
    }

    const persisted = this.stateStore.get(state.executionId);

    if (!persisted) {
      return {
        allowed: false,
        reason: "execution_state_not_found",
        state: structuredClone(state),
      };
    }

    if (
      persisted.stateVersion !== state.stateVersion ||
      executionStateFingerprint(persisted) !== executionStateFingerprint(state)
    ) {
      return {
        allowed: false,
        reason: "execution_state_stale_for_approval_resume",
        state: persisted,
      };
    }

    if (persisted.status !== "WAITING" || !persisted.approvalId) {
      return {
        allowed: false,
        reason: "execution_not_waiting_for_approval",
        state: persisted,
      };
    }

    const approval = this.approvalStore.get(persisted.approvalId);

    if (!approval) {
      const blocked = this.blockWaitingExecution(
        persisted,
        "approval_request_missing",
      );
      return {
        allowed: false,
        reason: "approval_request_missing",
        state: blocked,
      };
    }

    if (approval.status === "PENDING") {
      return {
        allowed: false,
        reason: "approval_still_pending",
        state: persisted,
        approval,
      };
    }

    if (
      approval.requestedStateVersion !== persisted.stateVersion ||
      approval.executionStateFingerprint !==
        executionStateFingerprint(persisted)
    ) {
      const blocked = this.blockWaitingExecution(
        persisted,
        "approval_binding_no_longer_matches_execution_state",
      );
      return {
        allowed: false,
        reason: "approval_binding_no_longer_matches_execution_state",
        state: blocked,
        approval,
      };
    }

    if (approval.status !== "APPROVED") {
      const blocked = this.blockWaitingExecution(
        persisted,
        "approval_" + approval.status.toLowerCase(),
      );
      return {
        allowed: false,
        reason: "approval_" + approval.status.toLowerCase(),
        state: blocked,
        approval,
      };
    }

    const resumed: ExecutionState = {
      ...persisted,
      status: "READY",
      humanApprovalState: "APPROVED",
      stateVersion: persisted.stateVersion + 1,
      lastOutcome: "human_approval_granted",
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    };

    this.stateStore.save(resumed);

    return {
      allowed: true,
      reason: "human_approval_granted",
      state: structuredClone(resumed),
      approval,
    };
  }

  recoverAfterRestart(now = new Date()): ExecutionState[] {
    const recovered: ExecutionState[] = [];

    this.approvalStore?.expirePending(now);

    for (const state of this.stateStore.listOpen()) {
      if (state.status === "WAITING") {
        if (!state.approvalId || !this.approvalStore) {
          recovered.push(
            this.blockWaitingExecution(
              state,
              "approval_request_missing_after_restart",
            ),
          );
          continue;
        }

        const approval = this.approvalStore.get(state.approvalId);

        if (!approval) {
          recovered.push(
            this.blockWaitingExecution(
              state,
              "approval_request_missing_after_restart",
            ),
          );
          continue;
        }

        if (approval.status === "EXPIRED" || approval.status === "REJECTED" || approval.status === "CANCELLED") {
          recovered.push(
            this.blockWaitingExecution(
              state,
              "approval_" + approval.status.toLowerCase() + "_after_restart",
            ),
          );
        }

        // PENDING and APPROVED are deliberately left WAITING.
        // A human-approved task must be explicitly resumed; restart never auto-executes.
        continue;
      }

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

    if (state.status !== "RUNNING") {
      return {
        allowed: false,
        reason: "outcome_requires_running_step",
        currentStepId: state.stepId,
      };
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
      humanApprovalState: "NOT_REQUIRED",
      approvalId: undefined,
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

  private blockWaitingExecution(
    state: ExecutionState,
    reason: string,
  ): ExecutionState {
    const blocked: ExecutionState = {
      ...state,
      status: "BLOCKED",
      humanApprovalState: "REJECTED",
      stateVersion: state.stateVersion + 1,
      lastError: reason,
      updatedAt: new Date().toISOString(),
    };
    this.stateStore.save(blocked);
    return blocked;
  }
}
