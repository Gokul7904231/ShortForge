/**
 * FactoryOS ReMaker v2 — Surgical Repair Contracts
 *
 * ReMaker is a repair coordinator, not a second renderer.
 * Physical media execution remains owned by RenderFabric / Compute Fabric.
 */

export type ReMakerTargetKind =
  | "SUBTITLE"
  | "AUDIO"
  | "VISUAL_ASSET"
  | "TIMING"
  | "RENDER_REGION"
  | "MULTI_TRACK";

export type ReMakerAction =
  | "REALIGN_SUBTITLE"
  | "REPLACE_ASSET"
  | "REGENERATE_AUDIO_SEGMENT"
  | "SHIFT_TIMING"
  | "REBUILD_SCENE"
  | "RENDER_WINDOW";

export interface ReMakerFrameRange {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly haloBeforeFrames: number;
  readonly haloAfterFrames: number;
}

export interface ReMakerTargetScope {
  readonly kind: ReMakerTargetKind;
  readonly sceneIds?: readonly string[];
  readonly clipIds?: readonly string[];
  readonly audioIds?: readonly string[];
  readonly subtitleIds?: readonly string[];
  readonly frameRangeMs?: {
    readonly startMs: number;
    readonly endMs: number;
  };
  readonly region?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface ReMakerAuthorization {
  readonly capabilityId: "CAP_REMAKER_REPAIR";
  readonly grantId: string;
  readonly leaseId: string;
  readonly holderId: string;
  readonly fencingToken: number;
  readonly expiresAt: string;
  readonly authorizedBy: string;
}

export interface ReMakerBudget {
  readonly maxAttempts: number;
  readonly maxDurationMs: number;
  readonly maxCostUnits?: number;
}

export interface ReMakerParentArtifact {
  readonly artifactId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly casRef?: string;
  readonly timelineDigest: string;
  readonly revision: number;
}

export interface ReMakerRequest {
  readonly repairId: string;
  readonly caseId: string;
  readonly missionId: string;
  readonly policyId: string;
  readonly action: ReMakerAction;
  readonly target: ReMakerTargetScope;
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly parentArtifact: ReMakerParentArtifact;
  readonly requestedChangeDigest: string;
  readonly authorization: ReMakerAuthorization;
  readonly budget: ReMakerBudget;
  readonly evidenceRefs: readonly string[];
  readonly reason: string;
  readonly createdAt: string;
}

export interface ReMakerPlan {
  readonly planId: string;
  readonly repairId: string;
  readonly caseId: string;
  readonly missionId: string;
  readonly policyId: string;
  readonly action: ReMakerAction;
  readonly target: ReMakerTargetScope;
  readonly authorization: ReMakerAuthorization;
  readonly frameRange: ReMakerFrameRange;
  readonly changedNodeIds: readonly string[];
  readonly renderSceneIds: readonly string[];
  readonly preservedNodeIds: readonly string[];
  readonly preservedNodeFingerprints: Readonly<Record<string, string>>;
  readonly parentArtifact: ReMakerParentArtifact;
  readonly requestedChangeDigest: string;
  readonly idempotencyKey: string;
  readonly planDigest: string;
  readonly maxAttempts: number;
  readonly maxDurationMs: number;
}

export interface ReMakerCandidateArtifact {
  readonly artifactId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly uri: string;
  readonly mimeType: string;
}

export interface ReMakerExecutionOutput {
  readonly candidateArtifact: ReMakerCandidateArtifact;
  readonly changedNodeIds: readonly string[];
  readonly preservedNodeIds: readonly string[];
  /** Fingerprints measured from the actual patched state, not copied from the plan. */
  readonly preservedNodeFingerprints: Readonly<Record<string, string>>;
  readonly rendererReceiptId?: string;
  readonly observedTimelineDigest?: string;
  readonly physicalValidation: {
    readonly passed: boolean;
    readonly decodeSmokePassed?: boolean;
    readonly durationSeconds?: number;
  };
}

export interface ReMakerExecutionPort {
  execute(plan: ReMakerPlan): Promise<ReMakerExecutionOutput>;
  /** Optional runtime lease/fencing check owned by the execution boundary. */
  assertLease?(plan: ReMakerPlan): Promise<boolean>;
}

export type ReMakerTermination =
  | "COMPLETED"
  | "BUDGET_EXHAUSTED"
  | "NO_PROGRESS"
  | "AUTHORIZATION_EXPIRED"
  | "FENCING_LOST"
  | "PARENT_INVALID"
  | "EXECUTION_FAILED"
  | "ESCALATED";

export interface ReMakerReceipt {
  readonly repairId: string;
  readonly caseId: string;
  readonly missionId: string;
  readonly policyId: string;
  readonly planId: string;
  readonly planDigest: string;
  readonly requestedChangeDigest: string;
  readonly idempotencyKey: string;
  readonly parentArtifactId: string;
  readonly parentArtifactSha256: string;
  readonly parentRevision: number;
  readonly candidateRevision: number;
  readonly candidateArtifact?: ReMakerCandidateArtifact;
  readonly changedNodeIds: readonly string[];
  readonly renderSceneIds: readonly string[];
  readonly preservedNodeIds: readonly string[];
  readonly preservedNodeFingerprints: Readonly<Record<string, string>>;
  readonly observedTimelineDigest?: string;
  readonly attempts: number;
  readonly termination: ReMakerTermination;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly f07Required: true;
  readonly evidenceRefs: readonly string[];
  readonly rendererReceiptId?: string;
  readonly error?: string;
}
