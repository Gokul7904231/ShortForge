/**
 * FactoryOS YouTube Monetization Guardian — Policy Intermediate Representation (IR)
 * Strongly typed intermediate representation for policy-as-data evaluation.
 */

export type PolicyGateId =
  | "G00_POLICY_FRESHNESS"
  | "G01_CHANNEL_READINESS"
  | "G02_COMMUNITY_GUIDELINES"
  | "G03_INAUTHENTIC_CONTENT"
  | "G04_REUSED_CONTENT"
  | "G05_COMMERCIAL_RIGHTS"
  | "G06_ADVERTISER_SUITABILITY"
  | "G07_AI_DISCLOSURE"
  | "G08_SPAM_DECEPTION"
  | "G09_ENGAGEMENT_AUTOMATION"
  | "G10_METADATA_PACKAGING"
  | "G11_KIDS_FAMILY"
  | "G12_SHORTS_ELIGIBILITY"
  | "G13_CHANNEL_REPETITION"
  | "G14_EVIDENCE_RECONCILIATION";

export type RuleSeverity = "BLOCKING" | "REPAIRABLE" | "WARNING" | "EXTERNAL_REVIEW";

export type EvaluationMethod = "DETERMINISTIC" | "CONTEXTUAL_AI" | "HYBRID";

export type ProductionStage = "F00" | "F01" | "F02" | "F03" | "F04" | "F05" | "F06" | "F07";

export type PolicyApplicabilityClock =
  | "UPLOAD_DATE"
  | "PUBLICATION_DATE"
  | "CHANNEL_STATE"
  | "YPP_APPLICATION_DATE";

export type PolicyEffect =
  | "BLOCK_PUBLICATION"
  | "BLOCK_UPLOAD"
  | "PLAYBACK_IMPACT"
  | "REVENUE_IMPACT"
  | "MONETIZATION_ELIGIBILITY"
  | "ADVERTISER_REVIEW"
  | "DISCLOSURE_REQUIRED"
  | "EXTERNAL_REVIEW";

export interface PolicyRuleCondition {
  readonly maxDurationSeconds?: number;
  readonly allowedAspectRatios?: string[];
  readonly minEditorialDistinctness?: number;
  readonly maxCreativeSimilarity?: number;
  readonly requiresTwoStepVerification?: boolean;
  readonly requiresAdvancedFeatures?: boolean;
  readonly requiresAdSenseLinkage?: boolean;
  readonly requiresCommercialLicense?: boolean;
  readonly requireTransformativeValue?: boolean;
  readonly forbidDeceptiveClaims?: boolean;
  readonly forbidFakeEngagementAutomation?: boolean;
  readonly requiresAiDisclosureIfRealistic?: boolean;
  readonly contentIdClaimThresholdSeconds?: number;
  readonly minSubscribers?: number;
  readonly minWatchHours?: number;
  readonly minShortsViews?: number;
  readonly customConditionCode?: string;
}

export interface PolicyRuleDefinition {
  readonly ruleId: string;
  readonly gateId: PolicyGateId;
  readonly sourceDocumentId: string;
  readonly title: string;
  readonly description: string;
  readonly severity: RuleSeverity;
  readonly evaluationMethod: EvaluationMethod;
  readonly appliesBy: PolicyApplicabilityClock;
  readonly policyEffect: PolicyEffect;
  readonly effectiveFrom: string; // ISO date string (YYYY-MM-DD)
  readonly effectiveTo?: string;  // ISO date string if superseded
  readonly condition: PolicyRuleCondition;
  readonly affectedStagesOnFailure: readonly ProductionStage[];
  readonly suggestedRemediationAction: string;
  readonly forbiddenShallowRepairs: readonly string[];
}

export interface PolicyPackIR {
  readonly packName: "youtube";
  readonly version: string;
  readonly generatedAt: string;
  readonly rules: readonly PolicyRuleDefinition[];
}
