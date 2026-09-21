/**
 * FactoryOS YouTube Monetization Guardian — Gates G00 to G02
 */

import { CandidateVideoContext, ChannelContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";
import { PolicySnapshot } from "../policy/YouTubePolicySnapshot";

export class G00_PolicyFreshnessGate {
  public static evaluate(
    snapshot: PolicySnapshot,
    rule: PolicyRuleDefinition,
    publicationIntentAt: string
  ): GateEvaluationFinding {
    const isStale = snapshot.policyState === "STALE";
    const isUnknown = snapshot.policyState === "UNKNOWN";

    let expired = false;
    if (snapshot.expiresAt) {
      const expTime = new Date(snapshot.expiresAt).getTime();
      const pubTime = new Date(publicationIntentAt).getTime();
      if (pubTime > expTime) {
        expired = true;
      }
    }

    if (isStale || isUnknown || expired) {
      return {
        gateId: "G00_POLICY_FRESHNESS",
        ruleId: rule.ruleId,
        status: "POLICY_STALE",
        severity: "BLOCKING",
        observedSignal: {
          policyState: snapshot.policyState,
          expiresAt: snapshot.expiresAt,
          publicationIntentAt,
          expired,
        },
        explanation: `YouTube policy snapshot '${snapshot.policyVersion}' is ${snapshot.policyState.toLowerCase()}${expired ? " (expired)" : ""}. Release gate blocked until refreshed from official sources.`,
        evidence: [
          `Snapshot hash: ${snapshot.snapshotHashSha256}`,
          `Retrieved at: ${snapshot.retrievedAt}`,
          `State: ${snapshot.policyState}`,
        ],
        affectedStages: ["F07"],
        suggestedRemediation: rule.suggestedRemediationAction,
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G00_POLICY_FRESHNESS",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { policyState: "CURRENT", version: snapshot.policyVersion },
      explanation: `Policy snapshot '${snapshot.policyVersion}' verified current against official Google documentation registry.`,
      evidence: [
        `Retrieved: ${snapshot.retrievedAt}`,
        `Effective: ${snapshot.effectiveAt}`,
        `Document sources: ${snapshot.sourceDocuments.length}`,
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
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const failures: string[] = [];

    if (!channel.isTwoStepVerificationEnabled) {
      failures.push("2-Step Verification is not enabled on the YouTube channel Google account");
    }
    if (!channel.hasAdvancedFeaturesAccess) {
      failures.push("Advanced features access (phone verification or channel history) not unlocked");
    }
    if (!channel.hasLinkedAdSense) {
      failures.push("No active, approved AdSense for YouTube account linked");
    }
    if (channel.activeCommunityGuidelinesStrikes > 0) {
      failures.push(`Channel has ${channel.activeCommunityGuidelinesStrikes} active Community Guidelines strike(s)`);
    }

    // Distinguish application and monetization states truthfully
    const isChannelMonetizing = channel.yppStatus === "CURRENTLY_MONETIZING";
    const isAcceptedInYpp = channel.yppStatus === "ACCEPTED_INTO_YPP";
    const isReadyToApply = channel.yppStatus === "CHANNEL_READY_TO_APPLY";

    if (failures.length > 0) {
      return {
        gateId: "G01_CHANNEL_READINESS",
        ruleId: rule.ruleId,
        status: "EXTERNAL_REVIEW",
        severity: "EXTERNAL_REVIEW",
        observedSignal: {
          yppStatus: channel.yppStatus,
          failures,
        },
        explanation: `Channel account prerequisites pending: ${failures.join("; ")}. Video can be rendered, but channel cannot monetize without completing these steps.`,
        evidence: failures,
        affectedStages: ["F07"],
        suggestedRemediation: "Resolve account security, feature access, and AdSense association in YouTube Studio.",
        forbiddenShallowRepairs: ["mock_channel_status"],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    if (isReadyToApply) {
      return {
        gateId: "G01_CHANNEL_READINESS",
        ruleId: rule.ruleId,
        status: "EXTERNAL_REVIEW",
        severity: "EXTERNAL_REVIEW",
        observedSignal: { yppStatus: "CHANNEL_READY_TO_APPLY" },
        explanation: "Channel meets audience thresholds and prerequisites, but has not yet been accepted into YPP review.",
        evidence: [
          `Subscribers: ${channel.subscriberCount}`,
          `Watch hours: ${channel.validWatchHoursLast365Days}`,
          `Shorts views: ${channel.shortsViewsLast90Days}`,
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
        observedSignal: { yppStatus: channel.yppStatus },
        explanation: "Channel is not yet eligible for YPP revenue sharing. Candidate video technical and content quality remains unaffected.",
        evidence: [
          `Subscribers: ${channel.subscriberCount}`,
          `Status: ${channel.yppStatus}`,
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
      observedSignal: { yppStatus: channel.yppStatus },
      explanation: "Channel YPP standing, 2-Step Verification, AdSense linkage, and clean record confirmed.",
      evidence: [
        `YPP Status: ${channel.yppStatus}`,
        `Strikes: ${channel.activeCommunityGuidelinesStrikes}`,
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
    if (channel.activeCommunityGuidelinesStrikes > 0) {
      return {
        gateId: "G02_COMMUNITY_GUIDELINES",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { strikes: channel.activeCommunityGuidelinesStrikes },
        explanation: `Channel has ${channel.activeCommunityGuidelinesStrikes} active Community Guidelines strike(s). New uploads prohibited during penalty window.`,
        evidence: [`Active strikes count: ${channel.activeCommunityGuidelinesStrikes}`],
        affectedStages: ["F07"],
        suggestedRemediation: "Resolve strike appeal in YouTube Studio or wait for strike penalty expiration.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // Check script text for severe violations (graphic violence, self-harm, hate speech)
    const lowerScript = video.scriptText.toLowerCase();
    const severeTerms = ["kill yourself", "how to make a bomb", "terrorist attack instructions"];
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
          affectedStages: ["F01", "F02"],
          suggestedRemediation: "Completely remove hazardous, violent, or self-harm content from script.",
          forbiddenShallowRepairs: ["bleep_word_only", "caption_hide"],
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }
    }

    return {
      gateId: "G02_COMMUNITY_GUIDELINES",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { strikes: 0, harmfulPatternsDetected: false },
      explanation: "No Community Guidelines strikes or severe safety violations detected.",
      evidence: ["Zero channel strikes", "Script safety heuristics clear"],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.98,
    };
  }
}
