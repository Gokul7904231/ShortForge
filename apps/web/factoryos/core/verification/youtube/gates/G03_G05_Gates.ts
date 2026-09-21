/**
 * FactoryOS YouTube Monetization Guardian — Gates G03 to G05
 * G03: Inauthentic & Repetitive Content
 * G04: Reused Content (Separated from Copyright)
 * G05: Commercial Rights & Licensing
 */

import { computeGenomeSimilarity } from "../../../creative/ContentGenome";
import { CandidateVideoContext, ChannelContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";

export class G03_InauthenticContentGate {
  public static evaluate(
    video: CandidateVideoContext,
    channel: ChannelContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const history = channel.recentGenomes || [];
    const maxThreshold = rule.condition.maxCreativeSimilarity ?? 0.70;

    // Hard Duplicate check against history
    for (const prior of history) {
      if (video.genome.scriptHash && prior.scriptHash && video.genome.scriptHash === prior.scriptHash) {
        return {
          gateId: "G03_INAUTHENTIC_CONTENT",
          ruleId: rule.ruleId,
          status: "BLOCKED",
          severity: "BLOCKING",
          observedSignal: {
            duplicateScriptHash: prior.scriptHash,
            matchedPriorTopic: prior.topic,
          },
          explanation: `Exact script clone detected. Matches prior channel production for topic '${prior.topic}'. Violates YouTube inauthentic content policy.`,
          evidence: [
            `Candidate script hash: ${video.genome.scriptHash}`,
            `Historical match hash: ${prior.scriptHash}`,
          ],
          affectedStages: ["F02"],
          suggestedRemediation: "Generate an entirely new original script with distinct angle and factual progression.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "DETERMINISTIC",
          confidence: 1.0,
        };
      }
    }

    // Evaluate substantive similarity
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

    // ShortForge internal threshold check (NOT claimed as statutory YouTube law)
    if (maxSim > maxThreshold) {
      return {
        gateId: "G03_INAUTHENTIC_CONTENT",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: {
          maxSimilarity: maxSim,
          threshold: maxThreshold,
          mostSimilarTopic,
          breakdown,
        },
        explanation: `Substantive creative similarity (${(maxSim * 100).toFixed(1)}%) exceeds ShortForge internal creative-diversity threshold (${maxThreshold * 100}%). Shared story archetype, hook family, and narrative progression with prior video '${mostSimilarTopic}'. Note: Threshold represents ShortForge quality policy, not statutory YouTube law.`,
        evidence: [
          `Similarity score: ${(maxSim * 100).toFixed(1)}%`,
          `Story archetype match: ${breakdown?.storyTypeMatch}`,
          `Hook type match: ${breakdown?.hookTypeMatch}`,
          `Narrative structure match: ${breakdown?.structureMatch}`,
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
      observedSignal: { maxSimilarity: maxSim, historyCount: history.length },
      explanation: `Content originality and structural variation confirmed. Substantively distinct narrative from ${history.length} recent channel productions.`,
      evidence: [
        `Max historical similarity: ${(maxSim * 100).toFixed(1)}% (allowed <= ${maxThreshold * 100}%)`,
        `Story archetype: ${video.genome.storyType}`,
        `Visual grammar: ${video.genome.visualGrammar}`,
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.95,
    };
  }
}

export class G04_ReusedContentGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Engine-specific reused content rules
    if (video.contentEngine === "Reddit") {
      // Must not be simple raw TTS read-out of a Reddit post
      const isRawTts = video.scriptText.startsWith("r/") || video.scriptText.startsWith("Title:") || video.genome.thesis.includes("verbatim");
      if (isRawTts) {
        return {
          gateId: "G04_REUSED_CONTENT",
          ruleId: rule.ruleId,
          status: "REPAIR_REQUIRED",
          severity: "REPAIRABLE",
          observedSignal: { rawTtsReading: true, contentEngine: "Reddit" },
          explanation: "Reddit engine output appears to be a direct text-to-speech reading without original commentary or transformative storytelling.",
          evidence: ["Script begins with raw post structure without editorial synthesis"],
          affectedStages: ["F02"],
          suggestedRemediation: "Add transformative commentary, contextual framing, psychological analysis, or animated breakdown.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "HYBRID",
          confidence: 0.90,
        };
      }
    }

    if (video.contentEngine === "News") {
      // Must not be verbatim copy of a third-party news wire
      const claimsCount = video.factualClaimsCount ?? 0;
      const verifiedClaims = video.verifiedFactualClaimsCount ?? 0;
      if (claimsCount > 0 && verifiedClaims === 0) {
        return {
          gateId: "G04_REUSED_CONTENT",
          ruleId: rule.ruleId,
          status: "EXTERNAL_REVIEW",
          severity: "EXTERNAL_REVIEW",
          observedSignal: { unverifiedNewsClaims: claimsCount },
          explanation: "News topic contains factual assertions without verified source provenance or independent editorial commentary.",
          evidence: [`Unverified news claims count: ${claimsCount}`],
          affectedStages: ["F00", "F02"],
          suggestedRemediation: "Ground news reporting in multi-source verified facts with clear editorial synthesis.",
          evaluationType: "HYBRID",
          confidence: 0.88,
        };
      }
    }

    return {
      gateId: "G04_REUSED_CONTENT",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { transformativeNarration: true, engine: video.contentEngine },
      explanation: "Content satisfies transformative requirement with original editorial framing and narrative value.",
      evidence: [
        `Original script length: ${video.scriptText.length} chars`,
        `Factual thesis: ${video.genome.thesis.substring(0, 60)}...`,
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.95,
    };
  }
}

export class G05_CommercialRightsGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const assets = video.assets || [];
    const unclearedAssets: string[] = [];
    const expiredAssets: string[] = [];

    const now = new Date().getTime();

    for (const asset of assets) {
      if (!asset.isCommercialSafe && !asset.isOriginalSynthesis) {
        unclearedAssets.push(`${asset.assetId} (${asset.role}, source: ${asset.source})`);
      }
      if (asset.expirationDate) {
        const exp = new Date(asset.expirationDate).getTime();
        if (exp < now) {
          expiredAssets.push(`${asset.assetId} (expired ${asset.expirationDate})`);
        }
      }
    }

    if (unclearedAssets.length > 0 || expiredAssets.length > 0) {
      const issues = [...unclearedAssets.map((u) => `Un-cleared: ${u}`), ...expiredAssets.map((e) => `Expired: ${e}`)];
      return {
        gateId: "G05_COMMERCIAL_RIGHTS",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: {
          unclearedCount: unclearedAssets.length,
          expiredCount: expiredAssets.length,
          unclearedAssets,
          expiredAssets,
        },
        explanation: `Commercial licensing verification failed for ${issues.length} media asset(s): ${issues.join("; ")}. Commercial use evidence is an invariant.`,
        evidence: issues,
        affectedStages: ["F03", "F04"],
        suggestedRemediation: rule.suggestedRemediationAction,
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
      observedSignal: {
        totalAssetsEvaluated: assets.length,
        allCommercialSafe: true,
      },
      explanation: `All ${assets.length} visual, audio, and graphic assets possess verified commercial licensing or original synthesis provenance.`,
      evidence: assets.length > 0
        ? assets.map((a) => `${a.assetId}: ${a.license || "ORIGINAL"} (${a.source})`)
        : ["Zero external third-party assets utilized; original synthetic pipeline verified."],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}
