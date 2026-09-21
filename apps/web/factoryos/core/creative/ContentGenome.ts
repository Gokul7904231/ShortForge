/**
 * FactoryOS Content Architecture — Content Genome
 * Machine-readable semantic identity and variation fingerprint for Shorts.
 * Adheres to: CLAIM <= EVIDENCE. Content variation is a first-class system invariant.
 */

import * as crypto from "node:crypto";

export type StoryType =
  | "curiosity-reveal"
  | "myth-vs-reality"
  | "engineering-breakdown"
  | "consequence-speculation"
  | "historical-context"
  | "perspective-narrative"
  | "deep-analogy";

export type HookType =
  | "curiosity-gap"
  | "myth-busting"
  | "counter-intuitive"
  | "shocking-statistic"
  | "visual-anchor"
  | "direct-question"
  | "provocative-statement";

export type NarrativeStructure =
  | "question-context-reveal-payoff"
  | "problem-mechanism-solution"
  | "myth-test-reality"
  | "chronological-discovery"
  | "three-layer-breakdown";

export type VisualGrammar =
  | "documentary-fast-cut"
  | "isometric-diagrammatic"
  | "kinetic-typography-primary"
  | "split-screen-comparison"
  | "cinematic-macro";

export type CaptionGrammar =
  | "kinetic-emphasis"
  | "pop-single-word"
  | "phrase-chunked"
  | "high-contrast-box";

export type AudioGrammar =
  | "narration-plus-light-bed"
  | "high-tempo-synthwave"
  | "ambient-documentary"
  | "percussive-minimal";

export interface FactualClaim {
  readonly claimId: string;
  readonly claimText: string;
  readonly claimType: "VERIFIED_FACT" | "MODEL_CLAIM" | "SOURCE_CLAIM" | "UNVERIFIED_ASSERTION";
  readonly source: string;
  readonly sourceUrl?: string;
  readonly retrievedAt: string;
  readonly sourceReputationScore: number;
  readonly supportingEvidenceSnippet?: string;
  readonly confidence: number;
}

export interface ContentGenome {
  readonly topic: string;
  readonly thesis: string;
  readonly storyType: StoryType;
  readonly hookType: HookType;
  readonly narrativeStructure: NarrativeStructure;
  readonly durationSeconds: number;
  readonly narrationSpeedWpm: number;
  readonly visualGrammar: VisualGrammar;
  readonly captionGrammar: CaptionGrammar;
  readonly audioGrammar: AudioGrammar;
  readonly factualClaims?: FactualClaim[];
  readonly sourceSetHash: string;
  readonly scriptHash: string;
  readonly variationProfile: string;
  readonly originalityProfile: string;
  readonly contentGenomeVersion: number;
  readonly generatedAt?: string;
  readonly contentEngine?: string;
}

/**
 * Computes a deterministic SHA-256 fingerprint for a Content Genome.
 */
export function computeGenomeHash(genome: ContentGenome): string {
  const normalized = {
    topic: genome.topic.trim().toLowerCase(),
    thesis: genome.thesis.trim().toLowerCase(),
    storyType: genome.storyType,
    hookType: genome.hookType,
    narrativeStructure: genome.narrativeStructure,
    visualGrammar: genome.visualGrammar,
    captionGrammar: genome.captionGrammar,
    audioGrammar: genome.audioGrammar,
    scriptHash: genome.scriptHash,
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/**
 * Computes composite similarity (0.0 to 1.0) between two Content Genomes.
 * Evaluates semantic thesis, structural dimensions, pacing, and visual grammar.
 */
export function computeGenomeSimilarity(g1: ContentGenome, g2: ContentGenome): {
  compositeSimilarity: number;
  breakdown: {
    storyTypeMatch: boolean;
    hookTypeMatch: boolean;
    structureMatch: boolean;
    visualGrammarMatch: boolean;
    pacingSimilarity: number;
    thesisSimilarity: number;
  };
} {
  const storyTypeMatch = g1.storyType === g2.storyType;
  const hookTypeMatch = g1.hookType === g2.hookType;
  const structureMatch = g1.narrativeStructure === g2.narrativeStructure;
  const visualGrammarMatch = g1.visualGrammar === g2.visualGrammar;

  // Pacing similarity based on duration and WPM differences
  const wpmDiff = Math.abs(g1.narrationSpeedWpm - g2.narrationSpeedWpm);
  const pacingSimilarity = Math.max(0, 1 - wpmDiff / 60);

  // Thesis similarity via token overlap
  const tokens1 = new Set(g1.thesis.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const tokens2 = new Set(g2.thesis.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  const thesisSimilarity = union > 0 ? intersection / union : 0;

  // Weighted composite similarity
  const compositeSimilarity =
    (storyTypeMatch ? 0.20 : 0.0) +
    (hookTypeMatch ? 0.20 : 0.0) +
    (structureMatch ? 0.15 : 0.0) +
    (visualGrammarMatch ? 0.15 : 0.0) +
    pacingSimilarity * 0.10 +
    thesisSimilarity * 0.20;

  return {
    compositeSimilarity: Number(compositeSimilarity.toFixed(3)),
    breakdown: {
      storyTypeMatch,
      hookTypeMatch,
      structureMatch,
      visualGrammarMatch,
      pacingSimilarity: Number(pacingSimilarity.toFixed(3)),
      thesisSimilarity: Number(thesisSimilarity.toFixed(3)),
    },
  };
}
