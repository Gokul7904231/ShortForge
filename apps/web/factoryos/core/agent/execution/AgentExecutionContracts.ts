import type { ToolSideEffect, ToolRiskLevel } from "../../contracts/PolicyContracts";

export type ExecutionStepStatus =
  | "READY"
  | "RUNNING"
  | "WAITING"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "BLOCKED"
  | "CANCELLED";

export type ExecutionSideEffect =
  | "NONE"
  | "REVERSIBLE"
  | "EXTERNAL"
  | "FINANCIAL"
  | "IRREVERSIBLE";

export type IdempotencyRequirement = "NONE" | "OPTIONAL" | "REQUIRED";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly retryOn: readonly Array<
    "FAILED" | "TIMEOUT" | "UNKNOWN" | "RATE_LIMITED" | "TRANSIENT"
  >;
  readonly backoffMs: number;
  readonly sameIdempotencyKey: boolean;
}

export interface ExecutionState {
  readonly executionId: string;
  readonly missionId: string;
  readonly runId: string;
  readonly floorId?: string;
  readonly phase: string;
  readonly stepId: string;
  readonly stepAttempt: number;
  readonly stateVersion: number;
  readonly status: ExecutionStepStatus;
  readonly sideEffectStatus:
    | "NOT_STARTED"
    | "IN_FLIGHT"
    | "UNKNOWN"
    | "CONFIRMED"
    | "FAILED";
  readonly idempotencyKey?: string;
  readonly leaseId?: string;
  readonly fencingEpoch?: number;
  readonly authorizationGrantId?: string;
  readonly evidenceRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly lastOutcome?: string;
  readonly lastError?: string;
  readonly humanApprovalState:
    | "NOT_REQUIRED"
    | "PENDING"
    | "APPROVED"
    | "REJECTED";
  readonly updatedAt: string;
}

export interface ExecutionTransition {
  readonly fromStepId: string;
  readonly toStepId: string;
  readonly on:
    | "READY"
    | "SUCCEEDED"
    | "FAILED"
    | "UNKNOWN"
    | "BLOCKED"
    | "CANCELLED";
}

export interface ExecutionStepContract {
  readonly stepId: string;
  readonly phase: string;
  readonly allowedTools: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly preconditions: readonly string[];
  readonly postconditions: readonly string[];
  readonly sideEffect: ExecutionSideEffect;
  readonly idempotency: IdempotencyRequirement;
  readonly retryPolicy: RetryPolicy;
  readonly evidenceRequirements: readonly string[];
  readonly humanApproval:
    | "NONE"
    | "WHEN_REQUIRED"
    | "ALWAYS";
  readonly riskLevel: ToolRiskLevel;
}

export interface ExecutionRouteDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly currentStepId: string;
  readonly nextStepId?: string;
  readonly nextPhase?: string;
  readonly transition?: ExecutionTransition;
}

export interface ScopedToolDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly toolId: string;
  readonly stepId: string;
}

export function sideEffectFromTool(
  sideEffect: ToolSideEffect | undefined,
  risk: ToolRiskLevel | undefined
): ExecutionSideEffect {
  if (sideEffect === "FINANCIAL") return "FINANCIAL";
  if (sideEffect === "DESTRUCTIVE") return "IRREVERSIBLE";
  if (sideEffect === "EXTERNAL_CALL") return "EXTERNAL";
  if (sideEffect === "MUTATES_STATE") return "REVERSIBLE";
  if (risk === "CRITICAL") return "IRREVERSIBLE";
  if (risk === "HIGH") return "EXTERNAL";
  return "NONE";
}
