import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DiskMemoryRepository } from "../core/database/PersistentDiskDatabase";
import type { IMemoryRepository, MemoryRecord } from "../core/database/DatabaseContracts";
import { KnowledgeOS } from "../core/knowledge/KnowledgeOS";
import { KnowledgeOSSnapshotHistory } from "../core/knowledge/KnowledgeOSSnapshotHistory";

class FixtureMemoryRepository implements IMemoryRepository {
  private readonly records = new Map<string, MemoryRecord>();

  async saveMemory(record: MemoryRecord): Promise<void> {
    this.records.set(record.memoryId, structuredClone(record));
  }

  async getMemory(layer: MemoryRecord["layer"], key: string): Promise<MemoryRecord | null> {
    const record = [...this.records.values()].find((item) => item.layer === layer && item.key === key);
    return record ? structuredClone(record) : null;
  }

  async queryMemories(
    layer?: MemoryRecord["layer"],
    queryText?: string,
    limit = 50,
  ): Promise<MemoryRecord[]> {
    return [...this.records.values()]
      .filter((record) => !layer || record.layer === layer)
      .filter((record) => !queryText || record.key.includes(queryText) || record.content.includes(queryText))
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  seed(records: readonly MemoryRecord[]): void {
    for (const record of records) this.records.set(record.memoryId, structuredClone(record));
  }

  async deleteMemory(memoryId: string): Promise<void> {
    this.records.delete(memoryId);
  }
}

describe("KnowledgeOS snapshot history backed by MemoryRepository", () => {
  it("stores content-addressed revisions and reloads them through a fresh history instance", async () => {
    const memory = new FixtureMemoryRepository();
    const history = new KnowledgeOSSnapshotHistory(memory);
    const knowledge = new KnowledgeOS();

    knowledge.storeSource({
      url: "https://example.com/research",
      title: "Initial source",
      publisher: "Example",
      snippet: "First snapshot revision",
      reliabilityScore: 0.9,
      scope: "GLOBAL",
    });

    const first = await history.capture(knowledge, { scope: "GLOBAL" });
    const duplicateCapture = await new KnowledgeOSSnapshotHistory(memory).capture(knowledge, { scope: "GLOBAL" });
    expect(duplicateCapture.memoryId).toBe(first.memoryId);
    expect((await history.list({ scope: "GLOBAL" })).map((item) => item.contentDigest)).toEqual([
      first.snapshot.contentDigest,
    ]);

    knowledge.updateTopicSaturation("Agent retrieval", 0.4);
    const second = await history.capture(knowledge, { scope: "GLOBAL" });
    const reloadedHistory = new KnowledgeOSSnapshotHistory(memory);
    const revisions = await reloadedHistory.list({ scope: "GLOBAL" });
    expect(revisions).toHaveLength(2);
    expect((await reloadedHistory.load({ scope: "GLOBAL" }, first.snapshot.contentDigest))?.contentDigest)
      .toBe(first.snapshot.contentDigest);
    expect((await reloadedHistory.latest({ scope: "GLOBAL" }))?.contentDigest)
      .toBe(second.snapshot.contentDigest);

    const diff = await reloadedHistory.diff(
      { scope: "GLOBAL" },
      first.snapshot.contentDigest,
      second.snapshot.contentDigest,
    );
    expect(diff.addedRecordIds).toHaveLength(1);
  });

  it("finds an exact memory key past the ordinary 50-record query limit", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "shortforge-memory-exact-lookup-"));
    try {
      const repository = new DiskMemoryRepository(baseDir);
      const now = new Date().toISOString();
      for (let index = 0; index < 65; index += 1) {
        await repository.saveMemory({
          memoryId: `fixture_${String(index).padStart(3, "0")}`,
          layer: "OPERATIONAL",
          key: `fixture:key:${index}`,
          content: `Fixture ${index}`,
          metadata: {},
          confidence: 1,
          accessCount: 0,
          createdAt: now,
          lastAccessedAt: now,
        });
      }

      await expect(repository.queryMemories("OPERATIONAL")).resolves.toHaveLength(50);
      await expect(repository.getMemory("OPERATIONAL", "fixture:key:64"))
        .resolves.toMatchObject({ memoryId: "fixture_064", key: "fixture:key:64" });
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("persists the first snapshot when the disk memory directory does not exist yet", async () => {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), "shortforge-snapshot-history-"));
    try {
      const repository = new DiskMemoryRepository(baseDir);
      const history = new KnowledgeOSSnapshotHistory(repository);
      const knowledge = new KnowledgeOS();
      knowledge.storeSource({
        url: "https://example.com/disk-history",
        title: "Disk persistence",
        publisher: "Example",
        snippet: "The first write must create its backing directory.",
        reliabilityScore: 0.8,
        scope: "GLOBAL",
      });

      const captured = await history.capture(knowledge, { scope: "GLOBAL" });
      const memoryRecord = await repository.getMemory(
        "OPERATIONAL",
        `knowledgeos.snapshot.v1:${createHash("sha256").update("GLOBAL", "utf8").digest("hex")}:${captured.snapshot.contentDigest}`,
      );
      expect(memoryRecord?.confidence).toBe(0);
      expect(memoryRecord?.metadata.verificationStatus).toBe("UNVERIFIED");

      const reloaded = new KnowledgeOSSnapshotHistory(new DiskMemoryRepository(baseDir));
      await expect(reloaded.load({ scope: "GLOBAL" }, captured.snapshot.contentDigest))
        .resolves.toMatchObject({ contentDigest: captured.snapshot.contentDigest });
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("matches scope identity independent of JavaScript object property order", async () => {
    const memory = new FixtureMemoryRepository();
    const history = new KnowledgeOSSnapshotHistory(memory);
    const knowledge = new KnowledgeOS();
    knowledge.storeSource({
      url: "https://example.com/mission-scope",
      title: "Mission source",
      publisher: "Example",
      snippet: "Scope property order must not affect lookup.",
      reliabilityScore: 0.8,
      scope: "MISSION",
      missionId: "mission-order",
    });

    const first = await history.capture(knowledge, { scope: "MISSION", missionId: "mission-order" });
    const alternativePropertyOrder = { missionId: "mission-order", scope: "MISSION" } as const;
    await expect(history.load(alternativePropertyOrder, first.snapshot.contentDigest))
      .resolves.toMatchObject({ contentDigest: first.snapshot.contentDigest });
  });

  it("fails explicitly rather than silently truncating an oversized history", async () => {
    const memory = new FixtureMemoryRepository();
    const prefix = `knowledgeos.snapshot.v1:${createHash("sha256").update("GLOBAL", "utf8").digest("hex")}:`;
    const now = new Date().toISOString();
    memory.seed(Array.from({ length: 1001 }, (_, index): MemoryRecord => ({
      memoryId: `oversized_${index}`,
      layer: "OPERATIONAL",
      key: `${prefix}${String(index).padStart(64, "0")}`,
      content: "{}",
      metadata: {},
      confidence: 0,
      accessCount: 0,
      createdAt: now,
      lastAccessedAt: now,
    })));

    await expect(new KnowledgeOSSnapshotHistory(memory).list({ scope: "GLOBAL" }))
      .rejects.toThrow("KNOWLEDGEOS_SNAPSHOT_HISTORY_READ_LIMIT_EXCEEDED");
  });

  it("rejects a corrupted stored revision instead of trusting its saved digest", async () => {
    const memory = new FixtureMemoryRepository();
    const history = new KnowledgeOSSnapshotHistory(memory);
    const knowledge = new KnowledgeOS();
    knowledge.storeSource({
      url: "https://example.com/integrity",
      title: "Integrity source",
      publisher: "Example",
      snippet: "Integrity test",
      reliabilityScore: 0.9,
      scope: "GLOBAL",
    });
    const stored = await history.capture(knowledge, { scope: "GLOBAL" });
    const records = await memory.queryMemories("OPERATIONAL");
    const persisted = records[0];
    const parsed = JSON.parse(persisted.content);
    parsed.records[0].title = "Tampered after capture";
    await memory.saveMemory({ ...persisted, content: JSON.stringify(parsed) });

    await expect(history.load({ scope: "GLOBAL" }, stored.snapshot.contentDigest))
      .rejects.toThrow("KNOWLEDGEOS_SNAPSHOT_HISTORY_CORRUPT");
  });
});
