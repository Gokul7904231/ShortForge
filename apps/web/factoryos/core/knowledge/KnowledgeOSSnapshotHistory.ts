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

function scopePrefix(scope: KnowledgeOSSnapshotScope): string {
  return `${SNAPSHOT_NAMESPACE}:${scopeHash(scope)}:`;
}

function revisionKey(scope: KnowledgeOSSnapshotScope, digest: string): string {
  return `${scopePrefix(scope)}${digest}`;
}

function revisionMemoryId(scope: KnowledgeOSSnapshotScope, digest: string): string {
  return `ksnap_${scopeHash(scope).slice(0, 24)}_${digest}`;
}

function sameScope(left: KnowledgeOSSnapshotScope, right: KnowledgeOSSnapshotScope): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function decodeSnapshotRecord(
  record: MemoryRecord,
  expectedScope: KnowledgeOSSnapshotScope,
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
  if (!sameScope(parsed.selection, expectedScope) ||
      !record.key.startsWith(scopePrefix(expectedScope)) ||
      (expectedDigest && parsed.contentDigest !== expectedDigest) ||
      record.key !== revisionKey(expectedScope, parsed.contentDigest)) {
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
  constructor(private readonly memoryRepository: IMemoryRepository) {}

  public async capture(
    knowledgeOS: KnowledgeOS,
    selection: KnowledgeOSSnapshotScope,
  ): Promise<StoredKnowledgeOSSnapshot> {
    const snapshot = knowledgeOS.snapshot(selection);
    if (!validateKnowledgeOSSnapshot(snapshot)) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_INVALID");
    }

    const key = revisionKey(selection, snapshot.contentDigest);
    const existing = await this.memoryRepository.getMemory("OPERATIONAL", key);
    if (existing) {
      return {
        snapshot: decodeSnapshotRecord(existing, selection, snapshot.contentDigest),
        memoryId: existing.memoryId,
      };
    }

    const now = snapshot.capturedAt;
    const record: MemoryRecord = {
      memoryId: revisionMemoryId(selection, snapshot.contentDigest),
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
      confidence: 1,
      accessCount: 0,
      createdAt: now,
      lastAccessedAt: now,
    };

    await this.memoryRepository.saveMemory(record);
    const persisted = await this.memoryRepository.getMemory("OPERATIONAL", key);
    if (!persisted) throw new Error("KNOWLEDGEOS_SNAPSHOT_PERSISTENCE_FAILED");

    return {
      snapshot: decodeSnapshotRecord(persisted, selection, snapshot.contentDigest),
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
      revisionKey(selection, contentDigest),
    );
    return record ? decodeSnapshotRecord(record, selection, contentDigest) : null;
  }

  /** Chronological content revisions; identical content digests are idempotent. */
  public async list(
    selection: KnowledgeOSSnapshotScope,
    limit = 100,
  ): Promise<KnowledgeOSSnapshot[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_HISTORY_INVALID_LIMIT");
    }
    const prefix = scopePrefix(selection);
    const records = await this.memoryRepository.queryMemories(
      "OPERATIONAL",
      prefix,
      MAX_HISTORY_READ,
    );
    const snapshots = records
      .filter((record) => record.key.startsWith(prefix))
      .map((record) => decodeSnapshotRecord(record, selection));
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
