import type { RemediationCase } from "../verification/youtube/remediation/RemediationCase";
import type {
  ReMakerAuthorization,
  ReMakerParentArtifact,
  ReMakerRequest,
  ReMakerTargetScope,
} from "./ReMakerContracts";

export interface ReMakerHandoffInput {
  readonly caseItem: RemediationCase;
  readonly parentArtifact: ReMakerParentArtifact;
  readonly authorization: ReMakerAuthorization;
  readonly targetScope: ReMakerTargetScope;
  readonly requestedChangeDigest: string;
  readonly budget: ReMakerRequest["budget"];
  readonly reason?: string;
  readonly missionId: string;
}

/**
 * Converts an already-authorized remediation case into a ReMaker request.
 *
 * Important: this helper NEVER creates or upgrades authorization.
 * Guardian-issued authorization must be supplied by the caller.
 */
export class ReMakerHandoff {
  public static create(input: ReMakerHandoffInput): ReMakerRequest {
    const { caseItem } = input;

    if (caseItem.remakerEligible !== true || caseItem.remediationOwner !== "REMAKER") {
      throw new Error(
        "[ReMakerHandoff] Case is not authorized for ReMaker ownership."
      );
    }

    if (!caseItem.recommendedReMakerAction) {
      throw new Error(
        "[ReMakerHandoff] ReMaker case is missing its recommended repair action."
      );
    }

    if (!caseItem.targetScope) {
      // Target must be supplied explicitly by the upstream repair authority.
      // A finding description is never treated as a target.
    }

    if (!input.requestedChangeDigest || !/^[a-f0-9]{64}$/i.test(input.requestedChangeDigest)) {
      throw new Error(
        "[ReMakerHandoff] requestedChangeDigest must be a SHA-256 digest."
      );
    }

    return Object.freeze({
      repairId: "repair_" + caseItem.caseId,
      caseId: caseItem.caseId,
      missionId: input.missionId,
      policyId: caseItem.policyId,
      action: caseItem.recommendedReMakerAction,
      target: input.targetScope,
      allowedActions: caseItem.allowedActions,
      forbiddenActions: caseItem.forbiddenShallowRepairs,
      parentArtifact: input.parentArtifact,
      requestedChangeDigest: input.requestedChangeDigest,
      authorization: input.authorization,
      budget: input.budget,
      evidenceRefs: caseItem.evidence,
      reason: input.reason || caseItem.repairObjective,
      createdAt: new Date().toISOString(),
    });
  }
}
