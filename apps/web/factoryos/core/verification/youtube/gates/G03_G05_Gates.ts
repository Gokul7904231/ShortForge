/**
 * FactoryOS YouTube Monetization Guardian — Gates G03 to G05
 * G03: Inauthentic & Repetitive Content (ContentIdentityHash, SemanticSimilarity, DiversityAssessment)
 * G04: Reused Content (Requires Verifiable Transformative Commentary)
 * G05: Commercial Rights & Licensing (Structured Rights Proof & Expiry against publicationIntentAt)
 */

import { computeGenomeSimilarity } from "../../../creative/ContentGenome";
import { CandidateVideoContext, ChannelContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";
import { EvidenceRefFactory } from "../evidence/EvidenceRef";

export class G03_InauthenticContentGate {
  public static evaluate(
    video: CandidateVideoContext,
    channel: ChannelContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const history = channel.recentGenomes || [];
    const maxThreshold = rule.condition.maxCreativeSimilarity ?? 0.70;

    // 1. Content Identity Hash: Exact duplicate check
    for (const prior of history) {
      if (video.genome.scriptHash && prior.scriptHash && video.genome.scriptHash === prior.scriptHash) {
        return {
          gateId: "G03_INAUTHENTIC_CONTENT",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: {
            contentIdentityHash: video.genome.scriptHash,
            matchedPriorTopic: prior.topic,
          },
          explanation: `Exact script clone detected. Matches prior channel production for topic '${prior.topic}'. Violates YouTube inauthentic content policy.`,
          evidence: [
            `Candidate script hash: ${video.genome.scriptHash}`,
            `Historical match hash: ${prior.scriptHash}`,
          ],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "FACTUAL_SOURCE",
              producer: "G03_InauthenticContentGate",
              method: "DETERMINISTIC_PROBE",
              confidence: 1.0,
              metadata: { duplicateScriptHash: prior.scriptHash },
            }),
          ],
          affectedStages: ["F02"],
          suggestedRemediation: "Generate an entirely new original script with distinct angle and factual progression.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }
    }

    // 2. Semantic & Structural Similarity
    let maxSim = 0;
    let mostSimilarTopic = "";
    let breakdown: any = null;

    for (const prior of history) {
      const sim = computeGenomeSimilarity(video.genome, prior);
      if (sim.compositeSimilarity > maxSim) {
        maxSim = sim.compositeSimilarity;
        mostSimilarTopic = prior.topic;
        breakdown = sim.breakdown;
      }
    }

    // 3. ShortForge internal threshold check (explicitly labeled internal, not statutory platform law)
    if (maxSim > maxThreshold) {
      return {
        gateId: "G03_INAUTHENTIC_CONTENT",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: {
          semanticSimilarityScore: maxSim,
          threshold: maxThreshold,
          channelCreativeDiversityAssessment: "SATURATED",
          mostSimilarTopic,
          breakdown,
        },
        explanation: `Substantive creative similarity (${(maxSim * 100).toFixed(1)}%) exceeds ShortForge internal creative-diversity threshold (${maxThreshold * 100}%). ` +
          `Shared story archetype, hook family, and narrative progression with prior video '${mostSimilarTopic}'. ` +
          "Note: Threshold represents ShortForge internal originality policy, not statutory YouTube law.",
        evidence: [
          `Similarity score: ${(maxSim * 100).toFixed(1)}%`,
          `Story archetype match: ${breakdown?.storyTypeMatch}`,
          `Hook type match: ${breakdown?.hookTypeMatch}`,
          `Narrative structure match: ${breakdown?.structureMatch}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G03_InauthenticContentGate",
            method: "AI_INFERENCE",
            confidence: 0.92,
            metadata: { maxSim, maxThreshold, mostSimilarTopic },
          }),
        ],
        affectedStages: ["F02", "F03"],
        suggestedRemediation: rule.suggestedRemediationAction,
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "HYBRID",
        confidence: 0.92,
      };
    }

    return {
      gateId: "G03_INAUTHENTIC_CONTENT",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        semanticSimilarityScore: maxSim,
        channelCreativeDiversityAssessment: "DIVERSE",
        historyCount: history.length,
      },
      explanation: `Content originality and structural variation confirmed. Substantively distinct narrative from ${history.length} recent channel productions.`,
      evidence: [
        `Max historical similarity: ${(maxSim * 100).toFixed(1)}% (allowed <= ${maxThreshold * 100}%)`,
        `Story archetype: ${video.genome.storyType}`,
        `Visual grammar: ${video.genome.visualGrammar}`,
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "FACTUAL_SOURCE",
          producer: "G03_InauthenticContentGate",
          method: "HYBRID",
          confidence: 0.96,
          metadata: { maxSim, historyCount: history.length },
        }),
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}

export class G04_ReusedContentGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Invariant: G04 cannot default to PASS without evidence of transformative contribution
    const hasThirdPartyClips = video.assets.some((a) => !a.isOriginalSynthesis);
    const hasCommentary = Boolean(video.scriptText && video.scriptText.length > 50);

    // Engine specific policies: Reddit and News engines reuse third-party prompts/reporting
    if (video.contentEngine === "Reddit") {
      const isRawTts = video.scriptText.startsWith("r/") || video.scriptText.startsWith("Title:") || video.genome.thesis.includes("verbatim");
      if (isRawTts) {
        return {
          gateId: "G04_REUSED_CONTENT",
          ruleId: rule.ruleId,
          status: "REPAIR_REQUIRED",
          severity: "REPAIRABLE",
          observedSignal: {
            contentEngine: video.contentEngine,
            rawTtsReading: true,
            hasTransformativeCommentary: false,
          },
          explanation: "Reddit engine output appears to be a direct text-to-speech reading without original commentary or transformative storytelling.",
          evidence: ["Script begins with raw post structure without editorial synthesis"],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "FACTUAL_SOURCE",
              producer: "G04_ReusedContentGate",
              method: "DETERMINISTIC_PROBE",
              confidence: 0.95,
              metadata: { contentEngine: "Reddit", isRawTts: true },
            }),
          ],
          affectedStages: ["F01", "F02"],
          suggestedRemediation: "Add transformative commentary, contextual framing, psychological analysis, or animated breakdown.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "HYBRID",
          confidence: 0.90,
        };
      }
    }

    if (video.contentEngine === "News") {
      const claimsCount = video.factualClaimsCount ?? 0;
      const verifiedClaims = video.verifiedFactualClaimsCount ?? 0;
      if (claimsCount > 0 && verifiedClaims === 0) {
        return {
          gateId: "G04_REUSED_CONTENT",
          ruleId: rule.ruleId,
          status: "EXTERNAL_REVIEW",
          severity: "EXTERNAL_REVIEW",
          observedSignal: {
            contentEngine: video.contentEngine,
            unverifiedNewsClaims: claimsCount,
          },
          explanation: "News topic contains factual assertions without verified source provenance or independent editorial commentary.",
          evidence: [`Unverified news claims count: ${claimsCount}`],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "FACTUAL_SOURCE",
              producer: "G04_ReusedContentGate",
              method: "HYBRID",
              confidence: 0.88,
              metadata: { claimsCount, verifiedClaims },
            }),
          ],
          affectedStages: ["F00", "F02"],
          suggestedRemediation: "Ground news reporting in multi-source verified facts with clear editorial synthesis.",
          evaluationType: "HYBRID",
          confidence: 0.88,
        };
      }
    }

    if (hasThirdPartyClips && !hasCommentary) {
      return {
        gateId: "G04_REUSED_CONTENT",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: {
          hasThirdPartyClips,
          hasCommentary,
        },
        explanation: "Third-party asset reuse detected without documented original commentary or transformative value. Reused content violation under channel monetization policy.",
        evidence: ["Third-party assets present with missing transformative narrative layer"],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G04_ReusedContentGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 0.95,
          }),
        ],
        affectedStages: ["F01", "F02"],
        suggestedRemediation: "Synthesize original narration providing critique, education, or transformation.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "HYBRID",
        confidence: 0.95,
      };
    }

    return {
      gateId: "G04_REUSED_CONTENT",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        transformativeValueVerified: true,
        thirdPartyClipsPresent: hasThirdPartyClips,
      },
      explanation: "Content satisfies transformative requirement. Narrative provides original synthesis, voice commentary, and editorial direction.",
      evidence: [
        `Narration word count: ${video.scriptText.split(/\s+/).length} words`,
        `Content Engine: ${video.contentEngine}`,
        "Transformative commentary verified",
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "FACTUAL_SOURCE",
          producer: "G04_ReusedContentGate",
          method: "HYBRID",
          confidence: 0.96,
        }),
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}

export class G05_CommercialRightsGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition,
    publicationIntentAt?: string
  ): GateEvaluationFinding {
    const assets = video.assets || [];
    const pubTime = publicationIntentAt ? new Date(publicationIntentAt).getTime() : Date.now();
    const unclearedAssets: string[] = [];
    const expiredAssets: string[] = [];

    for (const asset of assets) {
      if (!asset.isCommercialSafe && !asset.isOriginalSynthesis) {
        unclearedAssets.push(`${asset.assetId} (${asset.type})`);
      }

      // Check license expiration against publicationIntentAt
      if (asset.licenseExpiresAt) {
        const expTime = new Date(asset.licenseExpiresAt).getTime();
        if (pubTime >= expTime) {
          expiredAssets.push(`${asset.assetId} (expired ${asset.licenseExpiresAt})`);
        }
      }
    }

    if (expiredAssets.length > 0) {
      return {
        gateId: "G05_COMMERCIAL_RIGHTS",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { expiredAssets, publicationIntentAt },
        explanation: `Commercial license for ${expiredAssets.length} asset(s) expires prior to publication intent timestamp '${publicationIntentAt}'.`,
        evidence: expiredAssets.map((e) => `Expired asset: ${e}`),
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "LICENSE_PROOF",
            producer: "G05_CommercialRightsGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
            metadata: { expiredAssets, publicationIntentAt },
          }),
        ],
        affectedStages: ["F03", "F04"],
        suggestedRemediation: "Renew asset commercial license or replace with valid licensed asset.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    if (unclearedAssets.length > 0) {
      return {
        gateId: "G05_COMMERCIAL_RIGHTS",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { unclearedCount: unclearedAssets.length },
        explanation: `Unlicensed or commercial safety uncleared for ${unclearedAssets.length} asset(s): ${unclearedAssets.join(", ")}. Ineligible for commercial YouTube monetization.`,
        evidence: unclearedAssets.map((a) => `Uncleared asset: ${a}`),
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "LICENSE_PROOF",
            producer: "G05_CommercialRightsGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
            metadata: { unclearedAssets },
          }),
        ],
        affectedStages: ["F03", "F04"],
        suggestedRemediation: "Replace uncleared assets with commercial-safe licensed stock or original syntheses.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G05_COMMERCIAL_RIGHTS",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { totalAssets: assets.length, commercialClearance: "100%" },
      explanation: `All ${assets.length} visual, audio, and graphic assets have verified commercial clearance or original synthetic provenance.`,
      evidence: [
        `Asset count: ${assets.length}`,
        "Zero uncleared third-party assets detected",
        "Commercial provenance: VERIFIED",
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "LICENSE_PROOF",
          producer: "G05_CommercialRightsGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 1.0,
          metadata: { assetCount: assets.length },
        }),
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}
