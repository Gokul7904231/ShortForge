/**
 * FactoryOS YouTube Monetization Guardian — Policy Evaluator Interfaces
 * Strongly typed interfaces for candidate videos, channels, findings, and evaluation results.
 */

import { ContentGenome } from "../../../creative/ContentGenome";
import { MediaProbeMeasurements } from "../../VerificationEngine";
import { MonetizationReadinessState, ReleaseStatus, PolicyEffect } from "../contracts/F07ReleaseContracts";
import { PolicyGateId, PolicyRuleDefinition, ProductionStage, RuleSeverity } from "./YouTubePolicyIR";
import { EvidenceRef } from "../evidence/EvidenceRef";

export interface VideoAssetRecord {
  readonly assetId: string;
  readonly type?: "VIDEO" | "AUDIO" | "VOICE" | "IMAGE" | "MUSIC" | string;
  readonly role?: string;
  readonly source: string;
  readonly license?: string;
  readonly isCommercialSafe: boolean;
  readonly isOriginalSynthesis: boolean;
  readonly assetHash?: string;
  readonly licenseType?: string;
  readonly licenseExpiresAt?: string;
}

export interface ChannelContext {
  readonly channelId: string;
  readonly channelName?: string;
  readonly yppStatus: "CHANNEL_READY_TO_APPLY" | "ACCEPTED_INTO_YPP" | "CURRENTLY_MONETIZING" | "NOT_YET_ELIGIBLE";
  readonly isTwoStepVerificationEnabled: boolean;
  readonly hasAdvancedFeaturesAccess: boolean;
  readonly hasLinkedAdSense: boolean;
  readonly activeCommunityGuidelinesStrikes: number;
  readonly subscriberCount: number;
  readonly validWatchHoursLast365Days: number;
  readonly shortsViewsLast90Days: number;
  readonly recentGenomes?: readonly ContentGenome[];
  readonly coverage?: "FULL" | "PARTIAL" | "SHORTFORGE_ONLY" | "UNKNOWN";
}

export interface CandidateVideoContext {
  readonly videoId: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly thumbnailUri?: string;
  readonly contentEngine: string; // Quiz, GK, History, Coding, Motivation, Psychology, News, Reddit, Story, Guess Flag, Guess Logo
  readonly genome: ContentGenome;
  readonly measurements: MediaProbeMeasurements;
  readonly assets: readonly VideoAssetRecord[];
  readonly scriptText: string;
  readonly scenes: readonly any[];
  readonly hasActiveContentIdClaim?: boolean;
  readonly contentIdClaimDurationSeconds?: number;
  readonly isRealisticallySynthetic?: boolean;
  readonly isAiGenerated?: boolean;
  readonly isAutomatedEngagementUsed?: boolean;
  readonly selfDeclaredMadeForKids?: boolean;
  readonly sensitiveTopicSignals?: readonly string[];
  readonly factualClaimsCount?: number;
  readonly verifiedFactualClaimsCount?: number;
}

export interface GateEvaluationFinding {
  readonly gateId: PolicyGateId;
  readonly ruleId: string;
  readonly status: "PASS" | "REPAIR_REQUIRED" | "BLOCKED" | "EXTERNAL_REVIEW" | "NOT_YET_ELIGIBLE" | "POLICY_STALE";
  readonly severity: RuleSeverity;
  readonly observedSignal: any;
  readonly explanation: string;
  readonly evidence: readonly string[];
  readonly evidenceRefs?: readonly EvidenceRef[];
  readonly affectedStages: readonly ProductionStage[];
  readonly suggestedRemediation?: string;
  readonly forbiddenShallowRepairs?: readonly string[];
  readonly evaluationType: "DETERMINISTIC" | "AI_INFERRED" | "PLATFORM_OBSERVED" | "HYBRID";
  readonly confidence: number;
}

export interface PolicyEvaluationResult {
  readonly evaluationId: string;
  readonly policyPack: "youtube";
  readonly policyVersion: string;
  readonly policySnapshotHash: string;
  readonly contentCreatedAt: string;
  readonly evaluationAt: string;
  readonly publicationIntentAt: string;
  readonly overallOutcome: MonetizationReadinessState;
  readonly releaseStatus?: ReleaseStatus;
  readonly activePolicyEffects?: readonly PolicyEffect[];
  readonly gateFindings: readonly GateEvaluationFinding[];
  readonly blockingFindings: readonly GateEvaluationFinding[];
  readonly repairableFindings: readonly GateEvaluationFinding[];
  readonly externalReviewFindings: readonly GateEvaluationFinding[];
  readonly warnings: readonly GateEvaluationFinding[];
  readonly publishAllowed: boolean;
  readonly publishBlockReason?: string;
}

export class YouTubePolicyEvaluator {
  /**
   * Filters active rules from snapshot for a given publication date.
   */
  public static filterActiveRules(
    rules: readonly PolicyRuleDefinition[],
    publicationDateIso: string
  ): readonly PolicyRuleDefinition[] {
    const pubDate = new Date(publicationDateIso).getTime();
    return rules.filter((rule) => {
      const from = new Date(rule.effectiveFrom).getTime();
      if (pubDate < from) {
        return false;
      }
      if (rule.effectiveTo) {
        const to = new Date(rule.effectiveTo).getTime();
        if (pubDate >= to) {
          return false;
        }
      }
      return true;
    });
  }
}
