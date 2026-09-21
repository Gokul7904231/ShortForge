/**
 * FactoryOS YouTube Monetization Guardian — Creative Fatigue Analyzer
 * Multi-dimensional analysis of candidate genome against channel historical output.
 * Invariant: Thresholds are ShortForge creative-diversity metrics, NOT YouTube statutory thresholds.
 */

import { ContentGenome, computeGenomeSimilarity } from "../../../creative/ContentGenome";

export interface CreativeFatigueBreakdown {
  readonly semanticSimilarity: number;
  readonly structuralSimilarity: number;
  readonly hookSimilarity: number;
  readonly visualSimilarity: number;
  readonly narrativeSimilarity: number;
  readonly thesisSimilarity: number;
  readonly topicRecurrence: number;
  readonly templateReuse: number;
  readonly risk: "LOW" | "MEDIUM" | "HIGH";
  readonly mostSimilarPriorTopic?: string;
  readonly mostSimilarGenomeHash?: string;
  readonly details: readonly string[];
}

export interface FatigueAnalysisConfig {
  readonly highRiskThreshold?: number;   // default 0.85
  readonly mediumRiskThreshold?: number; // default 0.65
  readonly maxTopicRecurrenceInWindow?: number; // default 3
}

export class CreativeFatigueAnalyzer {
  public static analyze(
    candidate: ContentGenome,
    recentHistory: readonly ContentGenome[],
    config?: FatigueAnalysisConfig
  ): CreativeFatigueBreakdown {
    const highThreshold = config?.highRiskThreshold ?? 0.85;
    const mediumThreshold = config?.mediumRiskThreshold ?? 0.65;
    const maxTopicRecurrence = config?.maxTopicRecurrenceInWindow ?? 3;

    if (!recentHistory || recentHistory.length === 0) {
      return {
        semanticSimilarity: 0.0,
        structuralSimilarity: 0.0,
        hookSimilarity: 0.0,
        visualSimilarity: 0.0,
        narrativeSimilarity: 0.0,
        thesisSimilarity: 0.0,
        topicRecurrence: 0.0,
        templateReuse: 0.0,
        risk: "LOW",
        details: ["Initial channel production: zero historical conflicts."],
      };
    }

    let maxCompositeSim = 0;
    let worstBreakdown: any = null;
    let mostSimilarPrior: ContentGenome | null = null;
    let sameTopicCount = 0;

    const candidateTopicNorm = candidate.topic.trim().toLowerCase();

    for (const prior of recentHistory) {
      if (prior.topic.trim().toLowerCase() === candidateTopicNorm) {
        sameTopicCount++;
      }

      const sim = computeGenomeSimilarity(candidate, prior);
      if (sim.compositeSimilarity > maxCompositeSim) {
        maxCompositeSim = sim.compositeSimilarity;
        worstBreakdown = sim.breakdown;
        mostSimilarPrior = prior;
      }
    }

    const topicRecurrenceScore = Math.min(1.0, sameTopicCount / maxTopicRecurrence);
    const templateReuseScore = worstBreakdown?.structureMatch && worstBreakdown?.visualGrammarMatch ? 1.0 : 0.0;

    const structuralSim = worstBreakdown?.structureMatch ? 1.0 : 0.0;
    const hookSim = worstBreakdown?.hookTypeMatch ? 1.0 : 0.0;
    const visualSim = worstBreakdown?.visualGrammarMatch ? 1.0 : 0.0;
    const narrativeSim = worstBreakdown?.storyTypeMatch ? 1.0 : 0.0;
    const thesisSim = worstBreakdown?.thesisSimilarity ?? 0.0;
    const semanticSim = Number(((thesisSim * 0.5) + (narrativeSim * 0.5)).toFixed(3));

    const details: string[] = [];
    let risk: "LOW" | "MEDIUM" | "HIGH" = "LOW";

    if (maxCompositeSim >= highThreshold) {
      risk = "HIGH";
      details.push(
        `High creative similarity (${(maxCompositeSim * 100).toFixed(1)}%) with '${mostSimilarPrior?.topic}'. Identical story archetype and hook family.`
      );
    } else if (maxCompositeSim >= mediumThreshold || topicRecurrenceScore >= 1.0) {
      risk = "MEDIUM";
      if (topicRecurrenceScore >= 1.0) {
        details.push(`Topic '${candidate.topic}' repeated ${sameTopicCount} times in recent window.`);
      }
      if (maxCompositeSim >= mediumThreshold) {
        details.push(`Elevated similarity (${(maxCompositeSim * 100).toFixed(1)}%) with '${mostSimilarPrior?.topic}'.`);
      }
    } else {
      details.push(
        `Substantive variation satisfied: ${(maxCompositeSim * 100).toFixed(1)}% max similarity across ${recentHistory.length} channel productions.`
      );
    }

    return {
      semanticSimilarity: semanticSim,
      structuralSimilarity: structuralSim,
      hookSimilarity: hookSim,
      visualSimilarity: visualSim,
      narrativeSimilarity: narrativeSim,
      thesisSimilarity: thesisSim,
      topicRecurrence: topicRecurrenceScore,
      templateReuse: templateReuseScore,
      risk,
      mostSimilarPriorTopic: mostSimilarPrior?.topic,
      mostSimilarGenomeHash: mostSimilarPrior?.scriptHash,
      details,
    };
  }
}
