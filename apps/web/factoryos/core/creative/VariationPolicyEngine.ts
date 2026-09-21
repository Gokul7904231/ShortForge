/**
 * FactoryOS Content Architecture — Variation Policy Engine
 * Enforces the anti-template rule: Same topic != same video.
 * Assures material creative and factual diversity across channel output.
 */

import { ContentGenome, computeGenomeSimilarity } from "./ContentGenome";

export type VariationOutcome = "PASS" | "REMAKE" | "HUMAN_REVIEW" | "BLOCK";

export interface VariationDecision {
  readonly outcome: VariationOutcome;
  readonly maxSimilarity: number;
  readonly mostSimilarGenomeHash?: string;
  readonly reasons: string[];
  readonly evaluatedAt: string;
  readonly cooldownViolations: string[];
}

export class VariationPolicyEngine {
  private static instance: VariationPolicyEngine | null = null;
  private maxAllowedSimilarity = 0.70;

  public static getInstance(): VariationPolicyEngine {
    if (!VariationPolicyEngine.instance) {
      VariationPolicyEngine.instance = new VariationPolicyEngine();
    }
    return VariationPolicyEngine.instance;
  }

  /**
   * Evaluates candidate Short genome against rolling history of recent channel Shorts.
   * Enforces hard duplicate blocking and calibrated near-duplicate mitigation.
   */
  public evaluateCandidate(
    candidate: ContentGenome,
    recentHistory: ContentGenome[]
  ): VariationDecision {
    const now = new Date().toISOString();
    const reasons: string[] = [];
    const cooldownViolations: string[] = [];

    if (!recentHistory || recentHistory.length === 0) {
      return {
        outcome: "PASS",
        maxSimilarity: 0.0,
        reasons: ["Initial channel production: zero historical conflicts."],
        evaluatedAt: now,
        cooldownViolations: [],
      };
    }

    // 1. Hard Duplicate Gate: Identical script hash
    for (const prior of recentHistory) {
      if (candidate.scriptHash && prior.scriptHash && candidate.scriptHash === prior.scriptHash) {
        return {
          outcome: "BLOCK",
          maxSimilarity: 1.0,
          mostSimilarGenomeHash: prior.scriptHash,
          reasons: ["HARD_DUPLICATE: Candidate script hash exactly matches prior channel output."],
          evaluatedAt: now,
          cooldownViolations: [],
        };
      }
    }

    // 2. Cooldown Evaluation on recent 3 items (preventing creative fatigue)
    const recent3 = recentHistory.slice(-3);
    const repeatedHookCount = recent3.filter((h) => h.hookType === candidate.hookType).length;
    if (repeatedHookCount >= 2) {
      cooldownViolations.push(`Hook archetype '${candidate.hookType}' used in ${repeatedHookCount} of last 3 Shorts.`);
    }
    const repeatedStoryCount = recent3.filter((h) => h.storyType === candidate.storyType).length;
    if (repeatedStoryCount >= 2) {
      cooldownViolations.push(`Story structure '${candidate.storyType}' used in ${repeatedStoryCount} of last 3 Shorts.`);
    }

    // 3. Composite Genome Similarity Evaluation
    let maxSim = 0;
    let mostSimilar: ContentGenome | null = null;
    let worstBreakdown: any = null;

    for (const prior of recentHistory) {
      const sim = computeGenomeSimilarity(candidate, prior);
      if (sim.compositeSimilarity > maxSim) {
        maxSim = sim.compositeSimilarity;
        mostSimilar = prior;
        worstBreakdown = sim.breakdown;
      }
    }

    // 4. Decision Matrix
    if (maxSim > 0.85) {
      reasons.push(
        `High structural similarity (${(maxSim * 100).toFixed(1)}%) with prior Short '${mostSimilar?.topic}'. Shared story type (${worstBreakdown?.storyTypeMatch}) and hook (${worstBreakdown?.hookTypeMatch}).`
      );
      return {
        outcome: "REMAKE",
        maxSimilarity: maxSim,
        mostSimilarGenomeHash: mostSimilar?.scriptHash,
        reasons,
        evaluatedAt: now,
        cooldownViolations,
      };
    }

    if (maxSim > this.maxAllowedSimilarity || cooldownViolations.length >= 2) {
      reasons.push(
        `Near-duplicate creative profile (${(maxSim * 100).toFixed(1)}% similarity). Cooldown fatigue: ${cooldownViolations.join("; ")}`
      );
      return {
        outcome: "HUMAN_REVIEW",
        maxSimilarity: maxSim,
        mostSimilarGenomeHash: mostSimilar?.scriptHash,
        reasons,
        evaluatedAt: now,
        cooldownViolations,
      };
    }

    reasons.push(
      `Creative variation criteria satisfied: ${(maxSim * 100).toFixed(1)}% similarity (<= ${this.maxAllowedSimilarity * 100}% threshold). Substantively distinct angle.`
    );

    return {
      outcome: "PASS",
      maxSimilarity: maxSim,
      mostSimilarGenomeHash: mostSimilar?.scriptHash,
      reasons,
      evaluatedAt: now,
      cooldownViolations,
    };
  }
}
