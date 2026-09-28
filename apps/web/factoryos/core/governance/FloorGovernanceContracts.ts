/**
 * FactoryOS — Floor Governance Cell (FGC) Contracts
 *
 * Wave 1 bounded-autonomy foundation.
 *
 * Design rule:
 *   Intelligence may propose.
 *   Authority may authorize.
 *   Runtime may execute.
 *   Evidence must prove.
 *
 * These contracts intentionally keep cognition, authority, execution and
 * verification as separate concerns.
 */

export type ActionReversibility = "REVERSIBLE" | "COMPENSATABLE" | "IRREVERSIBLE";
export type ActionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type HumanApprovalMode = "NEVER" | "WHEN_REQUIRED" | "ALWAYS";

export type GovernanceActor =
  | "ASCALON"
  | "INSTRUCTOR"
  | "ADVISOR"
  | "AUDITOR"
  | "FLOOR_GUARDIAN"
  | "FG_HEALER"
  | "COMMON_HEALER"
  | "WORKER"
  | "OVERSEER"
  | "HUMAN"
  | "SYSTEM";

export type FloorGovernanceState =
  | "BOOT"
  | "READY"
  | "OBSERVING"
  | "EXECUTING"
  | "INSPECTING"
  | "QUARANTINED"
  | "INCIDENT"
  | "DIAGNOSING"
  | "HEALING"
  | "VERIFYING"
  | "DEGRADED"
  | "ESCALATED"
  | "OVERSEER_ASSIST"
  | "HUMAN_INTERVENTION"
  | "CLOSED";

export interface FloorActionContract {
  readonly actionName: string;
  readonly description: string;
  readonly actorProposers: readonly GovernanceActor[];
  readonly requiredAuthority: "FLOOR_GUARDIAN" | "OVERSEER" | "HUMAN";
  readonly requiredCapability: string;
  readonly reversibility: ActionReversibility;
  readonly risk: ActionRisk;
  readonly humanApproval: HumanApprovalMode;
  readonly preconditions: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly resourceScope: readonly string[];
  readonly mutationScope: readonly string[];
  readonly postconditions: readonly string[];
  readonly failureTransitions: readonly string[];
}

export interface ActionTransition {
  readonly from: string;
  readonly to: string;
  readonly on:
    | "SUCCESS"
    | "FAILURE"
    | "DENIED"
    | "WAITING_APPROVAL"
    | "QUARANTINED";
}

export interface FloorSnapshot {
  readonly floorId: string;
  readonly state: FloorGovernanceState;
  readonly stateVersion: number;
  readonly observedAt: string;
  readonly jobs: readonly Record<string, unknown>[];
  readonly workers: readonly Record<string, unknown>[];
  readonly resources: readonly Record<string, unknown>[];
  readonly activeIncidents: readonly string[];
  readonly constraints: readonly string[];
}

export interface ActionProposal {
  readonly proposalId: string;
  readonly floorId: string;
  readonly actionName: string;
  readonly proposer: "ASCALON" | "ADVISOR" | "INSTRUCTOR" | "FG_HEALER" | "COMMON_HEALER" | "FLOOR_GUARDIAN";
  readonly targetId?: string;
  readonly parameters: Record<string, unknown>;
  readonly evidenceRefs: readonly string[];
  readonly expectedOutcome: string;
  readonly expectedPostconditions: readonly string[];
  readonly confidence?: number;
  readonly stateVersion: number;
  readonly proposedAt: string;
  readonly inputTrust: "TRUSTED_SYSTEM_STATE" | "MIXED" | "UNTRUSTED_EVIDENCE";
  /**
   * Optional provenance emitted by a future fine-tuned Ascalon inference gateway.
   * Legacy proposal-only callers may omit this field.
   */
  readonly ascalonInference?: {
    readonly inferenceId: string;
    readonly modelRef: string;
    readonly adapterVersion: string;
    readonly mode: "SHADOW" | "ADMITTED";
    readonly contextFingerprint: string;
    readonly observedAt: string;
  };
}

export interface AuthorizationGrant {
  readonly grantId: string;
  readonly floorId: string;
  readonly actionName: string;
  readonly authorizedBy: "FLOOR_GUARDIAN" | "OVERSEER" | "HUMAN";
  readonly capability: string;
  readonly targetId?: string;
  readonly stateVersion: number;
  readonly fencingEpoch?: number;
  readonly expiresAt: string;
  readonly evidenceRefs: readonly string[];
}

export interface ActionGateContext {
  readonly snapshot: FloorSnapshot;
  readonly evidenceRefs: ReadonlySet<string>;
  readonly satisfiedPreconditions: ReadonlySet<string>;
  readonly capabilities: ReadonlySet<string>;
  readonly grants: readonly AuthorizationGrant[];
  readonly humanApprovalIds?: ReadonlySet<string>;
  readonly currentFencingEpoch?: number;
}

export interface ActionGateDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly action?: FloorActionContract;
  readonly grant?: AuthorizationGrant;
}

export interface CounselPacket {
  readonly counselId: string;
  readonly floorId: string;
  readonly incidentId?: string;
  readonly ministerRole: "INSTRUCTOR" | "ADVISOR" | "AUDITOR";
  readonly recommendation: string;
  readonly supportingEvidence: readonly string[];
  readonly constraints: readonly string[];
  readonly uncertainty: number;
  readonly conflictsWith: readonly string[];
  readonly urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly expectedOutcome: string;
  readonly rejectionConditions: readonly string[];
  readonly provenance: string;
  readonly createdAt: string;
}

export type BlackboardEntryKind =
  | "OBSERVATION"
  | "EVIDENCE"
  | "HYPOTHESIS"
  | "RECOMMENDATION"
  | "CONFLICT"
  | "VERIFICATION";

export interface BlackboardEntry {
  readonly entryId: string;
  readonly floorId: string;
  readonly kind: BlackboardEntryKind;
  readonly author: GovernanceActor;
  readonly trust: "UNTRUSTED" | "VERIFIED" | "DERIVED";
  readonly content: Record<string, unknown>;
  readonly evidenceRefs: readonly string[];
  readonly createdAt: string;
}

export interface BorderEvent {
  readonly borderEventId: string;
  readonly sourceFloor: string;
  readonly destinationFloor: string;
  readonly direction: "INGRESS" | "EGRESS";
  readonly actor: string;
  readonly authorizationRef?: string;
  readonly contractVersion: string;
  readonly inputHash: string;
  readonly outputHash?: string;
  readonly artifactIds: readonly string[];
  readonly lineageRefs: readonly string[];
  readonly capabilityUsed?: string;
  readonly policyDecision?: "ALLOW" | "DENY" | "QUARANTINE";
  readonly inspectionResult?: "PASS" | "FAIL" | "NOT_RUN";
  readonly anomalies: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly createdAt: string;
}

export interface BorderDossier {
  readonly borderEventId: string;
  readonly sourceFloor: string;
  readonly destinationFloor: string;
  readonly direction: "INGRESS" | "EGRESS";
  readonly actor: string;
  readonly contractVersion: string;
  readonly inputHash: string;
  readonly outputHash?: string;
  readonly artifactIds: readonly string[];
  readonly lineageEdges: readonly string[];
  readonly capabilityUsed?: string;
  readonly policyDecision: "ALLOW" | "DENY" | "QUARANTINE";
  readonly inspectionResults: readonly string[];
  readonly anomalies: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly contained: boolean;
  readonly createdAt: string;
}

export type HealingSessionState =
  | "CREATED"
  | "DIAGNOSING"
  | "PLANNED"
  | "HEALING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "ESCALATED";

export interface JointHealingSessionRecord {
  readonly sessionId: string;
  readonly incidentId: string;
  readonly floorId: string;
  readonly leadHealerId: string;
  readonly partnerHealerId: string;
  readonly state: HealingSessionState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fencingEpochByResource: Readonly<Record<string, number>>;
  readonly checkpoints: readonly HealingCheckpoint[];
}

export interface MutationLease {
  readonly resourceId: string;
  readonly incidentId: string;
  readonly sessionId: string;
  readonly ownerId: string;
  readonly expiresAt: string;
  readonly fencingEpoch: number;
  readonly capabilityGrant: string;
  readonly actionScope: readonly string[];
  readonly acquiredAt: string;
}

export interface HealingCheckpoint {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly state: HealingSessionState;
  readonly evidenceRefs: readonly string[];
  readonly actionIds: readonly string[];
  readonly createdAt: string;
}

export interface ResolutionProof {
  readonly incidentId: string;
  readonly bdaPass: boolean;
  readonly auditorPass: boolean;
  readonly guardianClosureGrant: boolean;
  readonly verifiedAt: string;
}

export interface ResolutionGateDecision {
  readonly allowed: boolean;
  readonly reason: string;
}
