/**
 * ShortForge Memory Semantics — native contracts inspired by modern learned-memory
 * systems. These contracts intentionally terminate at the existing Memory Fabric,
 * MemoryWriter, verification, AER, and OKF boundaries.
 */

export type MemorySemanticType =
  | "WORLD_FACT"
  | "EXPERIENCE"
  | "OBSERVATION"
  | "MENTAL_MODEL"
  | "KNOWLEDGE_PAGE"
  | "EVIDENCE";

export type MemoryVerificationState =
  | "VERIFIED"
  | "SUPPORTED"
  | "UNVERIFIED"
  | "DISPUTED"
  | "INFERRED";

export type MemoryAuthorityClass =
  | "F07"
  | "VERIFIED_SYSTEM"
  | "HUMAN_AUTHORITY"
  | "MODEL_ADVISORY"
  | "UNKNOWN";

export type MemoryRelationType =
  | "SUPPORTS"
  | "CONTRADICTS"
  | "EXTENDS"
  | "SUPERSEDES"
  | "DERIVED_FROM"
  | "ABOUT_ENTITY"
  | "CAUSED_BY"
  | "PRECEDES";

export interface MemoryScope {
  readonly kind: "MISSION" | "CHANNEL" | "GLOBAL" | "CUSTOM";
  readonly key: string;
  readonly tags?: readonly string[];
}

export interface MemoryEvidenceRef {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceType: string;
  readonly quote?: string;
  readonly capturedAt: string;
  readonly sourceHash?: string;
  readonly verificationState: MemoryVerificationState;
  readonly authority: MemoryAuthorityClass;
}

export interface MemoryHistoryEntry {
  readonly version: number;
  readonly statement: string;
  readonly changedAt: string;
  readonly changeType: "CREATED" | "REINFORCED" | "EXTENDED" | "CONTRADICTED" | "SUPERSEDED";
  readonly evidenceRefs: readonly string[];
}

export interface MemoryRelation {
  readonly relationId: string;
  readonly fromMemoryId: string;
  readonly toMemoryId: string;
  readonly type: MemoryRelationType;
  readonly scopeKey: string;
  readonly createdAt: string;
  readonly evidenceRefs: readonly string[];
  readonly weight?: number;
}

export type MemoryFreshnessState =
  | "FRESH"
  | "SLIGHTLY_STALE"
  | "STALE"
  | "UNKNOWN";

export interface MemoryFreshness {
  readonly state: MemoryFreshnessState;
  readonly reason?: string;
  readonly checkedAt: string;
  readonly dirtySince?: string;
  readonly sourceWatermark?: string;
}

export interface MemoryObservation {
  readonly observationId: string;
  readonly scope: MemoryScope;
  readonly facetKey: string;
  readonly statement: string;
  readonly semanticType: "OBSERVATION";
  readonly verificationState: MemoryVerificationState;
  readonly authority: MemoryAuthorityClass;
  readonly sourceMemoryIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly supportingMemoryIds: readonly string[];
  readonly contradictingMemoryIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly proofCount: number;
  readonly version: number;
  readonly history: readonly MemoryHistoryEntry[];
  readonly freshness: MemoryFreshness;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entityRefs?: readonly string[];
  readonly sourceHash?: string;
}

export type MemoryRefreshMode = "FULL" | "DELTA";

export interface MemoryMentalModel {
  readonly modelId: string;
  readonly key: string;
  readonly question: string;
  readonly scope: MemoryScope;
  readonly semanticType: "MENTAL_MODEL" | "KNOWLEDGE_PAGE";
  readonly content: string;
  readonly sourceObservationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly verificationState: MemoryVerificationState;
  readonly authority: "MODEL_ADVISORY";
  readonly refreshMode: MemoryRefreshMode;
  readonly refreshAfterConsolidation: boolean;
  readonly refreshCron?: string;
  readonly minRefreshIntervalSeconds: number;
  readonly sourceFactTypes: readonly MemorySemanticType[];
  readonly excludeSiblingModels: boolean;
  readonly recallMaxTokens: number;
  readonly version: number;
  readonly lastRefreshedAt?: string;
  readonly dirtySince?: string;
  readonly dirtyReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryRecallQuery {
  readonly query: string;
  readonly scopeKey?: string;
  readonly types?: readonly MemorySemanticType[];
  readonly tags?: readonly string[];
  readonly tagsMatch?: "any" | "all" | "exact";
  readonly entityRefs?: readonly string[];
  readonly temporalWindow?: {
    readonly startAt?: string;
    readonly endAt?: string;
  };
  readonly queryTimestamp?: string;
  readonly maxItems?: number;
  readonly maxChars?: number;
  readonly maxTokens?: number;
  readonly allowUnverified?: boolean;
  readonly includeStale?: boolean;
  readonly trace?: boolean;
}

export interface MemoryRetrievalCandidate {
  readonly memoryId: string;
  readonly title: string;
  readonly semanticType: MemorySemanticType;
  readonly scopeKey: string;
  readonly content: string;
  readonly verificationState: MemoryVerificationState;
  readonly authority: MemoryAuthorityClass;
  readonly qualityState: string;
  readonly qualityScore: number;
  readonly occurredAt?: string;
  readonly validUntil?: string;
  readonly stale: boolean;
  readonly freshness: MemoryFreshness;
  readonly evidenceRefs: readonly string[];
  readonly provenance: string;
  readonly entityRefs: readonly string[];
  readonly relationIds: readonly string[];
  readonly semanticScore: number;
  readonly lexicalScore: number;
  readonly graphScore: number;
  readonly temporalScore: number;
  readonly rerankScore: number;
  readonly channelRanks: Readonly<Partial<Record<"semantic" | "lexical" | "graph" | "temporal", number>>>;
}

export interface MemoryRetrievalTrace {
  readonly query: string;
  readonly generatedAt: string;
  readonly candidateCount: number;
  readonly channelCounts: Readonly<Record<"semantic" | "lexical" | "graph" | "temporal", number>>;
  readonly fusionConstant: number;
  readonly staleCandidateCount: number;
}

export interface MemoryRecallResult {
  readonly query: MemoryRecallQuery;
  readonly generatedAt: string;
  readonly stale: boolean;
  readonly staleReason?: string;
  readonly estimatedTokens: number;
  readonly items: readonly MemoryRetrievalCandidate[];
  readonly trace?: MemoryRetrievalTrace;
}

export interface MemoryReflectionRequest {
  readonly question: string;
  readonly scopeKey?: string;
  readonly maxTokens: number;
  readonly includeRawEvidenceOnStale?: boolean;
}

export interface MemoryReflectionResult {
  readonly hierarchy: readonly ("MENTAL_MODEL" | "OBSERVATION" | "RAW_EVIDENCE")[];
  readonly selectedItems: readonly MemoryRetrievalCandidate[];
  readonly staleVerificationRequired: boolean;
  readonly sourceEvidenceRefs: readonly string[];
  readonly unresolvedReasons: readonly string[];
}

export interface MemoryProvenanceViolation {
  readonly memoryId: string;
  readonly code:
    | "SCOPE_LEAK"
    | "MISSING_EVIDENCE"
    | "EXPIRED"
    | "DISPUTED"
    | "MODEL_INFERENCE_AS_AUTHORITY"
    | "QUARANTINED"
    | "INVALID_PROVENANCE";
  readonly detail: string;
}

export interface MemoryProvenanceGuardReport {
  readonly accepted: readonly MemoryRetrievalCandidate[];
  readonly rejected: readonly MemoryRetrievalCandidate[];
  readonly violations: readonly MemoryProvenanceViolation[];
}

export interface MemoryConsolidationInput {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly facetKey: string;
  readonly statement: string;
  readonly semanticType: "WORLD_FACT" | "EXPERIENCE" | "EVIDENCE";
  readonly verificationState: MemoryVerificationState;
  readonly authority: MemoryAuthorityClass;
  readonly occurredAt: string;
  readonly evidenceRefs: readonly MemoryEvidenceRef[];
  readonly entityRefs?: readonly string[];
  readonly sourceHash?: string;
  readonly relationToExisting?: {
    readonly type: "SUPPORTS" | "CONTRADICTS" | "EXTENDS" | "SUPERSEDES" | "NEW";
    readonly observationId?: string;
  };
}

export interface MemoryConsolidationReport {
  readonly scopeKey: string;
  readonly inputCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly contradictedCount: number;
  readonly mergedNearDuplicates: number;
  readonly observationIds: readonly string[];
}

export interface MemoryGateDefinition {
  readonly gateId: string;
  readonly layer: "LEAF" | "BRANCH" | "ROOT";
  readonly outcome: string;
  readonly check?: string;
  readonly expect?: string;
  readonly cwd?: string;
  readonly dependsOn?: readonly string[];
}

export type MemoryGateStatus =
  | "PENDING"
  | "MET"
  | "REVERIFY_REQUIRED"
  | "HANDOFF";

export type MemoryProofKind = "AUTOMATIC_COMMAND" | "MANUAL" | "INTEGRATION";

export interface MemoryGateProof {
  readonly gateId: string;
  readonly kind: MemoryProofKind;
  readonly definitionDigest: string;
  readonly evidenceDigest: string;
  readonly observedAt: string;
  readonly reverifiedAt?: string;
  readonly note?: string;
}

export interface MemoryGateRecord extends MemoryGateDefinition {
  readonly definitionDigest: string;
  readonly status: MemoryGateStatus;
  readonly proof?: MemoryGateProof;
  readonly abandonmentReason?: string;
}

export interface MemoryCompletionSnapshot {
  readonly status: "ALL_MET" | "INCOMPLETE" | "HANDOFF" | "REVERIFY_REQUIRED";
  readonly gates: readonly MemoryGateRecord[];
  readonly metCount: number;
  readonly pendingCount: number;
  readonly reverifyRequiredCount: number;
  readonly handoffCount: number;
  readonly evaluatedAt: string;
}

export interface MemoryMentalModelRefreshPlan {
  readonly modelId: string;
  readonly eligible: boolean;
  readonly reason: string;
  readonly mode: MemoryRefreshMode;
  readonly sourceObservationIds: readonly string[];
  readonly sourceFactTypes: readonly MemorySemanticType[];
  readonly excludeSiblingModels: boolean;
  readonly maxTokens: number;
}
