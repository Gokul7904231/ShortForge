import { describe, expect, it } from "vitest";
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
