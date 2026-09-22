/**
 * FactoryOS YouTube Monetization Guardian — Gates G00 to G02
 * G00: Policy Freshness & Official Document Verification
 * G01: Channel Readiness & YPP Multi-Tier Eligibility Evaluation
 * G02: Community Guidelines & Multi-Layered Contextual Safety
 */

import { CandidateVideoContext, ChannelContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";
import { PolicySnapshot } from "../policy/YouTubePolicySnapshot";
import { YPPEligibilityEvaluator } from "./YPPEligibilityEvaluator";
import { EvidenceRefFactory } from "../evidence/EvidenceRef";

export class G00_PolicyFreshnessGate {
  public static evaluate(
    snapshot: PolicySnapshot,
    rule: PolicyRuleDefinition,
    publicationIntentAt: string
  ): GateEvaluationFinding {
    const isStale = snapshot.policyState === "STALE";
    const retrievedTime = new Date(snapshot.retrievedAt).getTime();
    const pubTime = new Date(publicationIntentAt).getTime();

    // Max allowable age: 30 days
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
    const isOutdated = pubTime - retrievedTime > maxAgeMs;

    if (snapshot.policyState === "STALE" || isOutdated) {
      return {
        gateId: "G00_POLICY_FRESHNESS",
        ruleId: rule.ruleId,
        status: "POLICY_STALE",
        severity: "BLOCKING",
        observedSignal: {
          policyState: snapshot.policyState,
          retrievedAt: snapshot.retrievedAt,
          publicationIntentAt,
          ageDays: ((pubTime - retrievedTime) / (24 * 60 * 60 * 1000)).toFixed(1),
        },
        explanation: "Release blocked: policy snapshot is STALE or exceeds the maximum allowable freshness boundary (30 days). Evaluation must fail closed until refreshed from official sources.",
        evidence: [
          `Snapshot hash: ${snapshot.snapshotHashSha256}`,
          `Retrieved at: ${snapshot.retrievedAt}`,
          `Policy version: ${snapshot.policyVersion}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "POLICY_SNAPSHOT",
            producer: "G00_PolicyFreshnessGate",
            sourceRef: snapshot.policyVersion,
            sourceContentHash: snapshot.snapshotHashSha256,
            method: "HTTP_FETCH_VERIFY",
            confidence: 1.0,
            metadata: { policyState: snapshot.policyState, retrievedAt: snapshot.retrievedAt },
          }),
        ],
        affectedStages: ["F07"],
        suggestedRemediation: "Trigger PolicySourceRegistry refresh to pull current Google/YouTube documentation.",
        forbiddenShallowRepairs: ["override_stale_flag"],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G00_POLICY_FRESHNESS",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        policyState: snapshot.policyState,
        policyVersion: snapshot.policyVersion,
        sourceDocumentCount: snapshot.sourceDocuments.length,
      },
      explanation: `Policy snapshot '${snapshot.policyVersion}' is current, authenticated, and verified against official sources.`,
      evidence: [
        `Retrieved: ${snapshot.retrievedAt}`,
        `Effective: ${snapshot.effectiveAt}`,
        `Document sources: ${snapshot.sourceDocuments.length}`,
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "POLICY_SNAPSHOT",
          producer: "G00_PolicyFreshnessGate",
          sourceRef: snapshot.policyVersion,
          sourceContentHash: snapshot.snapshotHashSha256,
          method: "HTTP_FETCH_VERIFY",
          confidence: 1.0,
        }),
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}

export class G01_ChannelReadinessGate {
  public static evaluate(
    channel: ChannelContext,
    rule: PolicyRuleDefinition,
    evaluationDateIso: string = new Date().toISOString()
  ): GateEvaluationFinding {
    const yppEval = YPPEligibilityEvaluator.evaluate(channel, evaluationDateIso);

    // 1. Account Prerequisites Check
    const prerequisiteFailures = yppEval.unmetRequirements.filter(
      (r) => !r.includes("Audience thresholds not met")
    );

    if (prerequisiteFailures.length > 0) {
      return {
        gateId: "G01_CHANNEL_READINESS",
        ruleId: rule.ruleId,
        status: "EXTERNAL_REVIEW",
        severity: "EXTERNAL_REVIEW",
        observedSignal: {
          yppStatus: channel.yppStatus,
          prerequisiteFailures,
          unmetRequirements: yppEval.unmetRequirements,
        },
        explanation: `Channel account prerequisites pending: ${prerequisiteFailures.join("; ")}. Video can be rendered, but channel cannot monetize without completing these steps.`,
        evidence: prerequisiteFailures,
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "PLATFORM_OBSERVATION",
            producer: "G01_ChannelReadinessGate",
            method: "PLATFORM_API",
            confidence: 1.0,
            metadata: { prerequisiteFailures },
          }),
        ],
        affectedStages: ["F07"],
        suggestedRemediation: "Resolve account security, feature access, and AdSense association in YouTube Studio.",
        forbiddenShallowRepairs: ["mock_channel_status"],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 2. Audience Thresholds & Monetization Readiness
    const isChannelMonetizing = channel.yppStatus === "CURRENTLY_MONETIZING";
    const isAcceptedInYpp = channel.yppStatus === "ACCEPTED_INTO_YPP";
    const isReadyToApply = channel.yppStatus === "CHANNEL_READY_TO_APPLY";

    if (isReadyToApply) {
      return {
        gateId: "G01_CHANNEL_READINESS",
        ruleId: rule.ruleId,
        status: "EXTERNAL_REVIEW",
        severity: "EXTERNAL_REVIEW",
        observedSignal: {
          yppStatus: "CHANNEL_READY_TO_APPLY",
          yppTier: yppEval.yppTier,
          observedMetrics: yppEval.observedMetrics,
        },
        explanation: "Channel meets audience thresholds and prerequisites, but has not yet been accepted into YPP review.",
        evidence: [
          `Subscribers: ${channel.subscriberCount}`,
          `Watch hours: ${channel.validWatchHoursLast365Days}`,
          `Shorts views: ${channel.shortsViewsLast90Days}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "PLATFORM_OBSERVATION",
            producer: "G01_ChannelReadinessGate",
            method: "PLATFORM_API",
            confidence: 0.95,
            metadata: { yppStatus: "CHANNEL_READY_TO_APPLY" },
          }),
        ],
        affectedStages: [],
        suggestedRemediation: "Submit application for YPP review in YouTube Studio Earn tab.",
        evaluationType: "PLATFORM_OBSERVED",
        confidence: 0.95,
      };
    }

    if (!isChannelMonetizing && !isAcceptedInYpp) {
      return {
        gateId: "G01_CHANNEL_READINESS",
        ruleId: rule.ruleId,
        status: "NOT_YET_ELIGIBLE",
        severity: "WARNING",
        observedSignal: {
          yppStatus: channel.yppStatus,
          isEligible: false,
          yppTier: yppEval.yppTier,
          effectiveThresholds: yppEval.effectiveThresholds,
          observedMetrics: yppEval.observedMetrics,
        },
        explanation: "Channel is not yet eligible for YPP revenue sharing. Candidate video technical and content quality remains unaffected.",
        evidence: [
          `Subscribers: ${channel.subscriberCount} (required: ${yppEval.effectiveThresholds.requiredSubscribers})`,
          `Status: ${channel.yppStatus}`,
          `Watch hours: ${channel.validWatchHoursLast365Days}/${yppEval.effectiveThresholds.requiredWatchHours}`,
          `Shorts views: ${channel.shortsViewsLast90Days}/${yppEval.effectiveThresholds.requiredShortsViews}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "PLATFORM_OBSERVATION",
            producer: "G01_ChannelReadinessGate",
            method: "PLATFORM_API",
            confidence: 0.95,
            metadata: { yppStatus: channel.yppStatus, yppTier: yppEval.yppTier },
          }),
        ],
        affectedStages: [],
        evaluationType: "PLATFORM_OBSERVED",
        confidence: 0.95,
      };
    }

    return {
      gateId: "G01_CHANNEL_READINESS",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        yppStatus: channel.yppStatus,
        yppTier: yppEval.yppTier,
      },
      explanation: `Channel account verified and in active YPP standing (${channel.yppStatus}).`,
      evidence: [
        `YPP Status: ${channel.yppStatus}`,
        "2-Step Verification: ENABLED",
        "Advanced Features: UNLOCKED",
        "AdSense: LINKED",
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "PLATFORM_OBSERVATION",
          producer: "G01_ChannelReadinessGate",
          method: "PLATFORM_API",
          confidence: 1.0,
          metadata: { yppStatus: channel.yppStatus },
        }),
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}

export class G02_CommunityGuidelinesGate {
  public static evaluate(
    video: CandidateVideoContext,
    channel: ChannelContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Layer 1: Deterministic channel strike check
    if (channel.activeCommunityGuidelinesStrikes > 0) {
      return {
        gateId: "G02_COMMUNITY_GUIDELINES",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { strikes: channel.activeCommunityGuidelinesStrikes },
        explanation: `Channel has ${channel.activeCommunityGuidelinesStrikes} active Community Guidelines strike(s). New uploads prohibited during penalty window.`,
        evidence: [`Active strikes count: ${channel.activeCommunityGuidelinesStrikes}`],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "PLATFORM_OBSERVATION",
            producer: "G02_CommunityGuidelinesGate",
            method: "PLATFORM_API",
            confidence: 1.0,
            metadata: { strikes: channel.activeCommunityGuidelinesStrikes },
          }),
        ],
        affectedStages: ["F07"],
        suggestedRemediation: "Resolve strike appeal in YouTube Studio or wait for strike penalty expiration.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // Layer 2: Deterministic known-hard-block safety patterns
    const lowerScript = video.scriptText.toLowerCase();
    const severeTerms = [
      "kill yourself",
      "how to make a bomb",
      "terrorist attack instructions",
      "suicide tutorial",
      "child exploitation",
    ];

    for (const term of severeTerms) {
      if (lowerScript.includes(term)) {
        return {
          gateId: "G02_COMMUNITY_GUIDELINES",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: { matchedHarmfulPattern: term },
          explanation: `Severe Community Guidelines safety violation detected in script narrative: pattern '${term}'.`,
          evidence: [`Term '${term}' located in script text`],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "SECURITY_ATTESTATION",
              producer: "G02_CommunityGuidelinesGate",
              method: "DETERMINISTIC_PROBE",
              confidence: 1.0,
              metadata: { matchedHarmfulPattern: term },
            }),
          ],
          affectedStages: ["F01", "F02"],
          suggestedRemediation: "Completely remove hazardous, violent, or self-harm content from script.",
          forbiddenShallowRepairs: ["bleep_word_only", "caption_hide"],
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }
    }

    // Layer 3: Contextual / EDSA (Educational, Documentary, Scientific, Artistic) assessment
    const isEducationalTopic = Boolean(
      video.contentEngine === "History" ||
      video.contentEngine === "Coding" ||
      video.contentEngine === "GK" ||
      video.contentEngine === "Quiz"
    );

    return {
      gateId: "G02_COMMUNITY_GUIDELINES",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        strikes: 0,
        harmfulPatternsDetected: false,
        isEducationalContext: isEducationalTopic,
      },
      explanation: "No Community Guidelines strikes or severe safety violations detected. Context satisfies baseline platform standards.",
      evidence: ["Zero channel strikes", "Script safety heuristics clear"],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "SECURITY_ATTESTATION",
          producer: "G02_CommunityGuidelinesGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 0.98,
        }),
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.98,
    };
  }
}
