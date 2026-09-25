/**
 * FactoryOS Frontier v3 — Research Passport & Claim Integrity Contracts
 * Defines the immutable audit trail for external research, claims, and evidence.
 */

export type ClaimType =
  | "VERIFIED_FACT"
  | "SOURCE_CLAIM"
  | "MODEL_CLAIM"
  | "UNVERIFIED_ASSERTION"
  | "CONTRADICTED_CLAIM"
  | "AMBIGUOUS_CLAIM";

export type VerificationStatus =
  | "VERIFIED"
  | "CONTRADICTED"
  | "AMBIGUOUS"
  | "UNVERIFIED";

export interface EvidenceSource {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly publisher?: string;
  readonly retrievedAt: string;
  readonly extractionMethod: "HTTP_SCRAPE" | "BROWSER_DOM" | "API_FEED" | "USER_PROVIDED" | "TEST_FIXTURE";
  readonly snippet: string;
  readonly reliabilityScore: number; // 0.0 to 1.0
  readonly isPrimarySource?: boolean;
  readonly contentHash?: string;
  readonly sourceStatus?: "ONLINE" | "UNREACHABLE" | "UNAVAILABLE" | "VERIFIED" | "UNVERIFIED" | "TEST_FIXTURE";
  readonly sourceQuality?: "TIER_1_PRIMARY" | "TIER_2_SECONDARY" | "TIER_3_TERTIARY" | "UNTRUSTED" | "UNVERIFIED";
}

export interface ResearchClaim {
  readonly claimId: string;
  readonly statement: string;
  readonly claimType: ClaimType;
  readonly source?: EvidenceSource;
  readonly sourceReference?: string;
  readonly supportingSources?: string[];
  readonly contradictingSources?: string[];
  readonly contradictionDegree?: number; // 0.0 to 1.0
  readonly retrievedAt: string;
  readonly extractionMethod: string;
  readonly verificationMethod: "DIRECT_MATCH" | "CROSS_SOURCE_CORROBORATION" | "GROUNDED_LLM" | "NONE";
  readonly verificationStatus: VerificationStatus;
  readonly confidence: number; // 0.0 to 1.0
  readonly provenance: string;
}

export interface PassportIntegrityMetadata {
  readonly contentHash: string; // SHA-256 of canonical payload
  readonly integrityMac: string; // HMAC-SHA256
  readonly algorithm: "HMAC-SHA256" | "ED25519";
  readonly keyId: string;
  readonly canonicalizationVersion: "JCS-v1";
  readonly signedAt: string;
}

export interface ResearchPassport {
  readonly passportId: string;
  readonly missionId: string;
  readonly question: string;
  readonly intent: string;
  readonly methodology: "QUICK" | "FULL" | "FACT_CHECK" | "TREND_SCAN" | "COMPETITOR_SCAN";
  readonly sources: EvidenceSource[];
  readonly claims: ResearchClaim[];
  readonly unresolvedIssues: string[];
  readonly confidence: number; // 0.0 to 1.0
  readonly provenance: {
    readonly reachProvider: string;
    readonly agentId: string;
    readonly floorId: string;
  };
  readonly timestamps: {
    readonly initiatedAt: string;
    readonly completedAt: string;
  };
  readonly transformations: string[];
  integrity?: PassportIntegrityMetadata;
}

export type ResearchMeasurementFidelity =
  | "HEURISTIC_ESTIMATE"
  | "MODEL_INFERENCE"
  | "OBSERVED_MEASUREMENT"
  | "VERIFIED_FACT"
  | "UNVERIFIED_ASSERTION";

export interface AnalystReport {
  readonly reportId: string;
  readonly topic: string;
  readonly executiveSummary: string;
  readonly keyFindings: string[];
  readonly hookIntelligence: {
    readonly recommendedHook: string;
    readonly hookArchetype: "CURIOSITY_GAP" | "PROVOCATIVE_QUESTION" | "STATISTICAL_SHOCK" | "CONTRARIAN";
    readonly estimatedRetentionBoost: number;
    readonly competitiveRetentionCurve?: number[];
    readonly fidelity: ResearchMeasurementFidelity;
    readonly provenanceNote: string;
  };
  readonly competitorSignals: Array<{
    readonly competitor: string;
    readonly format: string;
    readonly viewVelocity: string;
  }>;
  readonly passport: ResearchPassport;
  readonly generatedAt: string;
}
