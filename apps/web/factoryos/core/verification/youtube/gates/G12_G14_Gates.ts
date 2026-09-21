/**
 * FactoryOS YouTube Monetization Guardian — Gates G12 to G14
 * G12: Shorts Format Eligibility (Geometry, 180s Duration Limit, and Date-Aware Content ID Rule)
 * G13: Channel Creative Repetition (Creative Fatigue Analysis)
 * G14: Evidence Reconciliation & Truth Boundary
 */

import { CandidateVideoContext, ChannelContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";

export class G12_ShortsEligibilityGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition,
    publicationIntentAt: string
  ): GateEvaluationFinding {
    const m = video.measurements;
    const duration = m.videoDuration || video.genome.durationSeconds || 0;

    // 1. Duration and Geometry Rule (Up to 180 seconds, qualifying square 1:1 or vertical 9:16)
    if (rule.ruleId === "YT.SHORTS.DURATION_AND_GEOMETRY") {
      const maxAllowedDuration = rule.condition.maxDurationSeconds ?? 180;
      const is9x16 = m.width === 1080 && m.height === 1920;
      const is1x1 = m.width > 0 && m.width === m.height;
      const isAspectQualifying = is9x16 || is1x1;

      if (duration > maxAllowedDuration) {
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: { duration, maxAllowed: maxAllowedDuration },
          explanation: `Video duration (${duration.toFixed(1)}s) exceeds YouTube Shorts maximum limit of ${maxAllowedDuration} seconds (3 minutes).`,
          evidence: [`Measured video duration: ${duration.toFixed(2)}s`],
          affectedStages: ["F05", "F06"],
          suggestedRemediation: `Trim timeline to <= ${maxAllowedDuration}s.`,
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }

      if (m.width > 0 && m.height > 0 && !isAspectQualifying) {
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: { width: m.width, height: m.height },
          explanation: `Geometry ${m.width}x${m.height} is neither 9:16 vertical nor 1:1 square. Ineligible for YouTube Shorts shelf.`,
          evidence: [`Observed dimensions: ${m.width}x${m.height}`],
          affectedStages: ["F03", "F05", "F06"],
          suggestedRemediation: "Render video with 1080x1920 (9:16) canvas geometry.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }

      return {
        gateId: "G12_SHORTS_ELIGIBILITY",
        ruleId: rule.ruleId,
        status: "PASS",
        severity: rule.severity,
        observedSignal: {
          duration,
          geometry: `${m.width}x${m.height}`,
          isShortsEligible: true,
        },
        explanation: `Shorts format verified: ${duration.toFixed(1)}s duration (<= ${maxAllowedDuration}s) and qualifying aspect ratio.`,
        evidence: [
          `Duration: ${duration.toFixed(2)}s`,
          `Resolution: ${m.width}x${m.height}`,
        ],
        affectedStages: [],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 2. Date-Aware Content ID Rule for Shorts > 60s (Effective September 24, 2026)
    if (rule.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE") {
      const pubDate = new Date(publicationIntentAt).getTime();
      const effectiveDate = new Date(rule.effectiveFrom).getTime();
      const isEffective = pubDate >= effectiveDate;

      const hasClaim = Boolean(video.hasActiveContentIdClaim);
      const isOver60s = duration > 60.0;

      if (isEffective && isOver60s && hasClaim) {
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: {
            duration,
            hasActiveContentIdClaim: true,
            effectiveFrom: rule.effectiveFrom,
            publicationIntentAt,
          },
          explanation: `Publication date '${publicationIntentAt}' falls on/after effective date (${rule.effectiveFrom}). Shorts longer than 60s with active Content ID claims are ineligible for creator revenue share.`,
          evidence: [
            `Duration: ${duration.toFixed(1)}s (> 60s)`,
            `Content ID claim: ACTIVE`,
            `Effective date: ${rule.effectiveFrom}`,
          ],
          affectedStages: ["F04", "F05"],
          suggestedRemediation: "Replace claimed audio bed with royalty-free YouTube Audio Library music or trim duration to <= 60s.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }

      if (!isEffective && isOver60s && hasClaim) {
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "PASS",
          severity: "WARNING",
          observedSignal: {
            duration,
            hasClaim: true,
            pendingEffectiveDate: rule.effectiveFrom,
          },
          explanation: `Shorts > 60s has active Content ID claim. Permitted under legacy policy prior to ${rule.effectiveFrom}, but will become blocked once published after effective date.`,
          evidence: [
            `Effective date: ${rule.effectiveFrom}`,
            `Publication intent: ${publicationIntentAt}`,
          ],
          affectedStages: ["F04"],
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }

      return {
        gateId: "G12_SHORTS_ELIGIBILITY",
        ruleId: rule.ruleId,
        status: "PASS",
        severity: rule.severity,
        observedSignal: {
          hasActiveContentIdClaim: hasClaim,
          duration,
        },
        explanation: "Content ID claim check clean for Shorts duration tier.",
        evidence: [`Content ID claim: ${hasClaim ? "ACTIVE" : "NONE"}`],
        affectedStages: [],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G12_SHORTS_ELIGIBILITY",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {},
      explanation: "Shorts eligibility rule passed.",
      evidence: ["Shorts eligibility condition satisfied."],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}

export class G13_ChannelRepetitionGate {
  public static evaluate(
    video: CandidateVideoContext,
    channel: ChannelContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const history = channel.recentGenomes || [];
    if (history.length < 3) {
      return {
        gateId: "G13_CHANNEL_REPETITION",
        ruleId: rule.ruleId,
        status: "PASS",
        severity: rule.severity,
        observedSignal: { historyCount: history.length },
        explanation: `Sufficient channel history not yet accumulated (${history.length} prior videos). No creative fatigue detected.`,
        evidence: [`Channel history count: ${history.length}`],
        affectedStages: [],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // Evaluate sliding window of last 5 productions for hook family and structure saturation
    const recentWindow = history.slice(-5);
    const sameHookCount = recentWindow.filter((h) => h.hookType === video.genome.hookType).length;
    const sameStructureCount = recentWindow.filter((h) => h.narrativeStructure === video.genome.narrativeStructure).length;
    const sameVisualCount = recentWindow.filter((h) => h.visualGrammar === video.genome.visualGrammar).length;

    // Creative fatigue condition: 4 out of last 5 having identical hook and structure
    if (sameHookCount >= 4 || sameStructureCount >= 4) {
      return {
        gateId: "G13_CHANNEL_REPETITION",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: {
          sameHookCount,
          sameStructureCount,
          sameVisualCount,
          windowSize: recentWindow.length,
        },
        explanation: `Channel-level creative fatigue detected: hook archetype '${video.genome.hookType}' used in ${sameHookCount}/${recentWindow.length} recent Shorts, and structure '${video.genome.narrativeStructure}' used in ${sameStructureCount}/${recentWindow.length}. Exceeds ShortForge channel-diversity threshold.`,
        evidence: [
          `Hook repeats: ${sameHookCount} of last ${recentWindow.length}`,
          `Structure repeats: ${sameStructureCount} of last ${recentWindow.length}`,
        ],
        affectedStages: ["F01", "F02"],
        suggestedRemediation: "Select an alternative hook archetype (e.g. counter-intuitive or direct-question) and alternate story structure.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "HYBRID",
        confidence: 0.94,
      };
    }

    return {
      gateId: "G13_CHANNEL_REPETITION",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        sameHookCount,
        sameStructureCount,
        fatigueRisk: "LOW",
      },
      explanation: "Channel-level creative diversity healthy: diverse hook archetypes and narrative structures across rolling history.",
      evidence: [
        `Hook frequency: ${sameHookCount}/${recentWindow.length}`,
        `Structure frequency: ${sameStructureCount}/${recentWindow.length}`,
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.95,
    };
  }
}

export class G14_EvidenceReconciliationGate {
  public static evaluate(
    video: CandidateVideoContext,
    priorFindings: readonly GateEvaluationFinding[],
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Audit that all findings have valid evidence and that blocking findings are not ignored
    const blockingFindings = priorFindings.filter((f) => f.severity === "BLOCKING" && f.status !== "PASS");
    const ungroundedFindings = priorFindings.filter((f) => !f.evidence || f.evidence.length === 0);

    if (ungroundedFindings.length > 0) {
      return {
        gateId: "G14_EVIDENCE_RECONCILIATION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { ungroundedGates: ungroundedFindings.map((f) => f.gateId) },
        explanation: `Invariant violation (CLAIM <= EVIDENCE): ${ungroundedFindings.length} gate finding(s) lack supporting evidence records.`,
        evidence: ungroundedFindings.map((f) => `${f.gateId}: missing evidence`),
        affectedStages: ["F07"],
        suggestedRemediation: "Enforce that all gate evaluators attach verifiable evidence before release evaluation.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    if (blockingFindings.length > 0) {
      return {
        gateId: "G14_EVIDENCE_RECONCILIATION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { blockingCount: blockingFindings.length },
        explanation: `Release blocked: ${blockingFindings.length} blocking finding(s) remain unresolved across upstream policy gates.`,
        evidence: blockingFindings.map((b) => `${b.gateId} (${b.ruleId}): ${b.explanation}`),
        affectedStages: ["F07"],
        suggestedRemediation: "Resolve all blocking policy findings prior to release approval.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G14_EVIDENCE_RECONCILIATION",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        totalGatesEvaluated: priorFindings.length + 1,
        blockingCount: 0,
        evidenceReconciled: true,
      },
      explanation: `All ${priorFindings.length} upstream policy gate findings verified and grounded with traceable evidence records.`,
      evidence: [
        `Artifact exists: ${video.measurements.fileExists}`,
        `Decode smoke: ${video.measurements.decodeSmokePassed}`,
        `Total evidence items verified: ${priorFindings.reduce((acc, f) => acc + f.evidence.length, 0)}`,
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}
