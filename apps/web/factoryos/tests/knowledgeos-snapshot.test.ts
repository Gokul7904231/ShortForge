import { describe, expect, it } from "vitest";
import { KnowledgeOS } from "../core/knowledge/KnowledgeOS";

describe("KnowledgeOS provenance snapshots", () => {
  it("projects record links with explicit unresolved source relationships", () => {
    const knowledge = new KnowledgeOS();
    const source = knowledge.storeSource({
      url: "https://example.com/research",
      title: "Example research",
      publisher: "Example",
      snippet: "A provenance-bearing source.",
      reliabilityScore: 0.8,
      scope: "MISSION",
      missionId: "mission_snapshot",
    });
    const claim = knowledge.storeClaim({
      statement: "A claim grounded in a real source.",
      verificationStatus: "UNVERIFIED",
      sourceIds: [source.id, "src_missing"],
      confidence: 0.4,
      scope: "MISSION",
      missionId: "mission_snapshot",
    });
    knowledge.storeEvidence({
      evidenceType: "ARTIFACT_HASH",
      targetRef: "artifact://render/abc",
      sha256: "a".repeat(64),
      scope: "MISSION",
      missionId: "mission_snapshot",
    });

    const snapshot = knowledge.snapshot();
    const claimLinks = snapshot.relationships.filter((edge) => edge.fromId === claim.id);

    expect(snapshot.schemaVersion).toBe("knowledgeos.snapshot.v1");
    expect(snapshot.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.records.map((record) => record.id)).toEqual(
      [...snapshot.records.map((record) => record.id)].sort(),
    );
    expect(claimLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ toId: source.id, relationType: "CLAIM_CITES_SOURCE", resolved: true }),
      expect.objectContaining({ toId: "src_missing", relationType: "CLAIM_CITES_SOURCE", resolved: false }),
    ]));
    expect(snapshot.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relationType: "EVIDENCE_ATTESTS_REFERENCE",
        targetRef: "artifact://render/abc",
        resolved: true,
      }),
    ]));
  });

  it("produces stable content digests and reports additions, changes, and relationship deltas", () => {
    const knowledge = new KnowledgeOS();
    const source = knowledge.storeSource({
      url: "https://example.com/a",
      title: "A",
      publisher: "Example",
      snippet: "Initial source",
      reliabilityScore: 0.9,
      scope: "GLOBAL",
    });
    knowledge.storeClaim({
      statement: "Claim A",
      verificationStatus: "UNVERIFIED",
      sourceIds: [source.id],
      confidence: 0.5,
      scope: "GLOBAL",
    });

    const baseline = knowledge.snapshot();
    expect(knowledge.snapshot().contentDigest).toBe(baseline.contentDigest);

    knowledge.updateTopicSaturation("Agent retrieval", 0.2);
    const withTopic = knowledge.snapshot();
    const added = KnowledgeOS.diffSnapshots(baseline, withTopic);
    expect(added.addedRecordIds).toHaveLength(1);
    expect(added.baseDigest).toBe(baseline.contentDigest);
    expect(added.targetDigest).toBe(withTopic.contentDigest);

    knowledge.updateTopicSaturation("Agent retrieval", 0.85);
    const changedTopic = knowledge.snapshot();
    const changed = KnowledgeOS.diffSnapshots(withTopic, changedTopic);
    expect(changed.changedRecordIds).toHaveLength(1);
    expect(changed.addedRecordIds).toHaveLength(0);
    expect(changedTopic.contentDigest).not.toBe(withTopic.contentDigest);
  });
});
