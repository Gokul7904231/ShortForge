/**
 * ShortForge / FactoryOS — Retrieval Contracts
 * Defines multi-source evidence models, normalized scoring configuration, and retrieval planning contracts.
 */

export type EvidenceSourceType = "STRUCTURAL" | "KNOWLEDGE" | "HISTORY" | "RUNTIME";

export type EvidenceAuthority = "AUTHORITATIVE" | "DERIVED" | "INFERRED" | "LIVE";

export type EpistemicStatus = "observed" | "sourced" | "inferred" | "hypothesized";

export type VerificationGrade = "unverified" | "verified" | "disputed" | "unknown";

export interface RetrievalScoringWeights {
  readonly relevance: number; // default 0.40
  readonly authority: number; // default 0.20
  readonly freshness: number; // default 0.15
  readonly verification: number; // default 0.15
  readonly structuralRelation: number; // default 0.10
}

export interface EvidenceItem {
  readonly id: string;
  readonly sourceType: EvidenceSourceType;
  readonly sourceId: string;
  readonly titleOrPath: string;
  readonly relevance: number; // 0.0 to 1.0 (raw match score)
  readonly finalScore?: number; // 0.0 to 1.0 (normalized multi-factor composite score)
  readonly authority: EvidenceAuthority;
  readonly freshness: string; // ISO string
  readonly epistemicStatus: EpistemicStatus;
  readonly verification: VerificationGrade;
  readonly evidenceLocation?: string;
  readonly snippet: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RetrievalPlan {
  readonly query: string;
  readonly intent:
    | "CODE_LOCATION"
    | "DECISION_RATIONALE"
    | "TEMPORAL_CHANGE"
    | "RUNTIME_STATUS"
    | "MULTI_SOURCE_SYNTHESIS";
  readonly targetSources: EvidenceSourceType[];
  readonly limit: number;
  readonly weights?: RetrievalScoringWeights;
  readonly policy?: "BEST_EVIDENCE" | "DIVERSITY_REQUIRED";
}

export interface RetrievalResult {
  readonly plan: RetrievalPlan;
  readonly items: EvidenceItem[];
  readonly totalItems: number;
  readonly durationMs: number;
  readonly executionTimestamp: string;
}

export interface IRetrievalPlanner {
  plan(query: string, limit?: number): RetrievalPlan;
  retrieve(query: string, limit?: number, customWeights?: Partial<RetrievalScoringWeights>): Promise<RetrievalResult>;
}
