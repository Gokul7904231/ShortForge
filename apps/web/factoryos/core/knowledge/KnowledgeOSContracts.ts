/**
 * FactoryOS v3 — KnowledgeOS & Typed Memory Contracts
 * Assimilates WeKnora & Octop patterns:
 * Replaces undifferentiated vector dumps with domain-isolated typed knowledge stores.
 */

export interface KnowledgeObject {
  readonly id: string;
  readonly type: string;
  readonly schemaVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly provenanceDigest: string;
  readonly missionId?: string;
  readonly scope: "MISSION" | "CHANNEL" | "GLOBAL";
  readonly expiresAt?: number;
}

export interface StoredSource extends KnowledgeObject {
  readonly type: "SOURCE";
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
  readonly snippet: string;
  readonly reliabilityScore: number;
}

export interface StoredClaim extends KnowledgeObject {
  readonly type: "CLAIM";
  readonly statement: string;
  readonly verificationStatus: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "AMBIGUOUS";
  readonly sourceIds: string[];
  readonly confidence: number;
}

export interface StoredEvidence extends KnowledgeObject {
  readonly type: "EVIDENCE";
  readonly evidenceType: "ARTIFACT_HASH" | "HTTP_RECEIPT" | "COMPLIANCE_SIGNATURE";
  readonly targetRef: string;
  readonly sha256: string;
}

export interface ChannelProfileMemory extends KnowledgeObject {
  readonly type: "CHANNEL_MEMORY";
  readonly channelId: string;
  readonly dominantNiches: string[];
  readonly avgRetentionRate: number;
  readonly topPerformingHooks: string[];
  readonly forbiddenTopics: string[];
}

export interface TopicIntelligenceMemory extends KnowledgeObject {
  readonly type: "TOPIC_MEMORY";
  readonly topic: string;
  readonly lastResearchedAt: string;
  readonly saturationLevel: number; // 0.0 to 1.0
  readonly associatedPassportIds: string[];
}

export interface PerformanceAttributionMemory extends KnowledgeObject {
  readonly type: "PERFORMANCE_MEMORY";
  readonly videoId: string;
  readonly scriptPacingArchetype: string;
  readonly hookType: string;
  readonly voiceProfileId: string;
  readonly retentionAt3s: number;
  readonly completionRate: number;
}

/** A provenance-preserving relationship projected from existing KnowledgeOS records. */
export interface KnowledgeRelationship {
  readonly relationshipId: string;
  readonly relationType: "CLAIM_CITES_SOURCE" | "EVIDENCE_ATTESTS_REFERENCE";
  readonly fromId: string;
  /** Populated for relationships to another KnowledgeOS record. */
  readonly toId?: string;
  /** External artifact/passport/reference; never interpreted as a permission-bearing URL. */
  readonly targetRef?: string;
  readonly resolved: boolean;
  readonly provenanceDigest: string;
}

/** Required selection boundary: snapshot reads never default to cross-mission "all". */
export type KnowledgeOSSnapshotScope =
  | { readonly scope: "MISSION"; readonly missionId: string }
  | { readonly scope: "CHANNEL"; readonly channelId: string }
  | { readonly scope: "GLOBAL" };

/** Read-only, scoped versioned projection; this contract does not imply durable persistence. */
export interface KnowledgeOSSnapshot {
  readonly schemaVersion: "knowledgeos.snapshot.v1";
  readonly selection: KnowledgeOSSnapshotScope;
  readonly capturedAt: string;
  readonly records: readonly KnowledgeObject[];
  readonly relationships: readonly KnowledgeRelationship[];
  /** SHA-256 of canonical selection + records + relationships; capturedAt is excluded. */
  readonly contentDigest: string;
}

export interface KnowledgeOSSnapshotDiff {
  readonly schemaVersion: "knowledgeos.snapshot-diff.v1";
  readonly baseDigest: string;
  readonly targetDigest: string;
  readonly addedRecordIds: readonly string[];
  readonly removedRecordIds: readonly string[];
  readonly changedRecordIds: readonly string[];
  readonly addedRelationshipIds: readonly string[];
  readonly removedRelationshipIds: readonly string[];
}

