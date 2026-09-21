/**
 * FactoryOS YouTube Monetization Guardian — Generic Policy Evaluator
 * Evaluates candidate content and channel context against versioned, effective-date aware policy rules.
 */

import { ContentGenome } from "../../../creative/ContentGenome";
import { MediaProbeMeasurements } from "../../VerificationEngine";
import { MonetizationReadinessState } from "../MonetizationReadinessEvaluator";
import { PolicyRuleDefinition, PolicyGateId, ProductionStage, RuleSeverity } from "./YouTubePolicyIR";
import { PolicySnapshot } from "./YouTubePolicySnapshot";

export interface ChannelContext {
  readonly channelId: string;
  readonly isTwoStepVerificationEnabled: boolean;
  readonly hasAdvancedFeaturesAccess: boolean;
  readonly hasLinkedAdSense: boolean;
  readonly yppStatus: "CHANNEL_READY_TO_APPLY" | "ACCEPTED_INTO_YPP" | "CURRENTLY_MONETIZING" | "NOT_YET_ELIGIBLE" | "RESTRICTED" | "UNKNOWN";
  readonly subscriberCount: number;
  readonly validWatchHoursLast365Days: number;
  readonly shortsViewsLast90Days: number;
  readonly activeCommunityGuidelinesStrikes: number;
  readonly countryRegion: string;
  readonly isChannelThemeConsistent: boolean;
  readonly recentGenomes?: readonly ContentGenome[];
}

export interface VideoAssetRecord {
  readonly assetId: string;
  readonly role: string; // "VIDEO_BROLL" | "AUDIO_BED" | "VOICE" | "IMAGE" | "LOGO" | "FLAG"
  readonly source: string;
  readonly license: string;
  readonly isCommercialSafe: boolean;
  readonly isOriginalSynthesis: boolean;
  readonly expirationDate?: string;
  readonly rightsEvidenceSnippet?: string;
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
   * Filters rules by publication-intent date.
   */
  public static filterActiveRules(
    rules: readonly PolicyRuleDefinition[],
    publicationIntentAt: string
  ): readonly PolicyRuleDefinition[] {
    const pubTimestamp = new Date(publicationIntentAt).getTime();
    return rules.filter((rule) => {
      const fromTime = new Date(rule.effectiveFrom).getTime();
      if (pubTimestamp < fromTime) {
        return false;
      }
      if (rule.effectiveTo) {
        const toTime = new Date(rule.effectiveTo).getTime();
        if (pubTimestamp >= toTime) {
          return false;
        }
      }
      return true;
    });
  }
}
