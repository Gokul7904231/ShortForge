/**
 * Project Ascalon — Experience Retriever Abstraction
 * Defines canonical retrieval contracts ensuring retrieved experiences
 * include explicit provenance, verification status, and training eligibility.
 */

export type MemoryTrainingEligibility = "ELIGIBLE" | "INELIGIBLE" | "PENDING_REVIEW";

export interface RetrievedExperience {
  readonly memoryId: string;
  readonly experienceType: "REAL_OPERATIONAL" | "SIMULATION" | "HEURISTIC" | "SYNTHETIC" | "REPLAY";
  readonly title: string;
  readonly summary: string;
  readonly floorId?: string;
  readonly similarity: number; // [0.0, 1.0]
  readonly source: string;
  readonly authority: "AUTHORITATIVE" | "HEURISTIC" | "UNVERIFIED";
  readonly verificationStatus: "VERIFIED" | "UNVERIFIED" | "FAILED";
  readonly outcomeStatus: "SUCCESS" | "FAILED" | "UNKNOWN";
  readonly trainingEligibility: MemoryTrainingEligibility;
  readonly createdAt: string;
  readonly fullEvidence?: Record<string, unknown>;
}

export interface ExperienceRetriever {
  readonly retrieverType: "KEYWORD" | "VECTOR" | "HYBRID";
  retrieve(
    query: string,
    options?: {
      floorId?: string;
      limit?: number;
      minSimilarity?: number;
      requireVerifiedOnly?: boolean;
    }
  ): Promise<RetrievedExperience[]>;
}

export class KeywordExperienceRetriever implements ExperienceRetriever {
  readonly retrieverType = "KEYWORD";
  private memorySource: () => Promise<RetrievedExperience[]>;

  constructor(memorySource: () => Promise<RetrievedExperience[]>) {
    this.memorySource = memorySource;
  }

  async retrieve(
    query: string,
    options: {
      floorId?: string;
      limit?: number;
      minSimilarity?: number;
      requireVerifiedOnly?: boolean;
    } = {}
  ): Promise<RetrievedExperience[]> {
    const all = await this.memorySource();
    const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const limit = options.limit || 5;

    const scored = all.map((exp) => {
      const targetText = `${exp.title} ${exp.summary} ${exp.floorId || ""}`.toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (targetText.includes(token)) matchCount++;
      }
      const similarity = queryTokens.length > 0 ? matchCount / queryTokens.length : 0.0;
      return { ...exp, similarity };
    });

    return scored
      .filter((exp) => {
        if (options.floorId && exp.floorId && exp.floorId !== options.floorId) return false;
        if (options.minSimilarity && exp.similarity < options.minSimilarity) return false;
        if (options.requireVerifiedOnly && exp.verificationStatus !== "VERIFIED") return false;
        return exp.similarity > 0;
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}

export class VectorExperienceRetriever implements ExperienceRetriever {
  readonly retrieverType = "VECTOR";
  private memorySource: () => Promise<RetrievedExperience[]>;

  constructor(memorySource: () => Promise<RetrievedExperience[]>) {
    this.memorySource = memorySource;
  }

  async retrieve(
    query: string,
    options: {
      floorId?: string;
      limit?: number;
      minSimilarity?: number;
      requireVerifiedOnly?: boolean;
    } = {}
  ): Promise<RetrievedExperience[]> {
    // Falls back to keyword retrieval when dense vector database is unconfigured
    const keywordFallback = new KeywordExperienceRetriever(this.memorySource);
    return keywordFallback.retrieve(query, options);
  }
}

export class HybridExperienceRetriever implements ExperienceRetriever {
  readonly retrieverType = "HYBRID";
  private keywordRetriever: KeywordExperienceRetriever;

  constructor(memorySource: () => Promise<RetrievedExperience[]>) {
    this.keywordRetriever = new KeywordExperienceRetriever(memorySource);
  }

  async retrieve(
    query: string,
    options?: {
      floorId?: string;
      limit?: number;
      minSimilarity?: number;
      requireVerifiedOnly?: boolean;
    }
  ): Promise<RetrievedExperience[]> {
    return this.keywordRetriever.retrieve(query, options);
  }
}
