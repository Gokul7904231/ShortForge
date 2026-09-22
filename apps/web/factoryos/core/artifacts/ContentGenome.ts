/**
 * FactoryOS Frontier v3 — Content Genome Architecture
 * Tracks the multi-dimensional creative DNA of synthesized content separate from file lineage.
 */

export interface ContentGenome {
  readonly genomeId: string;
  readonly jobId: string;
  readonly missionId: string;
  readonly topic: string;
  readonly audienceNiche: string;
  readonly hookArchetype: "CURIOSITY_GAP" | "PROVOCATIVE_QUESTION" | "STATISTICAL_SHOCK" | "CONTRARIAN";
  readonly narrativePacing: "ACCELERATED" | "MEASURED" | "DYNAMIC";
  readonly durationSeconds: number;
  readonly sceneArchetypes: string[];
  readonly visualStyle: string;
  readonly voiceTone: string;
  readonly callToAction: string;
  readonly claims: Array<{
    statement: string;
    type: "MODEL_CLAIM" | "SOURCE_CLAIM" | "VERIFIED_FACT" | "UNVERIFIED_ASSERTION";
    confidence: number;
  }>;
  readonly modelsUtilized: string[];
  readonly providersUtilized: string[];
  readonly measuredQualityScore: number;
  readonly performanceTelemetry?: {
    views?: number;
    completionRate?: number;
    retentionCurve?: number[];
  };
  readonly generatedAt: string;
}

export class ContentGenomeTracker {
  private genomes: Map<string, ContentGenome> = new Map();

  recordGenome(genome: ContentGenome): void {
    this.genomes.set(genome.jobId, genome);
  }

  getGenomeByJob(jobId: string): ContentGenome | undefined {
    return this.genomes.get(jobId);
  }

  getAllGenomes(): ContentGenome[] {
    return Array.from(this.genomes.values());
  }
}
