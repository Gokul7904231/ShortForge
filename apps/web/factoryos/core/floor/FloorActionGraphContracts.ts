/**
 * ShortForge / FactoryOS — Floor Action Graph Contracts
 *
 * Foundation for bounded floor autonomy:
 * intelligence may propose; authority may authorize; runtime may execute;
 * evidence must prove.
 */

export type FloorActionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FloorReversibility = "REVERSIBLE" | "COMPENSATABLE" | "IRREVERSIBLE";

export type FloorExecutionState =
  | "READY"
  | "OBSERVING"
  | "ANALYZING"
  | "VALIDATING"
  | "AWAITING_AUTHORIZATION"
  | "EXECUTING"
  | "VERIFYING"
  | "QUARANTINED"
  | "INCIDENT"
  | "DIAGNOSING"
  | "HEALING"
  | "DEGRADED"
  | "ESCALATED"
  | "HUMAN_INTERVENTION"
  | "CLOSED";

export type FloorActorRole =
  | "ASCALON"
  | "INSTRUCTOR"
  | "ADVISOR"
  | "AUDITOR"
  | "FG_HEALER"
  | "COMMON_HEALER"
  | "WORKER"
  | "GUARDIAN"
  | "OVERSEER"
  | "HUMAN";

export interface ActionPreconditions {
  readonly states?: readonly FloorExecutionState[];
  readonly requiredCapabilities?: readonly string[];
  readonly requiredTrustedEvidence?: readonly string[];
  readonly requiredFlags?: Readonly<Record<string, boolean>>;
}

export interface ActionOutcomeContract {
  readonly outputs: readonly string[];
  readonly postconditions: readonly string[];
  readonly verificationRequired: boolean;
  readonly nextStates: readonly FloorExecutionState[];
}

export interface FloorActionDefinition {
  readonly actionId: string;
  readonly version: number;
  readonly description: string;
  readonly risk: FloorActionRisk;
  readonly reversibility: FloorReversibility;
  readonly mutation: boolean;
  readonly requiresGuardianAuthorization: boolean;
  readonly actorRoles: readonly FloorActorRole[];
  readonly capability?: string;
  readonly preconditions: ActionPreconditions;
  readonly outcome: ActionOutcomeContract;
}

export interface TrustedEvidenceRef {
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly trust: "TRUSTED" | "UNTRUSTED" | "DERIVED";
  readonly digest?: string;
}

export interface FloorActionContext {
  readonly floorId: string;
  readonly state: FloorExecutionState;
  readonly actorId: string;
  readonly actorRole: FloorActorRole;
  readonly capabilities: readonly string[];
  readonly evidence: readonly TrustedEvidenceRef[];
  readonly flags?: Readonly<Record<string, boolean>>;
}

export interface FloorActionProposal {
  readonly proposalId: string;
  readonly floorId: string;
  readonly actionId: string;
  readonly targetId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
  readonly confidence?: number;
  readonly proposedBy: Extract<FloorActorRole, "ASCALON" | "INSTRUCTOR" | "ADVISOR" | "FG_HEALER" | "COMMON_HEALER">;
  readonly createdAt: string;
}

export interface ProposalAssessment {
  readonly admissible: boolean;
  readonly reasons: readonly string[];
  readonly missingCapabilities: readonly string[];
  readonly missingTrustedEvidence: readonly string[];
  readonly action?: FloorActionDefinition;
}

export interface GuardianAuthorization {
  readonly authorizationId: string;
  readonly floorId: string;
  readonly actionId: string;
  readonly targetId: string;
  readonly authorizedBy: "GUARDIAN";
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly actionScope: readonly string[];
  readonly fencingEpoch?: number;
}

export interface AuthorizedActionRequest {
  readonly requestId: string;
  readonly proposal: FloorActionProposal;
  readonly authorization: GuardianAuthorization;
}

export const MUTATING_FLOOR_ROLES: readonly FloorActorRole[] = [
  "GUARDIAN",
  "FG_HEALER",
  "COMMON_HEALER",
  "WORKER",
];

export function isTerminalFloorState(state: FloorExecutionState): boolean {
  return state === "CLOSED";
}
