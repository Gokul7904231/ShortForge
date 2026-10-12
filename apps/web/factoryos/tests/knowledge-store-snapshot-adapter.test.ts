import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { KnowledgeStoreSnapshotAdapter } from "../core/knowledge/KnowledgeStoreSnapshotAdapter";
import { validateKnowledgeOSSnapshot } from "../core/knowledge/KnowledgeOS";

const tempDirs: string[] = [];

function writeFixture(root: string, relativePath: string, raw: string): void {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, raw, "utf8");
}

function makeStore(): KnowledgeStore {
  const root = mkdtempSync(path.join(os.tmpdir(), "shortforge-okf-snapshot-"));
  tempDirs.push(root);
  writeFixture(root, "global-guide.md", [
    "---",
    "id: global-guide",
    "sf_id: global-guide",
    "type: reference",
    "title: Global Guide",
    "status: stable",
    "tags: [retrieval, provenance]",
    "created_at: '2026-10-01T00:00:00.000Z'",
    "sources:",
    "  - id: source-guide",
    "    resource: source-guide.md",
    "evidence_refs:",
    "  - artifact://render/fixture-1",
    "---",
    "SENSITIVE_DOCUMENT_BODY must never be copied into a snapshot.",
  ].join("\n"));
  writeFixture(root, "source-guide.md", [
    "---",
    "id: source-guide",
    "type: reference",
    "title: Source Guide",
    "status: stable",
    "---",
    "A referenced document body.",
  ].join("\n"));
  writeFixture(root, "missions/alpha.md", [
    "---",
    "id: mission-alpha",
    "type: observation",
    "title: Mission Alpha",
    "mission_id: mission-alpha",
    "---",
    "Mission-scoped document.",
  ].join("\n"));
  writeFixture(root, "missions/beta.md", [
    "---",
    "id: mission-beta",
    "type: observation",
    "title: Mission Beta",
    "mission_id: mission-beta",
    "---",
    "Other mission document.",
  ].join("\n"));
  writeFixture(root, "channels/alpha.md", [
    "---",
    "id: channel-alpha",
    "type: fact",
    "title: Channel Alpha",
    "channel_id: channel-alpha",
    "---",
    "Channel-scoped document.",
  ].join("\n"));
  writeFixture(root, "private.md", [
    "---",
    "id: private-doc",
    "type: reference",
    "title: Private Config",
    "---",
    "API_KEY=not-a-real-key-for-test",
  ].join("\n"));
  writeFixture(root, "dupe-a.md", [
    "---",
    "id: duplicate-doc",
    "type: reference",
    "title: Duplicate A",
    "---",
    "first duplicate",
  ].join("\n"));
  writeFixture(root, "dupe-b.md", [
    "---",
    "id: duplicate-doc",
    "type: reference",
    "title: Duplicate B",
    "---",
    "second duplicate",
  ].join("\n"));
  return new KnowledgeStore(root);
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("KnowledgeStoreSnapshotAdapter", () => {
  it("projects only allow-listed metadata and per-document content digests", () => {
    const store = makeStore();
    const adapter = new KnowledgeStoreSnapshotAdapter(store);
    const snapshot = adapter.snapshot({ scope: "GLOBAL" });

    expect(snapshot.sourceKind).toBe("OKF_KNOWLEDGE_STORE");
    expect(validateKnowledgeOSSnapshot(snapshot)).toBe(true);
    expect(snapshot.records.map((record) => record.id)).toContain("okfdoc:global-guide");
    expect(snapshot.records.some((record) => record.id === "okfdoc:mission-alpha")).toBe(false);
    expect(snapshot.records.some((record) => record.id === "okfdoc:mission-beta")).toBe(false);
    expect(snapshot.records.some((record) => record.id === "okfdoc:channel-alpha")).toBe(false);
    expect(snapshot.records.some((record) => record.id === "okfdoc:private-doc")).toBe(false);
    expect(snapshot.records.some((record) => record.id === "okfdoc:duplicate-doc")).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("SENSITIVE_DOCUMENT_BODY");
    expect(JSON.stringify(snapshot)).not.toContain("A referenced document body.");
    const globalRecord = snapshot.records.find((record) => record.id === "okfdoc:global-guide") as {
      contentSha256: string;
      contentByteLength: number;
    };
    expect(globalRecord.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(globalRecord.contentByteLength).toBeGreaterThan(0);
  });

  it("isolates mission and channel scopes and preserves unresolved evidence links", () => {
    const adapter = new KnowledgeStoreSnapshotAdapter(makeStore());
    const mission = adapter.snapshot({ scope: "MISSION", missionId: "mission-alpha" });
    const channel = adapter.snapshot({ scope: "CHANNEL", channelId: "channel-alpha" });
    const global = adapter.snapshot({ scope: "GLOBAL" });

    expect(mission.records.map((record) => record.id)).toEqual(["okfdoc:mission-alpha"]);
    expect(channel.records.map((record) => record.id)).toEqual(["okfdoc:channel-alpha"]);
    const evidenceEdge = global.relationships.find((edge) => edge.relationType === "DOCUMENT_REFERENCES_EVIDENCE");
    expect(evidenceEdge).toMatchObject({
      fromId: "okfdoc:global-guide",
      targetRef: "artifact://render/fixture-1",
      resolved: false,
    });
    expect(validateKnowledgeOSSnapshot(mission)).toBe(true);
    expect(validateKnowledgeOSSnapshot(channel)).toBe(true);
  });

  it("resolves source links only to documents present in the selected snapshot", () => {
    const adapter = new KnowledgeStoreSnapshotAdapter(makeStore());
    const snapshot = adapter.snapshot({ scope: "GLOBAL" });
    const sourceEdge = snapshot.relationships.find((edge) => edge.relationType === "DOCUMENT_CITES_SOURCE");

    expect(sourceEdge).toMatchObject({
      fromId: "okfdoc:global-guide",
      toId: "okfdoc:source-guide",
      targetRef: "source-guide.md",
      resolved: true,
    });
    expect(validateKnowledgeOSSnapshot(snapshot)).toBe(true);
  });

  it("changes the digest when a document body changes without embedding that body in the snapshot", () => {
    const store = makeStore();
    const adapter = new KnowledgeStoreSnapshotAdapter(store);
    const before = adapter.snapshot({ scope: "GLOBAL" });
    const target = path.join(store.getRootDir(), "global-guide.md");
    writeFileSync(target, [
      "---",
      "id: global-guide",
      "sf_id: global-guide",
      "type: reference",
      "title: Global Guide",
      "status: stable",
      "tags: [retrieval, provenance]",
      "created_at: '2026-10-01T00:00:00.000Z'",
      "sources:",
      "  - id: source-guide",
      "    resource: source-guide.md",
      "evidence_refs:",
      "  - artifact://render/fixture-1",
      "---",
      "UPDATED_PRIVATE_BODY_NOT_STORED",
    ].join("\n"), "utf8");
    store.reload();
    const after = adapter.snapshot({ scope: "GLOBAL" });

    expect(after.contentDigest).not.toBe(before.contentDigest);
    expect(JSON.stringify(after)).not.toContain("UPDATED_PRIVATE_BODY_NOT_STORED");
  });
});
