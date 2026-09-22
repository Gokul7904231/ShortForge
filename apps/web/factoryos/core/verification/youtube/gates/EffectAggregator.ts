/**
 * FactoryOS YouTube Monetization Guardian — Formal Policy Effect Reducer (EffectAggregator)
 * Implements algebraic reduction of gate findings into distinct ReleaseStatus, MonetizationReadiness,
 * active PolicyEffects, and RequiredActions.
 *
 * CRITICAL SEPARATION:
 * UPLOAD SAFETY != MONETIZATION READINESS != ADVERTISER SUITABILITY
 */

import { ReleaseStatus, MonetizationReadinessState, PolicyEffect } from "../contracts/F07ReleaseContracts";
import { GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";

export interface EffectAggregationResult {
  readonly releaseStatus: ReleaseStatus;
  readonly monetizationReadiness: MonetizationReadinessState;
  readonly publishAllowed: boolean;
  readonly publishBlockReason?: string;
  readonly activeEffects: readonly PolicyEffect[];
  readonly blockingFindingCount: number;
  readonly repairableFindingCount: number;
  readonly externalReviewFindingCount: number;
}

export class EffectAggregator {
  /**
   * Reduces gate evaluation findings into authoritative release and monetization decisions.
   */
  public static reduce(findings: readonly GateEvaluationFinding[]): EffectAggregationResult {
    const activeEffects = new Set<PolicyEffect>();
    let hasPublishBlock = false;
    let hasUploadBlock = false;
    let hasPolicyStale = false;
    let hasRepairRequired = false;
    let hasExternalReview = false;
    let hasNotYetEligible = false;
    let hasMonetizationBlock = false;
    let hasMonetizationReview = false;

    let blockingCount = 0;
    let repairableCount = 0;
    let externalReviewCount = 0;
    const blockReasons: string[] = [];

    for (const finding of findings) {
      if (finding.gateId === "G12_SHORTS_ELIGIBILITY" && finding.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE" && finding.observedSignal?.hasActiveContentIdClaim === true) {
        activeEffects.add("REVENUE_IMPACT");
        hasMonetizationReview = true;
      }

      if (finding.status === "PASS") {
        continue;
      }

      if (finding.severity === "BLOCKING") {
        blockingCount++;
        blockReasons.push(`[${finding.gateId}] ${finding.explanation}`);
        if (finding.status === "BLOCKED") {
          hasMonetizationBlock = true;
          hasPublishBlock = true;
          activeEffects.add("BLOCK_PUBLICATION");
        }
      } else if (finding.severity === "REPAIRABLE") {
        repairableCount++;
      } else if (finding.severity === "EXTERNAL_REVIEW") {
        externalReviewCount++;
      }

      // Check specific gates and effects
      if (finding.gateId === "G00_POLICY_FRESHNESS") {
        hasPolicyStale = true;
        hasPublishBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
      }

      if (finding.gateId === "G02_COMMUNITY_GUIDELINES") {
        hasPublishBlock = true;
        hasUploadBlock = true;
        hasMonetizationBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
        activeEffects.add("BLOCK_UPLOAD");
      }

      if (finding.gateId === "G05_COMMERCIAL_RIGHTS") {
        hasPublishBlock = true;
        hasMonetizationBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
      }

      if (finding.gateId === "G08_SPAM_DECEPTION") {
        hasPublishBlock = true;
        hasMonetizationBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
      }

      if (finding.gateId === "G09_ENGAGEMENT_AUTOMATION") {
        hasPublishBlock = true;
        hasMonetizationBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
      }

      if (finding.gateId === "G10_METADATA_PACKAGING" && finding.status === "BLOCKED") {
        hasPublishBlock = true;
        hasMonetizationBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
      } else if (finding.gateId === "G10_METADATA_PACKAGING" && finding.status === "REPAIR_REQUIRED") {
        hasRepairRequired = true;
      }

      if (finding.gateId === "G12_SHORTS_ELIGIBILITY") {
        if (finding.ruleId === "YT.SHORTS.DURATION_AND_GEOMETRY") {
          hasPublishBlock = true;
          hasMonetizationBlock = true;
          activeEffects.add("BLOCK_PUBLICATION");
        }
      }

      if (finding.gateId === "G14_EVIDENCE_RECONCILIATION") {
        hasPublishBlock = true;
        hasMonetizationBlock = true;
        activeEffects.add("BLOCK_PUBLICATION");
      }

      // Monetization-specific gates: Do NOT block publication automatically unless account prerequisites failed
      if (finding.gateId === "G01_CHANNEL_READINESS") {
        activeEffects.add("MONETIZATION_ELIGIBILITY");
        if (finding.observedSignal?.prerequisiteFailures && finding.observedSignal.prerequisiteFailures.length > 0) {
          hasPublishBlock = true;
          hasExternalReview = true;
          hasMonetizationReview = true;
          activeEffects.add("BLOCK_PUBLICATION");
          blockReasons.push(`[G01_CHANNEL_READINESS] Channel account prerequisites not met: ${finding.observedSignal.prerequisiteFailures.join("; ")}`);
        } else if (finding.observedSignal?.yppStatus === "NOT_YET_ELIGIBLE" || finding.observedSignal?.isEligible === false) {
          hasNotYetEligible = true;
        } else if (finding.status === "EXTERNAL_REVIEW") {
          hasExternalReview = true;
          hasMonetizationReview = true;
        }
      }

      if (finding.gateId === "G03_INAUTHENTIC_CONTENT") {
        activeEffects.add("MONETIZATION_ELIGIBILITY");
        if (finding.status === "BLOCKED") {
          hasPublishBlock = true;
          hasMonetizationBlock = true;
          activeEffects.add("BLOCK_PUBLICATION");
        } else if (finding.status === "REPAIR_REQUIRED") {
          hasRepairRequired = true;
        }
      }

      if (finding.gateId === "G04_REUSED_CONTENT") {
        activeEffects.add("MONETIZATION_ELIGIBILITY");
        if (finding.status === "BLOCKED") {
          hasPublishBlock = true;
          hasMonetizationBlock = true;
          activeEffects.add("BLOCK_PUBLICATION");
        } else if (finding.status === "REPAIR_REQUIRED") {
          hasRepairRequired = true;
        } else if (finding.status === "EXTERNAL_REVIEW") {
          hasExternalReview = true;
          hasMonetizationReview = true;
        }
      }

      if (finding.gateId === "G06_ADVERTISER_SUITABILITY") {
        activeEffects.add("ADVERTISER_REVIEW");
        hasMonetizationReview = true;
      }

      if (finding.gateId === "G07_AI_DISCLOSURE") {
        activeEffects.add("DISCLOSURE_REQUIRED");
      }

      if (finding.gateId === "G11_KIDS_FAMILY") {
        activeEffects.add("EXTERNAL_REVIEW");
        hasExternalReview = true;
      }

      if (finding.gateId === "G13_CHANNEL_REPETITION") {
        activeEffects.add("MONETIZATION_ELIGIBILITY");
        if (finding.status === "REPAIR_REQUIRED") {
          hasRepairRequired = true;
        }
      }
    }

    // Determine ReleaseStatus
    let releaseStatus: ReleaseStatus = "APPROVED";
    let publishAllowed = true;
    let publishBlockReason: string | undefined = undefined;

    if (hasPublishBlock || hasUploadBlock) {
      releaseStatus = "BLOCKED";
      publishAllowed = false;
      publishBlockReason = blockReasons.join("; ") || "Publication blocked by policy gate failure";
    } else if (hasPolicyStale) {
      releaseStatus = "POLICY_STALE";
      publishAllowed = false;
      publishBlockReason = "Policy snapshot is stale; refresh required";
    } else if (hasRepairRequired) {
      releaseStatus = "REPAIR_REQUIRED";
      // Repairable findings require remediation before release approval
      publishAllowed = false;
      publishBlockReason = "Repair required before publication";
    } else if (hasExternalReview) {
      releaseStatus = "EXTERNAL_REVIEW";
      // External review can still be published in unlisted/private state
      publishAllowed = true;
    }

    // Determine MonetizationReadiness
    let monetizationReadiness: MonetizationReadinessState = "READY";

    if (hasPolicyStale) {
      monetizationReadiness = "POLICY_STALE";
    } else if (hasMonetizationBlock) {
      monetizationReadiness = "BLOCKED";
    } else if (hasNotYetEligible) {
      monetizationReadiness = "NOT_YET_ELIGIBLE";
    } else if (hasRepairRequired) {
      monetizationReadiness = "REPAIR_REQUIRED";
    } else if (hasMonetizationReview || hasExternalReview) {
      monetizationReadiness = "READY_WITH_EXTERNAL_REVIEW";
    }

    return Object.freeze({
      releaseStatus,
      monetizationReadiness,
      publishAllowed,
      publishBlockReason,
      activeEffects: Object.freeze(Array.from(activeEffects)),
      blockingFindingCount: blockingCount,
      repairableFindingCount: repairableCount,
      externalReviewFindingCount: externalReviewCount,
    });
  }
}
