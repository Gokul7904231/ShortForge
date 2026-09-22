/**
 * FactoryOS YouTube Monetization Guardian — YouTube Policy Guardian
 * Executes sequential policy gates G00 to G14 against date-aware policy rules.
 * Invariant: Missing policy rule is an integrity failure that FAILS CLOSED (never fabricates fallbacks).
 */

import { G00_PolicyFreshnessGate, G01_ChannelReadinessGate, G02_CommunityGuidelinesGate } from "./gates/G00_G02_Gates";
import { G03_InauthenticContentGate, G04_ReusedContentGate, G05_CommercialRightsGate } from "./gates/G03_G05_Gates";
import { G06_AdvertiserSuitabilityGate, G07_AIDisclosureGate, G08_SpamDeceptionGate } from "./gates/G06_G08_Gates";
import { G09_FakeEngagementGate, G10_MetadataPackagingGate, G11_KidsFamilyGate } from "./gates/G09_G11_Gates";
import { G12_ShortsEligibilityGate, G13_ChannelRepetitionGate, G14_EvidenceReconciliationGate } from "./gates/G12_G14_Gates";
import { MonetizationReadinessEvaluator } from "./MonetizationReadinessEvaluator";
import { CandidateVideoContext, ChannelContext, GateEvaluationFinding, PolicyEvaluationResult, YouTubePolicyEvaluator } from "./policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition, PolicyGateId } from "./policy/YouTubePolicyIR";
import { PolicySnapshot } from "./policy/YouTubePolicySnapshot";
import { YouTubePolicyStore } from "./policy/YouTubePolicyStore";
import { PolicyEvaluationContextBuilder } from "./policy/PolicyEvaluationContext";

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
    uploadIntentAt?: string;
    contentCreatedAt?: string;
  }): PolicyEvaluationResult {
    const evaluationAt = new Date().toISOString();
    const publicationIntentAt = params.publicationIntentAt || evaluationAt;
    const uploadIntentAt = params.uploadIntentAt || publicationIntentAt;
    const contentCreatedAt = params.contentCreatedAt || evaluationAt;

    const evalContext = PolicyEvaluationContextBuilder.build({
      contentCreatedAt,
      uploadIntentAt,
      publicationIntentAt,
      channelObservationAt: evaluationAt,
      yppEligibilityEvaluationAt: evaluationAt,
      policyEvaluationAt: evaluationAt,
    });

    // Resolve snapshot for publication-intent date
    const snapshot = params.snapshot || this.policyStore.getSnapshotForPublication(publicationIntentAt);

    // Filter active rules for context clocks
    const activeRules = this.policyStore.getActiveRulesForContext(snapshot, evalContext);
    const ruleMap = new Map<string, PolicyRuleDefinition>(activeRules.map((r) => [r.ruleId, r]));

    const findings: GateEvaluationFinding[] = [];

    // Authoritative rule fetcher: FAILS CLOSED if rule missing from active policy snapshot
    const getRequiredRule = (ruleId: string, gateId: PolicyGateId): PolicyRuleDefinition | null => {
      const found = ruleMap.get(ruleId);
      if (!found) {
        findings.push({
          gateId,
          ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: { error: "MISSING_REQUIRED_POLICY_RULE", ruleId, snapshotVersion: snapshot.policyVersion },
          explanation: `Critical policy integrity violation: rule '${ruleId}' missing from active snapshot '${snapshot.policyVersion}'`,
          evidence: [`Policy integrity failure: snapshot missing rule ${ruleId}`],
          evidenceRefs: [],
          affectedStages: ["F07"],
          suggestedRemediation: "Activate complete policy snapshot containing required rules.",
          forbiddenShallowRepairs: ["synthesize_fallback_rule"],
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        });
        return null;
      }
      return found;
    };

    // G00: Policy Freshness
    const g00Rule = getRequiredRule("YT.POLICY.FRESHNESS", "G00_POLICY_FRESHNESS");
    if (g00Rule) {
      findings.push(G00_PolicyFreshnessGate.evaluate(snapshot, g00Rule, publicationIntentAt));
    }

    // G01: Channel Readiness
    const g01Rule = getRequiredRule("YT.CHANNEL.YPP_PREREQUISITES", "G01_CHANNEL_READINESS");
    if (g01Rule) {
      findings.push(G01_ChannelReadinessGate.evaluate(params.channel, g01Rule, evalContext.yppEligibilityEvaluationAt));
    }

    // G02: Community Guidelines
    const g02Rule = getRequiredRule("YT.COMMUNITY.BASELINE_SAFETY", "G02_COMMUNITY_GUIDELINES");
    if (g02Rule) {
      findings.push(G02_CommunityGuidelinesGate.evaluate(params.video, params.channel, g02Rule));
    }

    // G03: Inauthentic Content
    const g03Rule = getRequiredRule("YT.INAUTHENTIC.MASS_PRODUCED", "G03_INAUTHENTIC_CONTENT");
    if (g03Rule) {
      findings.push(G03_InauthenticContentGate.evaluate(params.video, params.channel, g03Rule));
    }

    // G04: Reused Content
    const g04Rule = getRequiredRule("YT.REUSED.TRANSFORMATIVE_VALUE", "G04_REUSED_CONTENT");
    if (g04Rule) {
      findings.push(G04_ReusedContentGate.evaluate(params.video, g04Rule));
    }

    // G05: Commercial Rights
    const g05Rule = getRequiredRule("YT.RIGHTS.COMMERCIAL_PROVENANCE", "G05_COMMERCIAL_RIGHTS");
    if (g05Rule) {
      findings.push(G05_CommercialRightsGate.evaluate(params.video, g05Rule, publicationIntentAt));
    }

    // G06: Advertiser Suitability
    const g06Rule = getRequiredRule("YT.ADS.SUITABILITY_STANDARD", "G06_ADVERTISER_SUITABILITY");
    if (g06Rule) {
      findings.push(G06_AdvertiserSuitabilityGate.evaluate(params.video, g06Rule));
    }

    // G07: AI Disclosure
    const g07Rule = getRequiredRule("YT.AI.SYNTHETIC_DISCLOSURE", "G07_AI_DISCLOSURE");
    if (g07Rule) {
      findings.push(G07_AIDisclosureGate.evaluate(params.video, g07Rule));
    }

    // G08: Spam & Deception
    const g08Rule = getRequiredRule("YT.SPAM.DECEPTIVE_PRACTICES", "G08_SPAM_DECEPTION");
    if (g08Rule) {
      findings.push(G08_SpamDeceptionGate.evaluate(params.video, g08Rule));
    }

    // G09: Fake Engagement / Automation Check
    const g09Rule = getRequiredRule("YT.ENGAGEMENT.NO_MANIPULATION", "G09_ENGAGEMENT_AUTOMATION");
    if (g09Rule) {
      findings.push(G09_FakeEngagementGate.evaluate(params.video, g09Rule));
    }

    // G10: Metadata & Packaging
    const g10Rule = getRequiredRule("YT.METADATA.PACKAGING_INTEGRITY", "G10_METADATA_PACKAGING");
    if (g10Rule) {
      findings.push(G10_MetadataPackagingGate.evaluate(params.video, g10Rule));
    }

    // G11: Kids & Family
    const g11Rule = getRequiredRule("YT.KIDS.QUALITY_STANDARDS", "G11_KIDS_FAMILY");
    if (g11Rule) {
      findings.push(G11_KidsFamilyGate.evaluate(params.video, g11Rule));
    }

    // G12: Shorts Eligibility (Geometry & Duration up to 180s)
    const g12Rule = getRequiredRule("YT.SHORTS.DURATION_AND_GEOMETRY", "G12_SHORTS_ELIGIBILITY");
    if (g12Rule) {
      findings.push(G12_ShortsEligibilityGate.evaluate(params.video, g12Rule, uploadIntentAt));
    }

    // G12: Shorts Content ID Rule (evaluated against uploadIntentAt clock)
    const g12ContentIdRule = ruleMap.get("YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE");
    if (g12ContentIdRule) {
      findings.push(G12_ShortsEligibilityGate.evaluate(params.video, g12ContentIdRule, uploadIntentAt));
    }

    // G13: Channel Creative Repetition
    const g13Rule = getRequiredRule("YT.VARIATION.CHANNEL_FATIGUE", "G13_CHANNEL_REPETITION");
    if (g13Rule) {
      findings.push(G13_ChannelRepetitionGate.evaluate(params.video, params.channel, g13Rule));
    }

    // G14: Evidence Reconciliation (evaluates all prior findings)
    const g14Rule = getRequiredRule("YT.EVIDENCE.PROOF_RECONCILIATION", "G14_EVIDENCE_RECONCILIATION");
    if (g14Rule) {
      findings.push(G14_EvidenceReconciliationGate.evaluate(params.video, findings, g14Rule));
    }

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
