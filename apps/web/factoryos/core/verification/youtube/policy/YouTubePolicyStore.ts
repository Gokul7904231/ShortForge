/**
 * FactoryOS YouTube Monetization Guardian — YouTube Policy Store
 * Durable, versioned storage for YouTube policy intermediate representations (IR) and snapshots.
 * Supports date-aware active rule resolution for past, today, and future publication targets.
 * Invariant: CLAIM <= EVIDENCE. Missing rule is a policy integrity failure; no fallback fabrication.
 */

import { PolicyRuleDefinition, PolicyApplicabilityClock, PolicyEffect } from "./YouTubePolicyIR";
import { PolicySnapshot, YouTubePolicySnapshotManager } from "./YouTubePolicySnapshot";
import { PolicySourceRegistry } from "./PolicySourceRegistry";
import { PolicyActivationPipeline } from "./PolicyActivationPipeline";
import { PolicyEvaluationContext, PolicyEvaluationContextBuilder } from "./PolicyEvaluationContext";

export class YouTubePolicyStore {
  private static instance: YouTubePolicyStore | null = null;
  private snapshots: Map<string, PolicySnapshot> = new Map();
  private latestVersion: string = "2026.09.15";

  private constructor() {
    this.initializeCanonicalSnapshots();
  }

  public static getInstance(): YouTubePolicyStore {
    if (!YouTubePolicyStore.instance) {
      YouTubePolicyStore.instance = new YouTubePolicyStore();
    }
    return YouTubePolicyStore.instance;
  }

  public static resetInstance(): void {
    YouTubePolicyStore.instance = null;
  }

  /**
   * Initializes canonical snapshot covering official YouTube policy up to September 2026.
   */
  private initializeCanonicalSnapshots(): void {
    const sources = PolicySourceRegistry.getOfficialSources();

    const canonicalRules: PolicyRuleDefinition[] = [
      // G00: Policy Freshness
      {
        ruleId: "YT.POLICY.FRESHNESS",
        gateId: "G00_POLICY_FRESHNESS",
        sourceDocumentId: "src_yt_policy_updates",
        title: "Official Policy Currency Verification",
        description: "Requires active, non-stale policy snapshot retrieved from official YouTube/Google documentation.",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: { customConditionCode: "SNAPSHOT_STATE_CURRENT" },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Refresh policy snapshot from official source registry.",
        forbiddenShallowRepairs: ["override_stale_flag"],
      },

      // G01: Channel Readiness — Prerequisites
      {
        ruleId: "YT.CHANNEL.YPP_PREREQUISITES",
        gateId: "G01_CHANNEL_READINESS",
        sourceDocumentId: "src_yt_ypp_eligibility",
        title: "YPP Essential Account & Verification Prerequisites",
        description: "Requires 2-Step Verification, advanced features enabled, AdSense account linked, and good standing.",
        severity: "EXTERNAL_REVIEW",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "CHANNEL_STATE",
        policyEffect: "MONETIZATION_ELIGIBILITY",
        effectiveFrom: "2024-01-01",
        condition: {
          requiresTwoStepVerification: true,
          requiresAdvancedFeatures: true,
          requiresAdSenseLinkage: true,
        },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Complete YouTube Studio channel verification and link approved AdSense account.",
        forbiddenShallowRepairs: ["mock_channel_status"],
      },

      // G01: Channel Readiness — Current YPP Ads / Premium Audience Thresholds
      {
        ruleId: "YT.CHANNEL.YPP_AUDIENCE_THRESHOLDS",
        gateId: "G01_CHANNEL_READINESS",
        sourceDocumentId: "src_yt_ypp_eligibility",
        title: "YPP Ads & Premium Revenue Sharing Thresholds",
        description: "Requires 1,000 subscribers AND either 4,000 valid public watch hours in past 12 months OR 10 million valid public Shorts views in past 90 days.",
        severity: "EXTERNAL_REVIEW",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "YPP_APPLICATION_DATE",
        policyEffect: "MONETIZATION_ELIGIBILITY",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2027-02-01",
        condition: {
          minSubscribers: 1000,
          minWatchHours: 4000,
          minShortsViews: 10000000,
        },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Reach required 1,000 subscribers and 4k watch hours or 10M Shorts views before applying.",
        forbiddenShallowRepairs: ["mock_channel_status"],
      },

      // G01: Channel Readiness — Scheduled Feb 1, 2027 YPP Threshold Shift for New Creators
      {
        ruleId: "YT.CHANNEL.YPP_FUTURE_THRESHOLDS_2027",
        gateId: "G01_CHANNEL_READINESS",
        sourceDocumentId: "src_yt_policy_updates",
        title: "Scheduled 2027 YPP New Creator Thresholds",
        description: "Starting February 1, 2027, new creator entry thresholds require 1,000 subscribers AND either 8,000 watch hours OR 20 million Shorts views.",
        severity: "EXTERNAL_REVIEW",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "YPP_APPLICATION_DATE",
        policyEffect: "MONETIZATION_ELIGIBILITY",
        effectiveFrom: "2027-02-01",
        condition: {
          minSubscribers: 1000,
          minWatchHours: 8000,
          minShortsViews: 20000000,
        },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Prepare channel volume for higher 2027 entry threshold (8k watch hours / 20M shorts views).",
        forbiddenShallowRepairs: ["mock_channel_status"],
      },

      // G02: Community Guidelines
      {
        ruleId: "YT.COMMUNITY.BASELINE_SAFETY",
        gateId: "G02_COMMUNITY_GUIDELINES",
        sourceDocumentId: "src_yt_community_guidelines",
        title: "Community Guidelines Compliance",
        description: "Zero tolerance for hate speech, harassment, severe violence, sexually explicit content, or dangerous acts.",
        severity: "BLOCKING",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: { customConditionCode: "COMMUNITY_SAFETY_PASS" },
        affectedStagesOnFailure: ["F01", "F02", "F03"],
        suggestedRemediationAction: "Remove non-compliant claims or sensitive scenes from the script and visuals.",
        forbiddenShallowRepairs: ["color-only", "font-only", "zoom-only"],
      },

      // G03: Inauthentic Content (Formerly Repetitious Content)
      {
        ruleId: "YT.INAUTHENTIC.MASS_PRODUCED",
        gateId: "G03_INAUTHENTIC_CONTENT",
        sourceDocumentId: "src_yt_channel_monetization",
        title: "Inauthentic & Repetitive Content Policy",
        description: "Prohibits mass-produced, template-cloned, or interchangeable content lacking substantive distinctness.",
        severity: "REPAIRABLE",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "MONETIZATION_ELIGIBILITY",
        effectiveFrom: "2024-06-01",
        condition: {
          minEditorialDistinctness: 0.35,
          maxCreativeSimilarity: 0.70,
        },
        affectedStagesOnFailure: ["F01", "F02", "F03"],
        suggestedRemediationAction: "Change substantive narrative experience, rewrite hook angle, and vary visual grammar.",
        forbiddenShallowRepairs: [
          "font-only change",
          "color-only change",
          "crop-only change",
          "zoom-only change",
          "caption-style-only change",
          "voice-change-only",
        ],
      },

      // G04: Reused Content (Distinct from Copyright)
      {
        ruleId: "YT.REUSED.TRANSFORMATIVE_VALUE",
        gateId: "G04_REUSED_CONTENT",
        sourceDocumentId: "src_yt_channel_monetization",
        title: "Reused Content Policy with Transformative Requirement",
        description: "Content that repurposes existing material must add significant original commentary, analysis, or narrative value.",
        severity: "REPAIRABLE",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "MONETIZATION_ELIGIBILITY",
        effectiveFrom: "2024-06-01",
        condition: {
          requireTransformativeValue: true,
        },
        affectedStagesOnFailure: ["F01", "F02"],
        suggestedRemediationAction: "Add authoritative critical commentary, counterpoint analysis, or substantive educational synthesis.",
        forbiddenShallowRepairs: [
          "mirroring_video",
          "speeding_up_clips",
          "simple_reaction_cuts",
        ],
      },

      // G05: Commercial Rights & Licensing Provenance
      {
        ruleId: "YT.RIGHTS.COMMERCIAL_PROVENANCE",
        gateId: "G05_COMMERCIAL_RIGHTS",
        sourceDocumentId: "src_yt_copyright_commercial",
        title: "Commercial Rights & Full Asset Licensing Clearance",
        description: "Requires verifiable commercial license or original synthetic provenance for all video, audio, voice, and graphic assets.",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: {
          requiresCommercialLicense: true,
        },
        affectedStagesOnFailure: ["F03", "F04"],
        suggestedRemediationAction: "Replace third-party assets with licensed stock or fully original synthesized assets.",
        forbiddenShallowRepairs: ["fair-use-assertion-without-proof"],
      },

      // G06: Advertiser Suitability
      {
        ruleId: "YT.ADS.SUITABILITY_STANDARD",
        gateId: "G06_ADVERTISER_SUITABILITY",
        sourceDocumentId: "src_yt_advertiser_friendly",
        title: "Advertiser-Friendly Content Guidelines",
        description: "Content must meet advertiser suitability across profanity, violence, adult themes, and sensitive topics.",
        severity: "EXTERNAL_REVIEW",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "ADVERTISER_REVIEW",
        effectiveFrom: "2026-09-01",
        condition: { customConditionCode: "AD_SUITABILITY_PASS" },
        affectedStagesOnFailure: ["F01", "F02", "F03"],
        suggestedRemediationAction: "Tone down sensitive wording, remove explicit imagery, and avoid graphic depictions.",
        forbiddenShallowRepairs: ["beep-only-censor"],
      },

      // G07: AI & Synthetic Media Disclosure
      {
        ruleId: "YT.AI.SYNTHETIC_DISCLOSURE",
        gateId: "G07_AI_DISCLOSURE",
        sourceDocumentId: "src_yt_ai_disclosure",
        title: "Altered or Synthetic Content Disclosure Gate",
        description: "Enforces platform disclosure requirement for realistic synthetic media. Mandates setting status.containsSyntheticMedia.",
        severity: "WARNING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "UPLOAD_DATE",
        policyEffect: "DISCLOSURE_REQUIRED",
        effectiveFrom: "2024-03-18",
        condition: {
          requiresAiDisclosureIfRealistic: true,
        },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Set containsSyntheticMedia=true in YouTube Data API upload manifest.",
        forbiddenShallowRepairs: ["uncheck_synthetic_box"],
      },

      // G08: Spam, Scams & Deceptive Practices
      {
        ruleId: "YT.SPAM.DECEPTIVE_PRACTICES",
        gateId: "G08_SPAM_DECEPTION",
        sourceDocumentId: "src_yt_spam_deception",
        title: "Anti-Spam & Honest Promise Delivery",
        description: "Zero tolerance for clickbait promises, fraudulent investment schemes, fabricated medical claims, or deceptive URLs.",
        severity: "BLOCKING",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: {
          forbidDeceptiveClaims: true,
        },
        affectedStagesOnFailure: ["F01", "F02", "F07"],
        suggestedRemediationAction: "Align hook with substantive payoff and eliminate unverified sensational claims.",
        forbiddenShallowRepairs: ["title-length-reduction-only"],
      },

      // G09: Engagement & Automation (Pre-publish internal governance)
      {
        ruleId: "YT.ENGAGEMENT.NO_MANIPULATION",
        gateId: "G09_ENGAGEMENT_AUTOMATION",
        sourceDocumentId: "src_yt_fake_engagement",
        title: "Pre-Publish Anti-Manipulation & Fake Traffic Gate",
        description: "Verifies ShortForge automation does not employ artificial view bots, metric purchasing, or spoofed signals.",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: {
          forbidFakeEngagementAutomation: true,
        },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Halt any artificial engagement pipelines; rely exclusively on organic reach.",
        forbiddenShallowRepairs: [],
      },

      // G10: Metadata and Packaging
      {
        ruleId: "YT.METADATA.PACKAGING_INTEGRITY",
        gateId: "G10_METADATA_PACKAGING",
        sourceDocumentId: "src_yt_spam_deception",
        title: "Metadata & Packaging Alignment",
        description: "Ensures title, description, tags, and hashtags accurately reflect video content without misleading tags or tag-stuffing in description.",
        severity: "REPAIRABLE",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: { customConditionCode: "METADATA_ACCURACY_CHECK" },
        affectedStagesOnFailure: ["F02", "F07"],
        suggestedRemediationAction: "Rewrite title and prune irrelevant or repetitive hashtags.",
        forbiddenShallowRepairs: ["randomize_tags"],
      },

      // G11: Kids and Family Quality
      {
        ruleId: "YT.KIDS.QUALITY_STANDARDS",
        gateId: "G11_KIDS_FAMILY",
        sourceDocumentId: "src_yt_kids_family",
        title: "Kids & Family High-Quality Principles",
        description: "When content targets children, requires positive role-modeling, learning enrichment, and non-commercialization.",
        severity: "WARNING",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "EXTERNAL_REVIEW",
        effectiveFrom: "2023-11-01",
        condition: { customConditionCode: "KIDS_QUALITY_PASS" },
        affectedStagesOnFailure: ["F01", "F02"],
        suggestedRemediationAction: "Eliminate overt commercial promotion and reinforce educational curiosity.",
        forbiddenShallowRepairs: [],
      },

      // G12: Shorts Eligibility (Aspect Ratio + Duration up to 180s)
      {
        ruleId: "YT.SHORTS.DURATION_AND_GEOMETRY",
        gateId: "G12_SHORTS_ELIGIBILITY",
        sourceDocumentId: "src_yt_shorts_monetization",
        title: "Shorts Format Geometry and 180s Duration Limit",
        description: "Shorts must be qualifying square (1:1) or vertical (9:16) format with maximum duration of 180 seconds (3 minutes).",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "UPLOAD_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-10-15",
        condition: {
          maxDurationSeconds: 180,
          allowedAspectRatios: ["9:16", "1:1"],
        },
        affectedStagesOnFailure: ["F05", "F06"],
        suggestedRemediationAction: "Trim timeline duration to <= 180s or adjust frame canvas to 9:16 (1080x1920).",
        forbiddenShallowRepairs: ["speedup_video_beyond_normal"],
      },

      // G12: Shorts Content ID Policy Effective September 24, 2026
      {
        ruleId: "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE",
        gateId: "G12_SHORTS_ELIGIBILITY",
        sourceDocumentId: "src_yt_policy_updates",
        title: "Shorts > 60s Content ID Claim Revenue Rule",
        description: "Starting September 24, 2026, new Shorts longer than 60s and up to 180s with active Content ID claims may remain playable on YouTube; creator revenue share may be redirected to claimant.",
        severity: "WARNING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "UPLOAD_DATE",
        policyEffect: "REVENUE_IMPACT",
        effectiveFrom: "2026-09-24", // DATE AWARE! Active only on or after this date
        condition: {
          maxDurationSeconds: 180,
          contentIdClaimThresholdSeconds: 60,
        },
        affectedStagesOnFailure: ["F04", "F05"],
        suggestedRemediationAction: "Review claimed audio: claimant may receive monetization revenue.",
        forbiddenShallowRepairs: ["pitch_shift_audio"],
      },

      // G13: Channel-Level Repetition
      {
        ruleId: "YT.VARIATION.CHANNEL_FATIGUE",
        gateId: "G13_CHANNEL_REPETITION",
        sourceDocumentId: "src_yt_channel_monetization",
        title: "Channel-Level Creative Fatigue & Template Frequency",
        description: "Monitors topic overconcentration, identical hook families, and structural fatigue across rolling channel history.",
        severity: "REPAIRABLE",
        evaluationMethod: "HYBRID",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "MONETIZATION_ELIGIBILITY",
        effectiveFrom: "2024-01-01",
        condition: {
          maxCreativeSimilarity: 0.70,
        },
        affectedStagesOnFailure: ["F01", "F02", "F03"],
        suggestedRemediationAction: "Choose alternate story structure, divergent hook archetype, or unrepresented angle.",
        forbiddenShallowRepairs: ["swap-background-video-only", "font-change-only"],
      },

      // G14: Evidence Reconciliation
      {
        ruleId: "YT.EVIDENCE.PROOF_RECONCILIATION",
        gateId: "G14_EVIDENCE_RECONCILIATION",
        sourceDocumentId: "src_yt_terms_of_service",
        title: "Deterministic Proof & Receipt Reconciliation",
        description: "Ensures every gate finding has attached CAS/cryptographic evidence and labels AI inference vs physical measurements.",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        appliesBy: "PUBLICATION_DATE",
        policyEffect: "BLOCK_PUBLICATION",
        effectiveFrom: "2024-01-01",
        condition: { customConditionCode: "EVIDENCE_INTEGRITY_PASS" },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Regenerate missing evidence receipts and sign physical measurement records.",
        forbiddenShallowRepairs: ["mock_evidence_receipt"],
      },
    ];

    const snapshot = YouTubePolicySnapshotManager.createSnapshot({
      policyVersion: this.latestVersion,
      retrievedAt: "2026-09-15T00:00:00Z",
      effectiveAt: "2026-09-15T00:00:00Z",
      expiresAt: "2026-10-15T00:00:00Z",
      policyState: "CURRENT",
      sourceDocuments: sources,
      rules: canonicalRules,
    });

    this.snapshots.set(snapshot.policyVersion, snapshot);
  }

  /**
   * Registers or updates a snapshot in the store after candidate validation.
   */
  public registerSnapshot(snapshot: PolicySnapshot): void {
    const validation = PolicyActivationPipeline.validateCandidateRules(snapshot.rules);
    if (!validation.valid) {
      throw new Error(`Cannot register invalid policy snapshot: ${validation.errors.join("; ")}`);
    }
    this.snapshots.set(snapshot.policyVersion, snapshot);
    if (snapshot.policyVersion > this.latestVersion) {
      this.latestVersion = snapshot.policyVersion;
    }
  }

  /**
   * Retrieves snapshot by exact version string.
   */
  public getSnapshot(version: string): PolicySnapshot | undefined {
    return this.snapshots.get(version);
  }

  /**
   * Retrieves the active snapshot for a specified publication intent date.
   */
  public getSnapshotForPublication(publicationIntentAt?: string): PolicySnapshot {
    return this.resolveSnapshotForPublication(publicationIntentAt);
  }

  /**
   * Resolves snapshot based on effectiveAt, expiresAt, and retrievedAt.
   * Truly date-aware: selects the active snapshot governing publicationIntentAt.
   */
  public resolveSnapshotForPublication(publicationIntentAt?: string): PolicySnapshot {
    const pubTime = publicationIntentAt ? new Date(publicationIntentAt).getTime() : Date.now();

    // Find all registered snapshots whose effective interval covers pubTime
    const eligibleSnapshots: PolicySnapshot[] = [];

    for (const snapshot of this.snapshots.values()) {
      const effectiveTime = new Date(snapshot.effectiveAt).getTime();
      const expiresTime = snapshot.expiresAt ? new Date(snapshot.expiresAt).getTime() : Infinity;

      if (pubTime >= effectiveTime && pubTime < expiresTime) {
        eligibleSnapshots.push(snapshot);
      }
    }

    let selected: PolicySnapshot;
    if (eligibleSnapshots.length > 0) {
      // Pick most recently effective snapshot covering pubTime
      eligibleSnapshots.sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());
      selected = eligibleSnapshots[0];
    } else {
      const latest = this.snapshots.get(this.latestVersion);
      if (!latest) {
        throw new Error(`[PolicyStore] No policy snapshot registered for publication intent date: ${publicationIntentAt || "now"}`);
      }
      selected = latest;
    }

    // Verify freshness SLA
    const freshness = PolicyActivationPipeline.evaluateFreshness(selected, publicationIntentAt);
    if (freshness.state === "INVALID" || freshness.state === "UNAVAILABLE") {
      throw new Error(`Policy snapshot ${selected.policyVersion} is unusable: ${freshness.explanation}`);
    }

    return selected;
  }

  /**
   * Returns active rules from a snapshot for a given publication date (effective-date aware).
   */
  public getActiveRules(snapshot: PolicySnapshot, publicationDateIso: string): readonly PolicyRuleDefinition[] {
    const pubDate = new Date(publicationDateIso).getTime();
    return snapshot.rules.filter((rule) => {
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

  /**
   * Returns active rules evaluated against specific policy clocks in PolicyEvaluationContext.
   */
  public getActiveRulesForContext(
    snapshot: PolicySnapshot,
    context: PolicyEvaluationContext
  ): readonly PolicyRuleDefinition[] {
    return snapshot.rules.filter((rule) => {
      const clockTimeStr = PolicyEvaluationContextBuilder.resolveTimestampForRule(rule.appliesBy, context);
      const clockTime = new Date(clockTimeStr).getTime();
      const from = new Date(rule.effectiveFrom).getTime();
      if (clockTime < from) {
        return false;
      }
      if (rule.effectiveTo) {
        const to = new Date(rule.effectiveTo).getTime();
        if (clockTime >= to) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Lists all registered snapshot versions.
   */
  public listVersions(): readonly string[] {
    return Array.from(this.snapshots.keys());
  }
}
