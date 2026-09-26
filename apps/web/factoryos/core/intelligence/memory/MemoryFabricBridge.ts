/**
 * ShortForge / FactoryOS — Live Memory Fabric Bridge
 *
 * Runtime topology:
 *   DurableEventBus ─┐
 *                    ├─> MemoryFabricLedger ─> raw knowledge/ ─> candidate
 *   MongoDB changes ─┘                                  │
 *                                                      ├─> gated promotion
 *                                                      └─> agent / Ascalon projection
 *
 * The bridge is fail-open for FactoryOS execution: memory failures become
 * ledger failures/quarantine state and never mutate runtime authority.
 */

import crypto from "node:crypto";
import path from "node:path";
import { EJSON, type Db } from "mongodb";

import type { EventEnvelope } from "../../contracts/EventContracts";
import type { DurableEventBus } from "../../events/DurableEventBus";
import type { KnowledgeDocument, OKFFrontmatter } from "../knowledge/OKFContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import { MemoryWriter } from "../writer/MemoryWriter";
import type { CandidateMemoryProposal } from "../writer/MemoryWriterContracts";
import type { IMemoryFabricLedger } from "./MemoryFabricContracts";
import type {
  MemoryFabricHealth,
  MemoryFabricLedgerRecord,
  MemoryFabricProjection,
  MemoryFabricSourceEnvelope,
} from "./MemoryFabricContracts";
import { MemoryFabricProjectionService } from "./MemoryFabricProjection";

export interface MemoryFabricBridgeConfig {
  readonly enabled?: boolean;
  readonly vaultPath?: string;
  readonly batchSize?: number;
  readonly reconciliationIntervalMs?: number;
  readonly changeStreamRetryMs?: number;
  readonly rawMaxChars?: number;
  readonly candidateMaxChars?: number;
  readonly watchedCollections?: readonly string[];
}

const DEFAULT_COLLECTIONS = [
  "cases",
  "decisions",
  "leases",
  "memories",
  "missions",
  "task_dags",
  "world_state",
  "slayer_reputations",
  "healer_reputations",
] as const;

const HIGH_SIGNAL_EVENT_TYPES = new Set([
  "CASE_CREATED",
  "CASE_RESOLVED",
  "CASE_ESCALATED",
  "WORKER_FAILED",
  "WORKER_RECOVERED",
  "ROOT_CAUSE_IDENTIFIED",
  "REPAIR_COMPLETED",
  "VERIFICATION_PASSED",
  "VERIFICATION_FAILED",
  "RUN_FAILED",
  "RUN_COMPLETED",
  "MISSION_COMPLETED",
  "MISSION_FAILED",
  "MISSION_TERMINATED",
  "MISSION_BUDGET_EXCEEDED",
  "TASK_COMPLETED",
  "DELIVERY_COMPLETED",
  "FLOOR_STATUS_CHANGED",
]);

const HIGH_SIGNAL_OPERATIONAL_COLLECTIONS = new Set([
  "cases",
  "decisions",
  "missions",
]);

const TERMINAL_MONGO_STATUS = new Set([
  "RESOLVED",
  "FAILED",
  "COMPLETED",
  "TERMINATED",
  "CANCELLED",
  "SUPERSEDED",
]);

export class MemoryFabricBridge {
  private readonly enabled: boolean;
  private readonly vaultPath: string;
  private readonly batchSize: number;
  private readonly reconciliationIntervalMs: number;
  private readonly changeStreamRetryMs: number;
  private readonly rawMaxChars: number;
  private readonly candidateMaxChars: number;
  private readonly watchedCollections: ReadonlySet<string>;
  private readonly projectionService: MemoryFabricProjectionService;

  private running = false;
  private unsubscribeEventBus?: () => void;
  private changeStream: { close: () => Promise<void> } | null = null;
  private reconciliationTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private projectionTimer: NodeJS.Timeout | null = null;
  private changeStreamAvailable = false;
  private mode: MemoryFabricHealth["mode"] = "DISABLED";
  private lastIngestAt?: string;
  private lastProcessedAt?: string;
  private lastError?: string;
  private totalIngested = 0;

  constructor(
    private readonly eventBus: DurableEventBus,
    private readonly knowledgeStore: KnowledgeStore,
    private readonly memoryWriter: MemoryWriter,
    private readonly ledger: IMemoryFabricLedger,
    private readonly mongoDb?: Db | null,
    config: MemoryFabricBridgeConfig = {},
  ) {
    this.enabled = config.enabled !== false;
    this.vaultPath = path.resolve(config.vaultPath || "knowledge");
    this.batchSize = Math.max(1, config.batchSize || 25);
    this.reconciliationIntervalMs = Math.max(5000, config.reconciliationIntervalMs || 60000);
    this.changeStreamRetryMs = Math.max(5000, config.changeStreamRetryMs || 15000);
    this.rawMaxChars = Math.max(1000, config.rawMaxChars || 12000);
    this.candidateMaxChars = Math.max(1000, config.candidateMaxChars || 9000);
    this.watchedCollections = new Set(
      config.watchedCollections?.length ? config.watchedCollections : DEFAULT_COLLECTIONS,
    );
    this.projectionService = new MemoryFabricProjectionService(
      this.knowledgeStore,
      this.memoryWriter,
    );

    if (!this.enabled) {
      this.mode = "DISABLED";
    } else if (!this.mongoDb) {
      this.mode = "EVENT_ONLY";
    } else {
      this.mode = "MONGO_RECONCILIATION";
    }
  }

  async start(): Promise<void> {
    if (this.running || !this.enabled) return;

    this.running = true;
    await this.ledger.initialize();

    this.unsubscribeEventBus = this.eventBus.subscribeWildcard((event) => {
      void this.ingestDurableEvent(event as EventEnvelope).catch((error) => {
        this.lastError = this.errorMessage(error);
      });
    });

    await this.drain();

    if (this.mongoDb) {
      await this.startChangeStream();

      this.reconciliationTimer = setInterval(() => {
        void this.reconcileMongo().catch((error) => {
          this.lastError = this.errorMessage(error);
        });
      }, this.reconciliationIntervalMs);

      this.projectionTimer = setInterval(() => {
        void this.refreshAscalonProjection().catch((error) => {
          this.lastError = this.errorMessage(error);
        });
      }, Math.max(30000, this.reconciliationIntervalMs));
    }

    await this.refreshAscalonProjection();
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.unsubscribeEventBus) {
      this.unsubscribeEventBus();
      this.unsubscribeEventBus = undefined;
    }

    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = null;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.projectionTimer) {
      clearInterval(this.projectionTimer);
      this.projectionTimer = null;
    }

    if (this.changeStream) {
      try {
        await this.changeStream.close();
      } catch {
        // Shutdown is best effort; runtime authority is independent of the fabric.
      }
      this.changeStream = null;
    }
  }

  async drain(limit = this.batchSize): Promise<void> {
    if (!this.enabled) return;

    const pending = await this.ledger.listPending(limit);
    for (const record of pending) {
      try {
        await this.processLedgerRecord(record);
      } catch (error) {
        await this.ledger.update(record.sourceKey, {
          status: "FAILED",
          qualityState: "QUARANTINED",
          lifecycle: "ARCHIVED",
          error: this.errorMessage(error),
        });
        this.lastError = this.errorMessage(error);
      }
    }

    await this.promoteVerifiedCandidates();
  }

  async projectForAgent(query: string, maxItems = 12, maxChars = 12000): Promise<MemoryFabricProjection> {
    return this.projectionService.projectForAgent(query, maxItems, maxChars);
  }

  async projectForAscalon(query = "", maxItems = 32, maxChars = 24000): Promise<MemoryFabricProjection> {
    return this.projectionService.projectForAscalon(query, maxItems, maxChars);
  }

  async getHealth(): Promise<MemoryFabricHealth> {
    const [pending, failed, quarantined] = await Promise.all([
      this.ledger.countByStatus("INGESTED"),
      this.ledger.countByStatus("FAILED"),
      this.ledger.countByStatus("QUARANTINED"),
    ]);

    return {
      enabled: this.enabled,
      mode: this.mode,
      running: this.running,
      pending,
      failed,
      quarantined,
      totalIngested: this.totalIngested,
      lastIngestAt: this.lastIngestAt,
      lastProcessedAt: this.lastProcessedAt,
      lastError: this.lastError,
      changeStreamAvailable: this.changeStreamAvailable,
      vaultPath: this.vaultPath,
    };
  }

  private async ingestDurableEvent(event: EventEnvelope): Promise<void> {
    const payload = this.sanitizeObject(event.payload);

    const source: MemoryFabricSourceEnvelope = {
      sourceKey: "event:" + event.eventId,
      sourceKind: "DURABLE_EVENT",
      sourceId: event.eventId,
      sourceType: event.topic,
      occurredAt: event.timestamp,
      capturedAt: new Date().toISOString(),
      correlationId: event.correlationId,
      summary: event.topic + " from " + event.source,
      payload,
      sourceVersion: event.schemaVersion,
    };

    await this.ingest(source);
  }

  private async ingest(source: MemoryFabricSourceEnvelope): Promise<void> {
    if (!this.enabled) return;

    const payloadJson = this.stableJson(source.payload);
    const sourceHash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");
    const qualityState = source.payload["quarantine"] === true ? "QUARANTINED" : "UNVERIFIED";
    const qualityScore = this.computeQualityScore(source, qualityState);
    const now = new Date().toISOString();

    const record: MemoryFabricLedgerRecord = {
      sourceKey: source.sourceKey,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      sourceCollection: source.sourceCollection,
      sourceDocumentId: source.sourceDocumentId,
      occurredAt: source.occurredAt,
      capturedAt: source.capturedAt,
      correlationId: source.correlationId,
      summary: source.summary,
      payloadJson: this.memoryWriter.sanitizeSecrets(payloadJson).slice(0, this.rawMaxChars),
      sourceHash,
      sourceVersion: source.sourceVersion,
      conflictGroup: source.conflictGroup,
      status: "INGESTED",
      lifecycle: "OBSERVATION",
      qualityState,
      qualityScore,
      createdAt: now,
      updatedAt: now,
    };

    const inserted = await this.ledger.insertIfAbsent(record);
    if (!inserted) return;

    this.totalIngested += 1;
    this.lastIngestAt = now;

    try {
      await this.processLedgerRecord(record);
    } catch (error) {
      await this.ledger.update(record.sourceKey, {
        status: "FAILED",
        qualityState: "QUARANTINED",
        lifecycle: "ARCHIVED",
        error: this.errorMessage(error),
      });
      throw error;
    }
  }

  private async processLedgerRecord(record: MemoryFabricLedgerRecord): Promise<void> {
    const raw = await this.materializeRaw(record);
    const highSignal = this.shouldCompileCandidate(record);

    if (!highSignal) {
      await this.ledger.update(record.sourceKey, {
        status: "MATERIALIZED",
        lifecycle: "OBSERVATION",
        rawPath: raw.filePath,
        processedAt: new Date().toISOString(),
      });
      this.lastProcessedAt = new Date().toISOString();
      return;
    }

    const candidate = await this.materializeCandidate(record, raw);

    await this.ledger.update(record.sourceKey, {
      status: "CANDIDATE",
      lifecycle: "CANDIDATE",
      rawPath: raw.filePath,
      candidatePath: candidate.filePath,
      processedAt: new Date().toISOString(),
    });

    this.lastProcessedAt = new Date().toISOString();
    await this.tryExplicitPromotion(record, candidate);
  }

  private async materializeRaw(record: MemoryFabricLedgerRecord): Promise<KnowledgeDocument> {
    const id = "memory-raw-" + record.sourceHash.slice(0, 24);
    const existing = this.knowledgeStore.get(id);
    if (existing) return existing;

    const body = [
      "# Raw Memory Observation",
      "",
      "- Source kind: " + record.sourceKind,
      "- Source type: " + record.sourceType,
      record.sourceCollection ? "- Collection: " + record.sourceCollection : "",
      record.sourceDocumentId ? "- Document: " + record.sourceDocumentId : "",
      "- Occurred: " + record.occurredAt,
      "- Captured: " + record.capturedAt,
      "- Source hash: " + record.sourceHash,
      "",
      "## Sanitized payload",
      "",
      "~~~json",
      record.payloadJson.slice(0, this.rawMaxChars),
      "~~~",
    ].filter(Boolean).join("\n");

    const provenanceType = record.sourceKind === "DURABLE_EVENT" ? "RUNTIME_EVENT" : "DATABASE_CHANGE";

    const frontmatter: OKFFrontmatter = {
      id,
      sf_id: id,
      type: "observation",
      title: "Raw memory — " + record.sourceType + " — " + record.sourceId,
      description: "Immutable sanitized observation captured by the live ShortForge Memory Fabric.",
      status: "draft",
      sf_lifecycle: "active",
      sf_epistemic_state: "observed",
      sf_verification_state: "unverified",
      sf_quality_state: record.qualityState,
      sf_memory_quality_score: record.qualityScore,
      sf_source_hash: record.sourceHash,
      sf_source_kind: record.sourceKind,
      sf_source_collection: record.sourceCollection,
      sf_source_document_id: record.sourceDocumentId,
      sf_memory_record_key: record.sourceKey,
      sf_occurred_at: record.occurredAt,
      sf_valid_from: record.occurredAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      tags: ["shortforge", "memory-fabric", "raw", "unverified"],
      sf_provenance: {
        source_type: provenanceType,
        source_id: record.sourceId,
        path: record.sourceCollection,
        captured_at: record.capturedAt,
      },
      provenance: {
        source_type: provenanceType,
        source_id: record.sourceId,
        path: record.sourceCollection,
        captured_at: record.capturedAt,
      },
    };

    return this.knowledgeStore.create({
      frontmatter,
      content: body,
      subDir: "obsidian/raw/runtime",
    });
  }

  private async materializeCandidate(
    record: MemoryFabricLedgerRecord,
    raw: KnowledgeDocument,
  ): Promise<KnowledgeDocument> {
    const id = "memory-candidate-" + record.sourceHash.slice(0, 24);
    const existing = this.knowledgeStore.get(id);
    if (existing) return existing;

    const payload = this.safeParseJson(record.payloadJson);
    const classification = this.classifyCandidate(record, payload);
    const body = [
      "# " + classification.title,
      "",
      "## Observation",
      record.summary,
      "",
      "## Evidence lineage",
      "- Raw observation: [[" + raw.frontmatter.id + "]]",
      "- Source hash: " + record.sourceHash,
      record.correlationId ? "- Correlation: " + record.correlationId : "",
      "",
      "## Structured payload",
      "",
      "~~~json",
      record.payloadJson.slice(0, this.candidateMaxChars),
      "~~~",
      "",
      "## Promotion rule",
      "This note is a candidate memory. It must acquire explicit evidence/verification before it can become active durable knowledge or Ascalon training memory.",
    ].filter(Boolean).join("\n");

    const conflictGroup = record.conflictGroup || classification.conflictGroup;
    const frontmatter: OKFFrontmatter = {
      id,
      sf_id: id,
      type: classification.type,
      title: classification.title,
      description: "Compiled candidate derived from a measured ShortForge runtime observation.",
      status: "draft",
      sf_lifecycle: "candidate",
      sf_epistemic_state: "observed",
      sf_verification_state: "unverified",
      sf_quality_state: "UNVERIFIED",
      sf_memory_quality_score: Math.min(0.79, record.qualityScore + 0.18),
      sf_source_hash: record.sourceHash,
      sf_source_kind: record.sourceKind,
      sf_source_collection: record.sourceCollection,
      sf_source_document_id: record.sourceDocumentId,
      sf_memory_record_key: record.sourceKey,
      sf_conflict_group: conflictGroup,
      sf_occurred_at: record.occurredAt,
      sf_valid_from: record.occurredAt,
      stale_after: new Date(new Date(record.occurredAt).getTime() + 30 * 86400000).toISOString(),
      created_at: record.createdAt,
      updated_at: new Date().toISOString(),
      tags: ["shortforge", "memory-fabric", "candidate", classification.type],
      sf_provenance: {
        source_type: record.sourceKind === "DURABLE_EVENT" ? "RUNTIME_EVENT" : "DATABASE_CHANGE",
        source_id: record.sourceId,
        path: record.sourceCollection,
        captured_at: record.capturedAt,
      },
      provenance: {
        source_type: record.sourceKind === "DURABLE_EVENT" ? "RUNTIME_EVENT" : "DATABASE_CHANGE",
        source_id: record.sourceId,
        path: record.sourceCollection,
        captured_at: record.capturedAt,
      },
      evidence_refs: [raw.frontmatter.id],
      training_eligible: false,
    };

    return this.knowledgeStore.create({
      frontmatter,
      content: body,
      subDir: "obsidian/candidates",
    });
  }

  private async tryExplicitPromotion(
    record: MemoryFabricLedgerRecord,
    candidate: KnowledgeDocument,
  ): Promise<void> {
    const payload = this.safeParseJson(record.payloadJson);
    const promotion = payload["memoryPromotion"];

    if (!promotion || typeof promotion !== "object") return;

    const promotionRecord = promotion as Record<string, unknown>;
    if (promotionRecord.status !== "VERIFIED" || !promotionRecord.evidenceReference) return;

    const evidence = promotionRecord.verificationEvidence;
    if (!evidence || typeof evidence !== "object") return;

    const proposal: CandidateMemoryProposal = {
      title: candidate.frontmatter.title || "Verified memory",
      type: candidate.frontmatter.type || "fact",
      content: candidate.content,
      tags: candidate.frontmatter.tags,
      provenance: candidate.frontmatter.sf_provenance || candidate.frontmatter.provenance || {
        source_type: "RUNTIME_EVENT",
        source_id: record.sourceId,
        captured_at: record.capturedAt,
      },
      isVerified: true,
      verificationEvidence: evidence,
      isDisputed: false,
    };

    const policy = this.memoryWriter.evaluatePolicy(proposal);
    if (!policy.accepted) return;

    const promoted = await this.promoteCandidateDocument(
      candidate,
      String(promotionRecord.evidenceReference),
    );

    await this.handleConflictSupersession(promoted);

    await this.ledger.update(record.sourceKey, {
      status: "PROMOTED",
      lifecycle: "ACTIVE",
      qualityState: "VALID",
      qualityScore: Math.max(0.9, Number(candidate.frontmatter.sf_memory_quality_score || 0)),
      promotedPath: promoted.filePath,
      processedAt: new Date().toISOString(),
    });
  }

  private async promoteVerifiedCandidates(): Promise<void> {
    const candidates = this.knowledgeStore.list({
      sf_lifecycle: "candidate",
      sf_verification_state: "verified",
    });

    for (const candidate of candidates) {
      try {
        const evidenceRefs = candidate.frontmatter.evidence_refs;
        const verified = candidate.frontmatter.verified;
        if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) continue;
        if (!Array.isArray(verified) || verified.length === 0) continue;

        const proposal: CandidateMemoryProposal = {
          title: candidate.frontmatter.title || "Verified memory",
          type: candidate.frontmatter.type || "fact",
          content: candidate.content,
          tags: candidate.frontmatter.tags,
          provenance: candidate.frontmatter.sf_provenance || candidate.frontmatter.provenance || {
            source_type: "RUNTIME_EVENT",
            source_id: String(candidate.frontmatter.id),
            captured_at: new Date().toISOString(),
          },
          isVerified: true,
          isDisputed: false,
        };

        const policy = this.memoryWriter.evaluatePolicy(proposal);
        if (!policy.accepted) continue;

        const promoted = await this.promoteCandidateDocument(
          candidate,
          String(evidenceRefs[0]),
        );

        await this.handleConflictSupersession(promoted);

        const memoryKey = candidate.frontmatter.sf_memory_record_key;
        if (typeof memoryKey === "string") {
          await this.ledger.update(memoryKey, {
            status: "PROMOTED",
            lifecycle: "ACTIVE",
            qualityState: "VALID",
            qualityScore: 0.95,
            promotedPath: promoted.filePath,
            processedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.lastError = this.errorMessage(error);
      }
    }
  }

  private async promoteCandidateDocument(
    candidate: KnowledgeDocument,
    evidenceReference: string,
  ): Promise<KnowledgeDocument> {
    const now = new Date().toISOString();

    return this.knowledgeStore.update(candidate.frontmatter.id, {
      frontmatter: {
        status: "stable",
        sf_lifecycle: "active",
        sf_epistemic_state: "sourced",
        sf_verification_state: "verified",
        sf_quality_state: "VALID",
        sf_memory_quality_score: 0.95,
        sf_promoted_from: candidate.frontmatter.id,
        sf_promoted_at: now,
        sf_evidence_reference: evidenceReference,
        training_eligible: false,
        stale_after: undefined,
        sf_valid_until: undefined,
        valid_until: undefined,
        updated_at: now,
      },
      content: [
        candidate.content,
        "",
        "## Promotion",
        "- Verification evidence: " + evidenceReference,
        "- Promoted at: " + now,
        "- Promotion is non-authoritative for runtime state; this note is cognitive memory only.",
      ].join("\n"),
    });
  }

  private async handleConflictSupersession(promoted: KnowledgeDocument): Promise<void> {
    const conflictGroup = promoted.frontmatter.sf_conflict_group;
    if (typeof conflictGroup !== "string" || !conflictGroup) return;

    const activeDocs = this.knowledgeStore.list({ sf_lifecycle: "active" });
    for (const prior of activeDocs) {
      if (prior.frontmatter.id === promoted.frontmatter.id) continue;
      if (prior.frontmatter.sf_conflict_group !== conflictGroup) continue;
      await this.knowledgeStore.supersede(prior.frontmatter.id, promoted.frontmatter.id);
    }
  }

  private async startChangeStream(): Promise<void> {
    if (!this.mongoDb || !this.running) return;

    const streamKey = "mongo:" + this.vaultPath;
    const storedOffset = await this.ledger.getOffset(streamKey);
    let resumeAfter: unknown = undefined;

    if (storedOffset?.resumeTokenJson) {
      try {
        resumeAfter = EJSON.parse(storedOffset.resumeTokenJson);
      } catch {
        this.lastError = "Stored MongoDB change-stream resume token could not be decoded; starting from current time.";
      }
    }

    try {
      const stream = this.mongoDb.watch(
        [
          {
            $match: {
              operationType: { $in: ["insert", "update", "replace"] },
              "ns.coll": { $in: [...this.watchedCollections] },
            },
          },
        ],
        {
          fullDocument: "updateLookup",
          ...(resumeAfter ? { resumeAfter } : {}),
        },
      );

      this.changeStream = stream;
      this.changeStreamAvailable = true;
      this.mode = "MONGO_CHANGE_STREAM";

      stream.on("change", (change: Record<string, unknown>) => {
        void this.handleMongoChange(change).catch((error) => {
          this.lastError = this.errorMessage(error);
        });
      });

      stream.on("error", (error: Error) => {
        this.changeStreamAvailable = false;
        this.mode = "MONGO_RECONCILIATION";
        this.lastError = "MongoDB change stream error: " + error.message;
        void this.scheduleChangeStreamRetry();
      });

      stream.on("close", () => {
        this.changeStreamAvailable = false;
        if (this.running) {
          this.mode = "MONGO_RECONCILIATION";
          void this.scheduleChangeStreamRetry();
        }
      });
    } catch (error) {
      this.changeStreamAvailable = false;
      this.mode = "MONGO_RECONCILIATION";
      this.lastError = this.errorMessage(error);
      await this.scheduleChangeStreamRetry();
    }
  }

  private async scheduleChangeStreamRetry(): Promise<void> {
    if (!this.running || this.retryTimer) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.startChangeStream();
    }, this.changeStreamRetryMs);
  }

  private async handleMongoChange(change: Record<string, unknown>): Promise<void> {
    const ns = (change["ns"] || {}) as Record<string, unknown>;
    const collection = String(ns["coll"] || "");
    if (!this.watchedCollections.has(collection)) return;

    const documentKey = (change["documentKey"] || {}) as Record<string, unknown>;
    const documentId = String(documentKey["_id"] || "unknown");
    const fullDocument = this.sanitizeObject(change["fullDocument"] || {});
    const operationType = String(change["operationType"] || "unknown");
    const clusterTime = change["clusterTime"] ? EJSON.stringify(change["clusterTime"]) : undefined;

    const occurredAt = this.extractOccurrenceTime(fullDocument) || new Date().toISOString();
    const payload = {
      operationType,
      collection,
      documentId,
      document: fullDocument,
    } as Record<string, unknown>;

    const sourceHash = crypto.createHash("sha256").update(this.stableJson(payload), "utf8").digest("hex");
    const source: MemoryFabricSourceEnvelope = {
      sourceKey: "mongo:" + collection + ":" + documentId + ":" + sourceHash.slice(0, 24),
      sourceKind: "MONGO_CHANGE",
      sourceId: sourceHash,
      sourceType: "mongo." + operationType + "." + collection,
      sourceCollection: collection,
      sourceDocumentId: documentId,
      occurredAt,
      capturedAt: new Date().toISOString(),
      correlationId: this.extractCorrelationId(fullDocument),
      summary: "MongoDB " + operationType + " on " + collection + "/" + documentId,
      payload,
      sourceVersion: clusterTime,
      conflictGroup: this.extractConflictGroup(collection, fullDocument),
    };

    await this.ingest(source);

    const streamKey = "mongo:" + this.vaultPath;
    if (change["_id"]) {
      await this.ledger.setOffset({
        streamKey,
        resumeTokenJson: EJSON.stringify(change["_id"]),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private async reconcileMongo(): Promise<void> {
    if (!this.mongoDb || !this.running) return;

    for (const collectionName of this.watchedCollections) {
      try {
        const collection = this.mongoDb.collection(collectionName);
        const docs = await collection
          .find({})
          .sort({ updatedAt: -1, createdAt: -1, timestamp: -1, sequenceNumber: -1, _id: -1 })
          .limit(Math.min(this.batchSize, 20))
          .toArray();

        for (const raw of docs) {
          const fullDocument = this.sanitizeObject(raw as Record<string, unknown>);
          const documentId = String((raw as Record<string, unknown>)["_id"] || "unknown");
          const sourcePayload = {
            reconciliation: true,
            collection: collectionName,
            documentId,
            document: fullDocument,
          } as Record<string, unknown>;

          const sourceHash = crypto.createHash("sha256").update(
            this.stableJson(sourcePayload),
            "utf8",
          ).digest("hex");

          const source: MemoryFabricSourceEnvelope = {
            sourceKey: "mongo-reconcile:" + collectionName + ":" + documentId + ":" + sourceHash.slice(0, 24),
            sourceKind: "MONGO_RECONCILIATION",
            sourceId: sourceHash,
            sourceType: "mongo.reconcile." + collectionName,
            sourceCollection: collectionName,
            sourceDocumentId: documentId,
            occurredAt: this.extractOccurrenceTime(fullDocument) || new Date().toISOString(),
            capturedAt: new Date().toISOString(),
            correlationId: this.extractCorrelationId(fullDocument),
            summary: "MongoDB reconciliation snapshot for " + collectionName + "/" + documentId,
            payload: sourcePayload,
            conflictGroup: this.extractConflictGroup(collectionName, fullDocument),
          };

          await this.ingest(source);
        }
      } catch (error) {
        this.lastError =
          "MongoDB reconciliation failed for " +
          collectionName +
          ": " +
          this.errorMessage(error);
      }
    }
  }

  private async refreshAscalonProjection(): Promise<void> {
    if (!this.running || !this.enabled) return;

    const projection = await this.projectionService.projectForAscalon("", 64, 30000);
    const dir = path.join(this.vaultPath, "obsidian", "generated", "ascalon");
    const file = path.join(dir, "ACTIVE_MEMORY_PROJECTION.md");

    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });

    const lines = [
      "---",
      "type: reference",
      "title: ShortForge Ascalon Memory Projection",
      "status: stable",
      "id: shortforge-ascalon-memory-projection",
      "sf_id: shortforge-ascalon-memory-projection",
      "sf_lifecycle: active",
      "sf_epistemic_state: sourced",
      "sf_verification_state: verified",
      "created_at: " + projection.generatedAt,
      "updated_at: " + projection.generatedAt,
      "tags:",
      "  - shortforge",
      "  - ascalon",
      "  - generated",
      "---",
      "",
      "# Active Ascalon Memory Projection",
      "",
      "Generated at " +
        projection.generatedAt +
        ". Only verified, active, non-stale memories explicitly marked training-eligible are eligible for this projection.",
      "",
    ];

    for (const item of projection.items) {
      lines.push("## " + item.title);
      lines.push("");
      lines.push("- ID: " + item.id);
      lines.push("- Quality: " + item.qualityState + " (" + item.qualityScore.toFixed(2) + ")");
      lines.push("- Provenance: " + item.provenance);
      lines.push("");
      lines.push(item.content);
      lines.push("");
    }

    await fs.writeFile(file, lines.join("\n"), "utf8");
  }

  private shouldCompileCandidate(record: MemoryFabricLedgerRecord): boolean {
    if (record.qualityState === "QUARANTINED") return false;

    if (record.sourceKind === "DURABLE_EVENT") {
      return HIGH_SIGNAL_EVENT_TYPES.has(record.sourceType);
    }

    if (record.sourceCollection && HIGH_SIGNAL_OPERATIONAL_COLLECTIONS.has(record.sourceCollection)) {
      const payload = this.safeParseJson(record.payloadJson);
      const document = (payload["document"] || {}) as Record<string, unknown>;
      const status = String(document["status"] || "").toUpperCase();

      return (
        record.sourceCollection === "decisions" ||
        TERMINAL_MONGO_STATUS.has(status) ||
        Boolean(document["resolution"])
      );
    }

    if (record.sourceCollection === "memories") {
      const payload = this.safeParseJson(record.payloadJson);
      const document = (payload["document"] || {}) as Record<string, unknown>;
      return ["SEMANTIC", "CASE", "TRANSITION"].includes(
        String(document["layer"] || "").toUpperCase(),
      );
    }

    return false;
  }

  private classifyCandidate(
    record: MemoryFabricLedgerRecord,
    _payload: Record<string, unknown>,
  ): { type: "observation" | "incident"; title: string; conflictGroup?: string } {
    const failureLike = /(FAILED|ANOMALY|ESCALATED|BUDGET_EXCEEDED|CANCELLED)/i.test(record.sourceType);

    if (failureLike) {
      return {
        type: "incident",
        title: "Operational incident — " + record.sourceType,
        conflictGroup: record.conflictGroup || undefined,
      };
    }

    return {
      type: "observation",
      title: "Verified-path candidate — " + record.sourceType,
      conflictGroup: record.conflictGroup || undefined,
    };
  }

  private computeQualityScore(
    source: MemoryFabricSourceEnvelope,
    state: "UNVERIFIED" | "QUARANTINED",
  ): number {
    if (state === "QUARANTINED") return 0.0;

    let score = 0.2;

    if (source.sourceKind === "DURABLE_EVENT") score += 0.15;
    if (source.sourceKind === "MONGO_CHANGE") score += 0.2;
    if (source.sourceKind === "MONGO_RECONCILIATION") score += 0.1;
    if (source.correlationId) score += 0.1;
    if (source.sourceDocumentId) score += 0.1;
    if (source.sourceVersion) score += 0.1;

    const ageMs = Date.now() - new Date(source.occurredAt).getTime();
    if (Number.isFinite(ageMs) && ageMs < 24 * 3600 * 1000) score += 0.05;

    return Math.min(1, Number(score.toFixed(3)));
  }

  private extractOccurrenceTime(document: Record<string, unknown>): string | undefined {
    const candidates = ["occurredAt", "updatedAt", "createdAt", "timestamp", "lastAccessedAt"];

    for (const key of candidates) {
      const value = document[key];
      if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
        return value;
      }
    }

    return undefined;
  }

  private extractCorrelationId(document: Record<string, unknown>): string | undefined {
    const candidates = ["correlationId", "missionId", "caseId", "decisionId", "dagId", "taskId"];

    for (const key of candidates) {
      const value = document[key];
      if (typeof value === "string" && value) return value;
    }

    return undefined;
  }

  private extractConflictGroup(
    collection: string,
    document: Record<string, unknown>,
  ): string | undefined {
    const explicit = document["conflictGroup"];
    if (typeof explicit === "string" && explicit) return explicit;

    if (collection === "decisions") {
      const goalId = document["goalId"];
      if (typeof goalId === "string" && goalId) return "decision-goal:" + goalId;
    }

    if (collection === "missions") {
      const missionId = document["missionId"];
      if (typeof missionId === "string" && missionId) return "mission:" + missionId + ":status";
    }

    return undefined;
  }

  private safeParseJson(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private sanitizeObject(value: unknown, depth = 0): Record<string, unknown> {
    if (depth > 8) return { "[TRUNCATED]": true };

    if (!value || typeof value !== "object") {
      return { value: this.memoryWriter.sanitizeSecrets(String(value)) };
    }

    if (Array.isArray(value)) {
      return {
        value: value
          .slice(0, 100)
          .map((item) => this.sanitizeValue(item, depth + 1)),
      };
    }

    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(input).slice(0, 200)) {
      if (/(password|secret|token|api.?key|authorization|cookie|private.?key)/i.test(key)) {
        result[key] = "[REDACTED_SECRET]";
      } else {
        result[key] = this.sanitizeValue(raw, depth + 1);
      }
    }

    return result;
  }

  private sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > 8) return "[TRUNCATED]";
    if (typeof value === "string") return this.memoryWriter.sanitizeSecrets(value).slice(0, 4000);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => this.sanitizeValue(item, depth + 1));
    if (typeof value === "object") return this.sanitizeObject(value, depth + 1);
    return String(value);
  }

  private stableJson(value: unknown): string {
    const normalize = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(normalize);

      if (input && typeof input === "object") {
        return Object.fromEntries(
          Object.entries(input as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, normalize(v)]),
        );
      }

      return input;
    };

    return JSON.stringify(normalize(value));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
