/**
 * FactoryOS YouTube Monetization Guardian — Variation Planner
 * Pre-script diversity planner for Floor 01/02. Proposes diverse creative candidates
 * across dimensions based on channel history to avoid template repetition.
 */

import { ContentGenome, HookType, NarrativeStructure, StoryType, VisualGrammar, computeGenomeHash } from "../../../creative/ContentGenome";

export interface CreativeVariationOption {
  readonly optionId: string;
  readonly hookType: HookType;
  readonly storyType: StoryType;
  readonly narrativeStructure: NarrativeStructure;
  readonly visualGrammar: VisualGrammar;
  readonly thesisAngle: string;
  readonly narrativeRationale: string;
}

export interface VariationPlan {
  readonly topic: string;
  readonly contentEngine: string;
  readonly recommendedOption: CreativeVariationOption;
  readonly alternativeOptions: readonly CreativeVariationOption[];
  readonly channelHistoryEvaluatedCount: number;
}

export class VariationPlanner {
  /**
   * Plans diverse variations for a topic given recent channel history.
   */
  public static planVariations(
    topic: string,
    contentEngine: string,
    recentHistory: readonly ContentGenome[] = []
  ): VariationPlan {
    const recentHooks = new Set(recentHistory.slice(-5).map((h) => h.hookType));
    const recentStructures = new Set(recentHistory.slice(-5).map((h) => h.narrativeStructure));

    // Diverse candidate blueprints
    const candidates: CreativeVariationOption[] = [
      {
        optionId: "opt_curiosity",
        hookType: "curiosity-gap",
        storyType: "curiosity-reveal",
        narrativeStructure: "question-context-reveal-payoff",
        visualGrammar: "documentary-fast-cut",
        thesisAngle: `The hidden mechanism behind ${topic} that contradicts common assumptions.`,
        narrativeRationale: "Engages viewer with an unanswered mystery before revealing empirical cause.",
      },
      {
        optionId: "opt_engineering",
        hookType: "visual-anchor",
        storyType: "engineering-breakdown",
        narrativeStructure: "three-layer-breakdown",
        visualGrammar: "isometric-diagrammatic",
        thesisAngle: `A physical dissection of the three architectural layers governing ${topic}.`,
        narrativeRationale: "Appeals to analytical viewers with structural schematics and quantitative proof.",
      },
      {
        optionId: "opt_myth_busting",
        hookType: "myth-busting",
        storyType: "myth-vs-reality",
        narrativeStructure: "myth-test-reality",
        visualGrammar: "split-screen-comparison",
        thesisAngle: `What people get dangerously wrong about ${topic} versus what the data proves.`,
        narrativeRationale: "High retention through challenging popular misconception with counter-evidence.",
      },
      {
        optionId: "opt_provocative",
        hookType: "provocative-statement",
        storyType: "consequence-speculation",
        narrativeStructure: "problem-mechanism-solution",
        visualGrammar: "cinematic-macro",
        thesisAngle: `The compounding secondary effects of ${topic} on modern systems.`,
        narrativeRationale: "Explores immediate and long-term implications with cinematic pacing.",
      },
    ];

    // Pick recommended option that avoids recent channel hook and structure saturation
    let recommended = candidates.find((c) => !recentHooks.has(c.hookType) && !recentStructures.has(c.narrativeStructure));
    if (!recommended) {
      recommended = candidates[0];
    }

    const alternatives = candidates.filter((c) => c.optionId !== recommended!.optionId);

    return {
      topic,
      contentEngine,
      recommendedOption: recommended,
      alternativeOptions: Object.freeze(alternatives),
      channelHistoryEvaluatedCount: recentHistory.length,
    };
  }

  /**
   * Helper to synthesize a candidate ContentGenome from a planned option.
   */
  public static createGenomeFromOption(params: {
    topic: string;
    option: CreativeVariationOption;
    scriptText: string;
    durationSeconds?: number;
    factualClaims?: any[];
  }): ContentGenome {
    const scriptHash = `hash_${params.option.optionId}_${params.scriptText.length}`;
    const genome: ContentGenome = {
      topic: params.topic,
      thesis: params.option.thesisAngle,
      storyType: params.option.storyType,
      hookType: params.option.hookType,
      narrativeStructure: params.option.narrativeStructure,
      durationSeconds: params.durationSeconds ?? 45,
      narrationSpeedWpm: 160,
      visualGrammar: params.option.visualGrammar,
      captionGrammar: "kinetic-emphasis",
      audioGrammar: "narration-plus-light-bed",
      factualClaims: params.factualClaims || [],
      sourceSetHash: `src_${params.topic.replace(/\s+/g, "_")}`,
      scriptHash,
      variationProfile: `profile_${params.option.optionId}`,
      originalityProfile: "orig_v2",
      contentGenomeVersion: 2,
    };

    return genome;
  }
}
