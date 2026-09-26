/**
 * ShortForge / FactoryOS — Live Memory Fabric Contracts
 *
 * The Memory Fabric is the bridge between operational evidence and the
 * Obsidian-compatible knowledge vault. MongoDB remains operational state;
 * knowledge/ remains derived cognitive memory.
 */

export const MEMORY_FABRIC_QUALITY_STATES = [
  "VALID",
  "WARN",
  "STALE",
  "INCOMPLETE",
  "CONTRADICTORY",
  "UNVERIFIED",
  "QUARANTINED",
] as const;

export type MemoryFabricQualityState =
  (typeof MEMORY_FABRIC_QUALITY_STATES)[number];

export const MEMORY_FABRIC_LIFECYCLE_STATES = [
  "OBSERVATION",
  "CANDIDATE",
  "CORRELATED",
  "VERIFIED",
  "PROMOTED",
  "ACTIVE",
  "SUPERSEDED",
  "ARCHIVED",
] as const;

export type MemoryFabricLifecycle =
  (typeof MEMORY_FABRIC_LIFECYCLE_STATES)[number];

export type MemoryFabricSourceKind =
  | "DURABLE_EVENT"
  | "MONGO_CHANGE"
  | "MONGO_RECONCILIATION"
  | "MANUAL_PROPOSAL";

export type MemoryFabricRecordStatus =
  | "INGESTED"
  | "MATERIALIZED"
  | "CANDIDATE"
  | "PROMOTED"
  | "QUARANTINED"
  | "FAILED";

export interface MemoryFabricSourceEnvelope {
  readonly sourceKey: string;
  readonly sourceKind: MemoryFabricSourceKind;
  readonly sourceId: string;
  readonly sourceType: string;
  readonly sourceCollection?: string;
  readonly sourceDocumentId?: string;
  readonly occurredAt: string;
  readonly capturedAt: string;
  readonly correlationId?: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly sourceVersion?: string;
  readonly conflictGroup?: string;
}

export interface MemoryFabricLedgerRecord {
  readonly sourceKey: string;
  readonly sourceKind: MemoryFabricSourceKind;
  readonly sourceId: string;
  readonly sourceType: string;
  readonly sourceCollection?: string;
  readonly sourceDocumentId?: string;
  readonly occurredAt: string;
  readonly capturedAt: string;
  readonly correlationId?: string;
  readonly summary: string;
  readonly payloadJson: string;
  readonly sourceHash: string;
  readonly sourceVersion?: string;
  readonly conflictGroup?: string;
  readonly status: MemoryFabricRecordStatus;
  readonly lifecycle: MemoryFabricLifecycle;
  readonly qualityState: MemoryFabricQualityState;
  readonly qualityScore: number;
  readonly rawPath?: string;
  readonly candidatePath?: string;
  readonly promotedPath?: string;
  readonly error?: string;
  readonly processedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryFabricOffset {
  readonly streamKey: string;
  readonly resumeTokenJson?: string;
  readonly updatedAt: string;
}

export interface MemoryFabricHealth {
  readonly enabled: boolean;
  readonly mode:
    | "DISABLED"
    | "EVENT_ONLY"
    | "MONGO_CHANGE_STREAM"
    | "MONGO_RECONCILIATION"
    | "DEGRADED";
  readonly running: boolean;
  readonly pending: number;
  readonly failed: number;
  readonly quarantined: number;
  readonly totalIngested: number;
  readonly lastIngestAt?: string;
  readonly lastProcessedAt?: string;
  readonly lastError?: string;
  readonly changeStreamAvailable: boolean;
  readonly vaultPath: string;
}

export interface MemoryFabricProjectionItem {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly lifecycle: string;
  readonly epistemicState: string;
  readonly verificationState: string;
  readonly qualityState: MemoryFabricQualityState;
  readonly qualityScore: number;
  readonly occurredAt?: string;
  readonly validUntil?: string;
  readonly provenance: string;
  readonly content: string;
}

export interface MemoryFabricProjection {
  readonly generatedAt: string;
  readonly query: string;
  readonly mode: "AGENT" | "ASCALON";
  readonly itemCount: number;
  readonly estimatedTokens: number;
  readonly items: readonly MemoryFabricProjectionItem[];
}

export interface IMemoryFabricLedger {
  initialize(): Promise<void>;
  insertIfAbsent(record: MemoryFabricLedgerRecord): Promise<boolean>;
  get(sourceKey: string): Promise<MemoryFabricLedgerRecord | null>;
  update(sourceKey: string, patch: Partial<MemoryFabricLedgerRecord>): Promise<void>;
  listPending(limit?: number): Promise<MemoryFabricLedgerRecord[]>;
  countByStatus(status: MemoryFabricRecordStatus): Promise<number>;
  countByQualityState(state: MemoryFabricQualityState): Promise<number>;
  getRecent(limit?: number): Promise<MemoryFabricLedgerRecord[]>;
  getOffset(streamKey: string): Promise<MemoryFabricOffset | null>;
  setOffset(offset: MemoryFabricOffset): Promise<void>;
}
