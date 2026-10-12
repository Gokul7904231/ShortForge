import { createHash } from "node:crypto";
import type { IMemoryRepository, MemoryRecord } from "../database/DatabaseContracts";
import {
  calculateKnowledgeOSSnapshotContentDigest,
  KnowledgeOS,
  validateKnowledgeOSSnapshot,
} from "./KnowledgeOS";
import type {
  KnowledgeOSSnapshot,
  KnowledgeOSSnapshotDiff,
  KnowledgeOSSnapshotScope,
  KnowledgeOSSnapshotSource,
  KnowledgeOSSnapshotSourceKind,
} from "./KnowledgeOSContracts";

export interface StoredKnowledgeOSSnapshot {
  readonly snapshot: KnowledgeOSSnapshot;
  readonly memoryId: string;
}

const SNAPSHOT_NAMESPACE = "knowledgeos.snapshot.v1";
const MAX_HISTORY_READ = 1000;

function scopeLabel(scope: KnowledgeOSSnapshotScope): string {
  switch (scope.scope) {
    case "MISSION": return `MISSION:${scope.missionId}`;
    case "CHANNEL": return `CHANNEL:${scope.channelId}`;
    case "GLOBAL": return "GLOBAL";
  }
}

function scopeHash(scope: KnowledgeOSSnapshotScope): string {
  return createHash("sha256").update(scopeLabel(scope), "utf8").digest("hex");
}

function scopePrefix(
  scope: KnowledgeOSSnapshotScope,
  sourceKind: KnowledgeOSSnapshotSourceKind,
): string {
  return `${SNAPSHOT_NAMESPACE}:${sourceKind}:${scopeHash(scope)}:`;
}

function revisionKey(
  scope: KnowledgeOSSnapshotScope,
  sourceKind: KnowledgeOSSnapshotSourceKind,
  digest: string,
): string {
  return `${scopePrefix(scope, sourceKind)}${digest}`;
}

function revisionMemoryId(
  scope: KnowledgeOSSnapshotScope,
  sourceKind: KnowledgeOSSnapshotSourceKind,
  digest: string,
): string {
  return `ksnap_${sourceKind === "DOMAIN_KNOWLEDGEOS" ? "domain" : "okf"}_${scopeHash(scope).slice(0, 20)}_${digest}`;
}

function sameScope(left: KnowledgeOSSnapshotScope, right: KnowledgeOSSnapshotScope): boolean {
  // Compare semantic scope identity, not caller-owned object property order.
  return scopeLabel(left) === scopeLabel(right);
}

function decodeSnapshotRecord(
  record: MemoryRecord,
  expectedScope: KnowledgeOSSnapshotScope,
  expectedSourceKind: KnowledgeOSSnapshotSourceKind,
  expectedDigest?: string,
): KnowledgeOSSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.content);
  } catch {
    throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_CORRUPT");
  }

  if (!validateKnowledgeOSSnapshot(parsed)) {
    throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_CORRUPT");
  }
  if (parsed.sourceKind !== expectedSourceKind ||
      !sameScope(parsed.selection, expectedScope) ||
      !record.key.startsWith(scopePrefix(expectedScope, expectedSourceKind)) ||
      (expectedDigest && parsed.contentDigest !== expectedDigest) ||
      record.key !== revisionKey(expectedScope, expectedSourceKind, parsed.contentDigest)) {
    throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_SCOPE_OR_KEY_MISMATCH");
  }
  if (calculateKnowledgeOSSnapshotContentDigest(parsed) !== parsed.contentDigest) {
    throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_DIGEST_MISMATCH");
  }
  return parsed;
}

/**
 * Append-by-content-revision history over ShortForge's existing IMemoryRepository.
 * No new datastore is introduced; durability is exactly that of the injected repository.
 */
export class KnowledgeOSSnapshotHistory {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly sourceKind: KnowledgeOSSnapshotSourceKind = "DOMAIN_KNOWLEDGEOS",
  ) {}

  public async capture(
    source: KnowledgeOSSnapshotSource,
    selection: KnowledgeOSSnapshotScope,
  ): Promise<StoredKnowledgeOSSnapshot> {
    if (source.sourceKind !== this.sourceKind) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_SOURCE_MISMATCH");
    }
    const snapshot = source.snapshot(selection);
    if (!validateKnowledgeOSSnapshot(snapshot)) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_INVALID");
    }

    const key = revisionKey(selection, this.sourceKind, snapshot.contentDigest);
    const existing = await this.memoryRepository.getMemory("OPERATIONAL", key);
    if (existing) {
      return {
        snapshot: decodeSnapshotRecord(existing, selection, this.sourceKind, snapshot.contentDigest),
        memoryId: existing.memoryId,
      };
    }

    const now = snapshot.capturedAt;
    const record: MemoryRecord = {
      memoryId: revisionMemoryId(selection, this.sourceKind, snapshot.contentDigest),
      layer: "OPERATIONAL",
      key,
      content: JSON.stringify(snapshot),
      metadata: {
        schemaVersion: snapshot.schemaVersion,
        selection: snapshot.selection,
        contentDigest: snapshot.contentDigest,
        recordCount: snapshot.records.length,
        relationshipCount: snapshot.relationships.length,
        verificationStatus: "UNVERIFIED",
        confidenceSemantics: "snapshot byte/content integrity only; not epistemic truth",
      },
      // A snapshot is an integrity artifact, not an epistemically trusted fact.
      confidence: 0,
      accessCount: 0,
      createdAt: now,
      lastAccessedAt: now,
    };

    await this.memoryRepository.saveMemory(record);
    const persisted = await this.memoryRepository.getMemory("OPERATIONAL", key);
    if (!persisted) throw new Error("KNOWLEDGEOS_SNAPSHOT_PERSISTENCE_FAILED");

    return {
      snapshot: decodeSnapshotRecord(persisted, selection, this.sourceKind, snapshot.contentDigest),
      memoryId: persisted.memoryId,
    };
  }

  public async load(
    selection: KnowledgeOSSnapshotScope,
    contentDigest: string,
  ): Promise<KnowledgeOSSnapshot | null> {
    if (!/^[a-f0-9]{64}$/.test(contentDigest)) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_INVALID_DIGEST");
    }
    const record = await this.memoryRepository.getMemory(
      "OPERATIONAL",
      revisionKey(selection, this.sourceKind, contentDigest),
    );
    return record ? decodeSnapshotRecord(record, selection, this.sourceKind, contentDigest) : null;
  }

  /** Chronological content revisions; identical content digests are idempotent. */
  public async list(
    selection: KnowledgeOSSnapshotScope,
    limit = 100,
  ): Promise<KnowledgeOSSnapshot[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_INVALID_LIMIT");
    }
    const prefix = scopePrefix(selection, this.sourceKind);
    const records = await this.memoryRepository.queryMemories(
      "OPERATIONAL",
      prefix,
      MAX_HISTORY_READ + 1,
    );
    if (records.length > MAX_HISTORY_READ) {
      // Never return a silently truncated revision history as if it were complete.
      throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_READ_LIMIT_EXCEEDED");
    }
    const snapshots = records
      .filter((record) => record.key.startsWith(prefix))
      .map((record) => decodeSnapshotRecord(record, selection, this.sourceKind));
    snapshots.sort((left, right) =>
      left.capturedAt.localeCompare(right.capturedAt) ||
      left.contentDigest.localeCompare(right.contentDigest)
    );
    return snapshots.slice(-limit);
  }

  public async latest(selection: KnowledgeOSSnapshotScope): Promise<KnowledgeOSSnapshot | null> {
    const revisions = await this.list(selection, 100);
    return revisions.length ? revisions[revisions.length - 1] : null;
  }

  public async diff(
    selection: KnowledgeOSSnapshotScope,
    baseDigest: string,
    targetDigest: string,
  ): Promise<KnowledgeOSSnapshotDiff> {
    const [base, target] = await Promise.all([
      this.load(selection, baseDigest),
      this.load(selection, targetDigest),
    ]);
    if (!base || !target) throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_REVISION_NOT_FOUND");
    return KnowledgeOS.diffSnapshots(base, target);
  }
}
