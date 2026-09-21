/**
 * FactoryOS YouTube Monetization Guardian — Policy Store
 * Holds versioned policy snapshots and provides resolution by version and publication date.
 */

import { PolicySourceRegistry } from "./PolicySourceRegistry";
import { PolicyRuleDefinition } from "./YouTubePolicyIR";
import { PolicySnapshot, YouTubePolicySnapshotManager, PolicyFreshnessState } from "./YouTubePolicySnapshot";

export class YouTubePolicyStore {
  private static instance: YouTubePolicyStore | null = null;
  private snapshots: Map<string, PolicySnapshot> = new Map();
  private latestVersion: string = "2026.09.15";

  public constructor() {
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
        effectiveFrom: "2024-01-01",
        condition: { customConditionCode: "SNAPSHOT_STATE_CURRENT" },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Refresh policy snapshot from official source registry.",
        forbiddenShallowRepairs: ["override_stale_flag"],
      },

      // G01: Channel Readiness
      {
        ruleId: "YT.CHANNEL.YPP_PREREQUISITES",
        gateId: "G01_CHANNEL_READINESS",
        sourceDocumentId: "src_yt_ypp_eligibility",
        title: "YPP Essential Account & Verification Prerequisites",
        description: "Requires 2-Step Verification, advanced features enabled, AdSense account linked, and good standing.",
        severity: "EXTERNAL_REVIEW",
        evaluationMethod: "DETERMINISTIC",
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

      // G02: Community Guidelines
      {
        ruleId: "YT.COMMUNITY.BASELINE_SAFETY",
        gateId: "G02_COMMUNITY_GUIDELINES",
        sourceDocumentId: "src_yt_community_guidelines",
        title: "Community Guidelines Compliance",
        description: "Zero tolerance for hate speech, harassment, severe violence, sexually explicit content, or dangerous acts.",
        severity: "BLOCKING",
        evaluationMethod: "HYBRID",
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
        description: "Content reusing existing material must provide significant original commentary, analysis, or narrative value.",
        severity: "REPAIRABLE",
        evaluationMethod: "HYBRID",
        effectiveFrom: "2024-06-01",
        condition: {
          requireTransformativeValue: true,
        },
        affectedStagesOnFailure: ["F01", "F02"],
        suggestedRemediationAction: "Add original editorial commentary, synthesis, and unique narrative voice.",
        forbiddenShallowRepairs: ["pitch-shift-only", "border-overlay-only", "speed-change-only"],
      },

      // G05: Commercial Rights & Copyright
      {
        ruleId: "YT.RIGHTS.COMMERCIAL_CLEARANCE",
        gateId: "G05_COMMERCIAL_RIGHTS",
        sourceDocumentId: "src_yt_copyright_commercial",
        title: "Commercial Use Clearance & Asset Provenance",
        description: "All non-original visual and audio assets must possess verifiable commercial license evidence.",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        effectiveFrom: "2024-01-01",
        condition: {
          requiresCommercialLicense: true,
        },
        affectedStagesOnFailure: ["F03", "F04"],
        suggestedRemediationAction: "Replace un-cleared assets with verified commercial stock or original syntheses.",
        forbiddenShallowRepairs: ["omit_license_field"],
      },

      // G06: Advertiser Suitability
      {
        ruleId: "YT.ADVERTISER.CONTEXTUAL_SUITABILITY",
        gateId: "G06_ADVERTISER_SUITABILITY",
        sourceDocumentId: "src_yt_advertiser_friendly",
        title: "Advertiser-Friendly Content Suitability",
        description: "Evaluates video, audio, title, thumbnail, description, and tags for brand safety and contextual framing.",
        severity: "REPAIRABLE",
        evaluationMethod: "CONTEXTUAL_AI",
        effectiveFrom: "2026-09-01",
        condition: { customConditionCode: "AD_SAFE_CONTEXTUAL" },
        affectedStagesOnFailure: ["F02", "F03", "F05"],
        suggestedRemediationAction: "Reframe sensitive topic with objective, educational tone or replace graphic visual assets.",
        forbiddenShallowRepairs: ["mute-audio-only"],
      },

      // G07: AI Disclosure
      {
        ruleId: "YT.AI.DISCLOSURE_REQUIREMENT",
        gateId: "G07_AI_DISCLOSURE",
        sourceDocumentId: "src_yt_ai_disclosure",
        title: "Realistic Altered or Synthetic Media Disclosure",
        description: "Determines whether realistic synthetic media is present. Triggers upload disclosure instructions.",
        severity: "WARNING",
        evaluationMethod: "DETERMINISTIC",
        effectiveFrom: "2024-03-18",
        condition: {
          requiresAiDisclosureIfRealistic: true,
        },
        affectedStagesOnFailure: ["F07"],
        suggestedRemediationAction: "Flag upload metadata with altered_synthetic_content=true.",
        forbiddenShallowRepairs: [],
      },

      // G08: Spam and Deceptive Practices
      {
        ruleId: "YT.SPAM.DECEPTIVE_CLAIMS",
        gateId: "G08_SPAM_DECEPTION",
        sourceDocumentId: "src_yt_spam_deception",
        title: "Spam, Scams, and Deceptive Metadata",
        description: "Blocks misleading titles, false thumbnail promises, deceptive medical/financial claims, or keyword stuffing.",
        severity: "BLOCKING",
        evaluationMethod: "HYBRID",
        effectiveFrom: "2024-01-01",
        condition: {
          forbidDeceptiveClaims: true,
        },
        affectedStagesOnFailure: ["F01", "F02", "F07"],
        suggestedRemediationAction: "Align title and thumbnail strictly with verified script evidence and topic reality.",
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
        description: "Ensures title, description, tags, and hashtags accurately reflect video content without misleading tags.",
        severity: "REPAIRABLE",
        evaluationMethod: "DETERMINISTIC",
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
        description: "Shorts longer than 1 minute with active Content ID claims are blocked from creator revenue share per September 24, 2026 update.",
        severity: "BLOCKING",
        evaluationMethod: "DETERMINISTIC",
        effectiveFrom: "2026-09-24", // DATE AWARE! Active only on or after this date
        condition: {
          contentIdClaimThresholdSeconds: 60,
        },
        affectedStagesOnFailure: ["F04", "F05"],
        suggestedRemediationAction: "Replace claimed audio or trim duration under 60s to prevent Content ID claim block.",
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
   * Registers or updates a snapshot in the store.
   */
  public registerSnapshot(snapshot: PolicySnapshot): void {
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
   * If publication date is in the future, resolves applicable snapshot and active rules.
   */
  public getSnapshotForPublication(publicationIntentAt?: string): PolicySnapshot {
    const targetDate = publicationIntentAt ? new Date(publicationIntentAt) : new Date();
    const latest = this.snapshots.get(this.latestVersion);
    if (!latest) {
      throw new Error(`No policy snapshot registered for latest version ${this.latestVersion}`);
    }
    return latest;
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
   * Lists all registered snapshot versions.
   */
  public listVersions(): readonly string[] {
    return Array.from(this.snapshots.keys());
  }
}
