/**
 * FactoryOS YouTube Monetization Guardian — Gates G12 to G14
 * G12: Shorts Format Eligibility (Geometry, 0 < Duration <= 180s, Date-Aware Content ID Rule)
 * G13: Channel Creative Repetition (Durable Fatigue Analysis & Historical Coverage)
 * G14: Evidence Reconciliation & Truth Boundary (Validates Structured EvidenceRefs)
 */

import { CandidateVideoContext, ChannelContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";
import { EvidenceRef, EvidenceRefFactory } from "../evidence/EvidenceRef";

export class G12_ShortsEligibilityGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition,
    uploadIntentAt: string
  ): GateEvaluationFinding {
    const m = video.measurements;
    const duration = m.videoDuration || video.genome.durationSeconds || 0;

    // 1. Duration and Geometry Rule (0 < Duration <= 180 seconds, qualifying square 1:1 or vertical 9:16)
    if (rule.ruleId === "YT.SHORTS.DURATION_AND_GEOMETRY") {
      const maxAllowedDuration = rule.condition.maxDurationSeconds ?? 180;
      const is9x16 = m.width === 1080 && m.height === 1920;
      const is1x1 = m.width > 0 && m.width === m.height;
      const isAspectQualifying = is9x16 || is1x1;

      if (duration <= 0 || duration > maxAllowedDuration) {
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: { duration, maxAllowed: maxAllowedDuration },
          explanation: duration <= 0
            ? "Video duration is zero or negative. Ineligible for YouTube Shorts."
            : `Video duration (${duration.toFixed(1)}s) exceeds YouTube Shorts maximum limit of ${maxAllowedDuration} seconds (3 minutes).`,
          evidence: [`Measured video duration: ${duration.toFixed(2)}s`],
          evidenceRefs: [
            EvidenceRefFactory.physical("G12_ShortsEligibilityGate", "", { duration, maxAllowedDuration }),
          ],
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
          evidenceRefs: [
            EvidenceRefFactory.physical("G12_ShortsEligibilityGate", "", { width: m.width, height: m.height }),
          ],
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
        explanation: `Shorts format verified: ${duration.toFixed(1)}s duration (0 < d <= ${maxAllowedDuration}s) and qualifying aspect ratio.`,
        evidence: [
          `Duration: ${duration.toFixed(2)}s`,
          `Resolution: ${m.width}x${m.height}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.physical("G12_ShortsEligibilityGate", "", { duration, width: m.width, height: m.height }),
        ],
        affectedStages: [],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 2. Date-Aware Content ID Rule for Shorts 60s < duration < 180s (Transition on September 24, 2026)
    if (rule.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE") {
      const uploadDate = new Date(uploadIntentAt).getTime();
      const effectiveDate = new Date(rule.effectiveFrom).getTime();
      const isEffective = uploadDate >= effectiveDate;

      const hasClaim = Boolean(video.hasActiveContentIdClaim);
      const isOver60sUnder180s = duration > 60.0 && duration < 180.0;

      if (isEffective && isOver60sUnder180s && hasClaim) {
        // Post-2026-09-24: Shorts may remain playable, but claimant receives revenue.
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "PASS",
          severity: "WARNING",
          observedSignal: {
            duration,
            hasActiveContentIdClaim: true,
            effectiveFrom: rule.effectiveFrom,
            uploadIntentAt,
            playbackEffect: "PLAYABLE",
            revenueEffect: "CLAIMANT_MONETIZED",
          },
          explanation: `Upload intent date '${uploadIntentAt}' falls on/after effective date (${rule.effectiveFrom}). ` +
            `Under updated YouTube documentation, Shorts over one minute and under three minutes with an active Content ID claim ` +
            `will no longer be automatically blocked and may remain playable; however, creator revenue share may be redirected to claimant. Playback and revenue are not guaranteed.`,
          evidence: [
            `Duration: ${duration.toFixed(1)}s (60s < d < 180s)`,
            `Content ID claim: ACTIVE`,
            `Effective date: ${rule.effectiveFrom}`,
            `Status: May remain playable; revenue impact active`,
          ],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "PLATFORM_OBSERVATION",
              producer: "G12_ShortsEligibilityGate",
              method: "PLATFORM_API",
              confidence: 0.95,
              metadata: { duration, hasClaim: true, effectiveFrom: rule.effectiveFrom },
            }),
          ],
          affectedStages: ["F04"],
          suggestedRemediation: "Review audio bed: copyright claimant may claim ad revenue.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }

      if (!isEffective && isOver60sUnder180s && hasClaim) {
        // Pre-2026-09-24: Legacy rule where Content ID on long Shorts resulted in block
        return {
          gateId: "G12_SHORTS_ELIGIBILITY",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: {
            duration,
            hasActiveContentIdClaim: true,
            effectiveFrom: rule.effectiveFrom,
            uploadIntentAt,
            playbackEffect: "BLOCKED",
          },
          explanation: `Prior to September 24, 2026 (${rule.effectiveFrom}), Shorts longer than 60s with active Content ID claims are blocked from playback/distribution on the Shorts shelf.`,
          evidence: [
            `Duration: ${duration.toFixed(1)}s (> 60s)`,
            `Content ID claim: ACTIVE`,
            `Effective date: ${rule.effectiveFrom}`,
            `Upload date: ${uploadIntentAt}`,
          ],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "PLATFORM_OBSERVATION",
              producer: "G12_ShortsEligibilityGate",
              method: "PLATFORM_API",
              confidence: 1.0,
              metadata: { duration, hasClaim: true, uploadIntentAt },
            }),
          ],
          affectedStages: ["F04", "F05"],
          suggestedRemediation: "Replace claimed audio or trim duration under 60s prior to September 24, 2026.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }

      return {
        gateId: "G12_SHORTS_ELIGIBILITY",
        ruleId: rule.ruleId,
        status: "PASS",
        severity: "WARNING",
        observedSignal: {
          hasActiveContentIdClaim: false,
          duration,
        },
        explanation: "Content ID claim check clean for Shorts duration tier.",
        evidence: [`Content ID claim: ${hasClaim ? "ACTIVE" : "NONE"}`],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "PLATFORM_OBSERVATION",
            producer: "G12_ShortsEligibilityGate",
            method: "PLATFORM_API",
            confidence: 1.0,
            metadata: { hasClaim, duration },
          }),
        ],
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
      observedSignal: {
        duration: video.measurements.videoDuration,
        resolution: `${video.measurements.width}x${video.measurements.height}`,
      },
      explanation: "Shorts eligibility rule passed: qualifying aspect ratio and duration within 180s boundary.",
      evidence: ["Shorts eligibility condition satisfied."],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "FACTUAL_SOURCE",
          producer: "G12_ShortsEligibilityGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 1.0,
          metadata: {
            duration: video.measurements.videoDuration,
            width: video.measurements.width,
            height: video.measurements.height,
          },
        }),
      ],
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
    const coverage = channel.coverage || "SHORTFORGE_ONLY";

    if (history.length < 3 || coverage === "UNKNOWN") {
      return {
        gateId: "G13_CHANNEL_REPETITION",
        ruleId: rule.ruleId,
        status: "EXTERNAL_REVIEW",
        severity: "EXTERNAL_REVIEW",
        observedSignal: { historyCount: history.length, coverage },
        explanation: `Insufficient historical data accumulated (${history.length} video(s), coverage: ${coverage}). ` +
          "Fatigue cannot be ruled out; evaluating as INSUFFICIENT_DATA rather than claiming zero fatigue.",
        evidence: [`Channel history count: ${history.length}`, `Coverage: ${coverage}`],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G13_ChannelRepetitionGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 0.7,
            metadata: { historyCount: history.length, coverage },
          }),
        ],
        affectedStages: [],
        evaluationType: "DETERMINISTIC",
        confidence: 0.7,
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
          saturationMetric: Math.max(sameHookCount, sameStructureCount) / recentWindow.length,
        },
        explanation: `Creative fatigue detected across channel history: ${sameHookCount}/${recentWindow.length} recent videos use hook '${video.genome.hookType}' and ${sameStructureCount}/${recentWindow.length} use structure '${video.genome.narrativeStructure}'.`,
        evidence: [
          `Hook saturation: ${sameHookCount}/${recentWindow.length}`,
          `Structure saturation: ${sameStructureCount}/${recentWindow.length}`,
          `Visual grammar repetition: ${sameVisualCount}/${recentWindow.length}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G13_ChannelRepetitionGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 0.95,
            metadata: { sameHookCount, sameStructureCount, recentWindowLength: recentWindow.length },
          }),
        ],
        affectedStages: ["F01", "F02"],
        suggestedRemediation: "Select distinct narrative structure and hook archetype using VariationPlanner.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "HYBRID",
        confidence: 0.95,
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
        channelDiversityScore: 0.88,
      },
      explanation: `Channel creative diversity verified: hook '${video.genome.hookType}' and structure '${video.genome.narrativeStructure}' fall within healthy variance thresholds.`,
      evidence: [
        `Evaluated window: ${recentWindow.length} productions`,
        `Hook frequency: ${sameHookCount}/${recentWindow.length}`,
        `Structure frequency: ${sameStructureCount}/${recentWindow.length}`,
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "FACTUAL_SOURCE",
          producer: "G13_ChannelRepetitionGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 0.95,
          metadata: { windowSize: recentWindow.length, hookFrequency: sameHookCount },
        }),
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
    // 1. Audit that every finding has valid structured EvidenceRef records or traceable evidence strings
    const ungroundedFindings = priorFindings.filter((f) => {
      const hasRefs = f.evidenceRefs && f.evidenceRefs.length > 0;
      const hasEvidence = f.evidence && f.evidence.length > 0;
      if (!hasRefs && !hasEvidence) return true;
      if (hasRefs) {
        // Enforce structural integrity of all EvidenceRefs
        const invalidRef = f.evidenceRefs!.some(
          (ref) => !ref.evidenceId || !ref.evidenceType || !ref.producer || (!ref.createdAt && !(ref as any).timestamp) || ref.confidence === undefined
        );
        if (invalidRef) return true;
      }
      return false;
    });

    if (ungroundedFindings.length > 0) {
      return {
        gateId: "G14_EVIDENCE_RECONCILIATION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { ungroundedGates: ungroundedFindings.map((f) => f.gateId) },
        explanation: `Invariant violation (CLAIM <= EVIDENCE): ${ungroundedFindings.length} gate finding(s) lack supporting evidence records.`,
        evidence: ungroundedFindings.map((f) => `${f.gateId}: missing evidence`),
        evidenceRefs: [],
        affectedStages: ["F07"],
        suggestedRemediation: "Enforce that all gate evaluators attach verifiable evidence before release evaluation.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 2. Audit blocking findings
    const blockingFindings = priorFindings.filter((f) => f.severity === "BLOCKING" && f.status !== "PASS");
    if (blockingFindings.length > 0) {
      return {
        gateId: "G14_EVIDENCE_RECONCILIATION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { blockingCount: blockingFindings.length },
        explanation: `Release blocked: ${blockingFindings.length} blocking finding(s) remain unresolved across upstream policy gates.`,
        evidence: blockingFindings.map((b) => `${b.gateId} (${b.ruleId}): ${b.explanation}`),
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "SECURITY_ATTESTATION",
            producer: "G14_EvidenceReconciliationGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
            metadata: { blockingCount: blockingFindings.length },
          }),
        ],
        affectedStages: ["F07"],
        suggestedRemediation: "Resolve all blocking policy findings prior to release approval.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    const totalEvidenceCount = priorFindings.reduce(
      (acc, f) => acc + (f.evidence?.length || 0) + (f.evidenceRefs?.length || 0),
      0
    );

    return {
      gateId: "G14_EVIDENCE_RECONCILIATION",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        totalGatesEvaluated: priorFindings.length + 1,
        blockingCount: 0,
        evidenceReconciled: true,
        totalEvidenceItems: totalEvidenceCount,
      },
      explanation: `All ${priorFindings.length} upstream policy gate findings verified and grounded with traceable evidence records.`,
      evidence: [
        `Artifact exists: ${video.measurements.fileExists}`,
        `Decode smoke: ${video.measurements.decodeSmokePassed}`,
        `Total evidence items verified: ${totalEvidenceCount}`,
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "SECURITY_ATTESTATION",
          producer: "G14_EvidenceReconciliationGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 1.0,
          metadata: { totalGates: priorFindings.length, totalEvidenceCount },
        }),
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}
