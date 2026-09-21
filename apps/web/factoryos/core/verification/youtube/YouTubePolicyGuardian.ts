/**
 * FactoryOS YouTube Monetization Guardian — YouTube Policy Guardian
 * Executes sequential policy gates G00 to G14 against date-aware policy rules.
 */

import { G00_PolicyFreshnessGate, G01_ChannelReadinessGate, G02_CommunityGuidelinesGate } from "./gates/G00_G02_Gates";
import { G03_InauthenticContentGate, G04_ReusedContentGate, G05_CommercialRightsGate } from "./gates/G03_G05_Gates";
import { G06_AdvertiserSuitabilityGate, G07_AIDisclosureGate, G08_SpamDeceptionGate } from "./gates/G06_G08_Gates";
import { G09_FakeEngagementGate, G10_MetadataPackagingGate, G11_KidsFamilyGate } from "./gates/G09_G11_Gates";
import { G12_ShortsEligibilityGate, G13_ChannelRepetitionGate, G14_EvidenceReconciliationGate } from "./gates/G12_G14_Gates";
import { MonetizationReadinessEvaluator } from "./MonetizationReadinessEvaluator";
import { CandidateVideoContext, ChannelContext, GateEvaluationFinding, PolicyEvaluationResult, YouTubePolicyEvaluator } from "./policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "./policy/YouTubePolicyIR";
import { PolicySnapshot } from "./policy/YouTubePolicySnapshot";
import { YouTubePolicyStore } from "./policy/YouTubePolicyStore";

export class YouTubePolicyGuardian {
  private policyStore: YouTubePolicyStore;

  public constructor(store?: YouTubePolicyStore) {
    this.policyStore = store || YouTubePolicyStore.getInstance();
  }

  /**
   * Executes G00 through G14 sequentially against the candidate video context and channel context.
   */
  public evaluate(params: {
    video: CandidateVideoContext;
    channel: ChannelContext;
    snapshot?: PolicySnapshot;
    publicationIntentAt?: string;
    contentCreatedAt?: string;
  }): PolicyEvaluationResult {
    const evaluationAt = new Date().toISOString();
    const publicationIntentAt = params.publicationIntentAt || evaluationAt;
    const contentCreatedAt = params.contentCreatedAt || evaluationAt;

    // Resolve snapshot for publication-intent date
    const snapshot = params.snapshot || this.policyStore.getSnapshotForPublication(publicationIntentAt);

    // Filter active rules for publication-intent date
    const activeRules = YouTubePolicyEvaluator.filterActiveRules(snapshot.rules, publicationIntentAt);
    const ruleMap = new Map<string, PolicyRuleDefinition>(activeRules.map((r) => [r.ruleId, r]));

    const findings: GateEvaluationFinding[] = [];

    // Helper to fetch rule or create fallback definition if needed
    const getRule = (ruleId: string, fallbackGate: any): PolicyRuleDefinition => {
      return (
        ruleMap.get(ruleId) || {
          ruleId,
          gateId: fallbackGate,
          sourceDocumentId: "src_yt_channel_monetization",
          title: ruleId,
          description: "Active policy check",
          severity: "BLOCKING",
          evaluationMethod: "DETERMINISTIC",
          effectiveFrom: "2024-01-01",
          condition: {},
          affectedStagesOnFailure: ["F07"],
          suggestedRemediationAction: "Resolve finding",
          forbiddenShallowRepairs: [],
        }
      );
    };

    // G00: Policy Freshness
    const g00Rule = getRule("YT.POLICY.FRESHNESS", "G00_POLICY_FRESHNESS");
    const g00Finding = G00_PolicyFreshnessGate.evaluate(snapshot, g00Rule, publicationIntentAt);
    findings.push(g00Finding);

    // If G00 failed with stale policy, we fail closed early or continue to collect complete diagnostic report
    // In our architecture, we continue running gates to produce a full traceable diagnostic ledger.

    // G01: Channel Readiness
    const g01Rule = getRule("YT.CHANNEL.YPP_PREREQUISITES", "G01_CHANNEL_READINESS");
    findings.push(G01_ChannelReadinessGate.evaluate(params.channel, g01Rule));

    // G02: Community Guidelines
    const g02Rule = getRule("YT.COMMUNITY.BASELINE_SAFETY", "G02_COMMUNITY_GUIDELINES");
    findings.push(G02_CommunityGuidelinesGate.evaluate(params.video, params.channel, g02Rule));

    // G03: Inauthentic Content
    const g03Rule = getRule("YT.INAUTHENTIC.MASS_PRODUCED", "G03_INAUTHENTIC_CONTENT");
    findings.push(G03_InauthenticContentGate.evaluate(params.video, params.channel, g03Rule));

    // G04: Reused Content
    const g04Rule = getRule("YT.REUSED.TRANSFORMATIVE_VALUE", "G04_REUSED_CONTENT");
    findings.push(G04_ReusedContentGate.evaluate(params.video, g04Rule));

    // G05: Commercial Rights
    const g05Rule = getRule("YT.RIGHTS.COMMERCIAL_CLEARANCE", "G05_COMMERCIAL_RIGHTS");
    findings.push(G05_CommercialRightsGate.evaluate(params.video, g05Rule));

    // G06: Advertiser Suitability
    const g06Rule = getRule("YT.ADVERTISER.CONTEXTUAL_SUITABILITY", "G06_ADVERTISER_SUITABILITY");
    findings.push(G06_AdvertiserSuitabilityGate.evaluate(params.video, g06Rule));

    // G07: AI Disclosure
    const g07Rule = getRule("YT.AI.DISCLOSURE_REQUIREMENT", "G07_AI_DISCLOSURE");
    findings.push(G07_AIDisclosureGate.evaluate(params.video, g07Rule));

    // G08: Spam & Deception
    const g08Rule = getRule("YT.SPAM.DECEPTIVE_CLAIMS", "G08_SPAM_DECEPTION");
    findings.push(G08_SpamDeceptionGate.evaluate(params.video, g08Rule));

    // G09: Fake Engagement / Automation Check
    const g09Rule = getRule("YT.ENGAGEMENT.NO_MANIPULATION", "G09_ENGAGEMENT_AUTOMATION");
    findings.push(G09_FakeEngagementGate.evaluate(params.video, g09Rule));

    // G10: Metadata & Packaging
    const g10Rule = getRule("YT.METADATA.PACKAGING_INTEGRITY", "G10_METADATA_PACKAGING");
    findings.push(G10_MetadataPackagingGate.evaluate(params.video, g10Rule));

    // G11: Kids & Family
    const g11Rule = getRule("YT.KIDS.QUALITY_STANDARDS", "G11_KIDS_FAMILY");
    findings.push(G11_KidsFamilyGate.evaluate(params.video, g11Rule));

    // G12: Shorts Eligibility (Geometry & Duration up to 180s)
    const g12Rule = getRule("YT.SHORTS.DURATION_AND_GEOMETRY", "G12_SHORTS_ELIGIBILITY");
    findings.push(G12_ShortsEligibilityGate.evaluate(params.video, g12Rule, publicationIntentAt));

    // G12: Shorts Content ID Rule (if active for publication date)
    const g12ContentIdRule = ruleMap.get("YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE");
    if (g12ContentIdRule) {
      findings.push(G12_ShortsEligibilityGate.evaluate(params.video, g12ContentIdRule, publicationIntentAt));
    }

    // G13: Channel Creative Repetition
    const g13Rule = getRule("YT.VARIATION.CHANNEL_FATIGUE", "G13_CHANNEL_REPETITION");
    findings.push(G13_ChannelRepetitionGate.evaluate(params.video, params.channel, g13Rule));

    // G14: Evidence Reconciliation
    const g14Rule = getRule("YT.EVIDENCE.PROOF_RECONCILIATION", "G14_EVIDENCE_RECONCILIATION");
    findings.push(G14_EvidenceReconciliationGate.evaluate(params.video, findings, g14Rule));

    const evaluationId = `eval_${params.video.videoId}_${Date.now()}`;

    return MonetizationReadinessEvaluator.summarize({
      evaluationId,
      snapshot,
      findings,
      contentCreatedAt,
      evaluationAt,
      publicationIntentAt,
      channelYppStatus: params.channel.yppStatus,
    });
  }
}
